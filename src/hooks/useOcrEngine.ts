import { useRef, useCallback, useEffect, useState } from 'react';
import { tryFixChecksum, fixOcrDigits } from '../utils/ocr.ts';

/* ================================================================
 *  Tesseract.js module resolution
 * ================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TessModule = any;

/** OCR engine state for UX feedback. */
export type OcrEngineState = 'idle' | 'loading' | 'ready' | 'fallback';

export interface ResolvedTesseract {
    createWorker: TessModule;
    recognize: TessModule;
    PSM: Record<string, string>;
}

export function resolveTesseractModule(mod: TessModule): ResolvedTesseract {
    const root = mod.createWorker ? mod : mod.default ?? mod;
    const createWorker = root.createWorker;
    const recognize = root.recognize;
    const PSM = root.PSM ?? {};
    if (!createWorker && !recognize) {
        throw new Error(
            `tesseract.js module resolution failed. `
            + `Keys: [${Object.keys(mod).join(', ')}], `
            + `default keys: [${mod.default ? Object.keys(mod.default).join(', ') : 'N/A'}]`
        );
    }
    return { createWorker, recognize, PSM };
}

/** Max time (ms) for a single OCR pass. Longer on mobile (slower CPU). */
const OCR_PASS_TIMEOUT = (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent)))
    ? 12000
    : 8000;

/** Worker creation timeout: longer on mobile (slower CPU/network). */
const WORKER_CREATION_TIMEOUT = (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent)))
    ? 45000
    : 30000;

/** Tesseract asset base — works with any Vite base (/, /spine-scanner/, etc.) */
const TESS_ASSET_BASE = (() => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
    return `${base}tesseract/`;
})();
const MAX_WORKER_RETRIES = 3;
/** Base delay (ms) for exponential backoff between worker creation retries. */
const RETRY_BASE_DELAY = 500;
/** PSM modes: 6=SINGLE_BLOCK (standard text), 7=SINGLE_LINE (ISBN/spine), 11=SPARSE_TEXT (scattered). */
export const PSM = { SINGLE_BLOCK: '6', SINGLE_LINE: '7', SPARSE_TEXT: '11' } as const;
/** Retries for transient recognize() failures before falling to one-shot. */
const RECOGNIZE_RETRIES = 2;
/** Max base64 image size (~5MB) to avoid Tesseract/memory issues. */
const MAX_IMAGE_DATA_LENGTH = 7_000_000;
/** Maximum number of cached OCR results (simple LRU). */
const OCR_CACHE_MAX = 30;

/** Extract per-symbol confidences (digits/X only) from Tesseract result data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSymbolConfidences(data: any): Array<{text: string, confidence: number}> | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let symbols: any[] | undefined;
    if (Array.isArray(data?.symbols)) {
        symbols = data.symbols;
    } else if (Array.isArray(data?.words)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        symbols = data.words.flatMap((w: any) => Array.isArray(w.symbols) ? w.symbols : []);
    }
    if (!symbols || symbols.length === 0) return undefined;
    const filtered = symbols
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((s: any) => typeof s.text === 'string' && /^[0-9X]$/.test(s.text))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => ({ text: s.text as string, confidence: s.confidence as number }));
    return filtered.length > 0 ? filtered : undefined;
}

/** Validate processedImage before passing to Tesseract. */
function isValidOcrInput(processedImage: string, addLog: (m: string) => void): boolean {
    if (typeof processedImage !== 'string' || processedImage.length === 0) {
        addLog('OCR input: empty or invalid');
        return false;
    }
    if (!processedImage.startsWith('data:image/')) {
        addLog('OCR input: expected data:image/ URL');
        return false;
    }
    if (processedImage.length > MAX_IMAGE_DATA_LENGTH) {
        addLog(`OCR input: too large (${(processedImage.length / 1024 / 1024).toFixed(1)}MB, max ~5MB)`);
        return false;
    }
    return true;
}

/** Promise that rejects after a timeout. Clears timer when promise settles to avoid leaks. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer != null) clearTimeout(timer);
    });
}

export interface OcrResult {
    isbn: string | null;
    allCandidates: string[];
    /** Tesseract confidence 0–100 for this pass. Used for ranking and early exit. */
    confidence?: number;
    /** Per-symbol confidence values from Tesseract, for targeted checksum repair. */
    symbolConfidences?: Array<{text: string, confidence: number}>;
}

interface UseOcrEngineOptions {
    addLog: (msg: string) => void;
    setStatus: (msg: string) => void;
    onOcrReady?: () => void;
}

/**
 * Custom hook that manages the Tesseract.js OCR engine lifecycle:
 * module loading, worker creation/retry, pre-warming, and OCR execution.
 */
export function useOcrEngine({ addLog, setStatus, onOcrReady }: UseOcrEngineOptions) {
    const tessModuleRef = useRef<ResolvedTesseract | null>(null);
    const tessModulePromise = useRef<Promise<ResolvedTesseract> | null>(null);
    const ocrCacheRef = useRef(new Map<string, OcrResult>());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerPromise = useRef<Promise<any> | null>(null);
    const workerRetries = useRef(0);
    const progressCallbackRef = useRef<((pct: number) => void) | null>(null);
    const [ocrState, setOcrState] = useState<OcrEngineState>('idle');

    const loadTessModule = useCallback(async (): Promise<ResolvedTesseract> => {
        if (tessModuleRef.current) return tessModuleRef.current;
        if (tessModulePromise.current) return tessModulePromise.current;

        tessModulePromise.current = (async () => {
            addLog('Loading OCR module...');
            const raw = await import('tesseract.js');
            const resolved = resolveTesseractModule(raw);
            addLog(`OCR module loaded (createWorker: ${!!resolved.createWorker}, recognize: ${!!resolved.recognize}, PSM keys: ${Object.keys(resolved.PSM).length})`);
            tessModuleRef.current = resolved;
            tessModulePromise.current = null;
            return resolved;
        })();

        return tessModulePromise.current;
    }, [addLog]);

    const getWorker = useCallback(async (): Promise<ReturnType<TessModule['createWorker']> | null> => {
        if (workerRef.current) return workerRef.current;
        if (workerRetries.current >= MAX_WORKER_RETRIES) return null;
        if (workerPromise.current) return workerPromise.current;

        workerPromise.current = (async () => {
            try {
                const tess = await loadTessModule();
                if (!tess.createWorker) {
                    addLog('createWorker not available, will use recognize() fallback');
                    workerRetries.current = MAX_WORKER_RETRIES;
                    return null;
                }

                const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
                const coreURL = new URL(TESS_ASSET_BASE, window.location.href).href;
                addLog(`Creating OCR worker (attempt ${workerRetries.current + 1}/${MAX_WORKER_RETRIES}, assets: ${workerURL.substring(0, 50)}...)`);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const worker: any = await withTimeout(
                    tess.createWorker('eng', 1, {
                        workerPath: workerURL,
                        corePath: coreURL,
                        logger: (m: { status: string; progress?: number }) => {
                            if (m.status === 'loading tesseract core') setStatus('Loading OCR engine...');
                            else if (m.status === 'loading language traineddata') setStatus('Downloading language data...');
                            else if (m.status === 'initializing tesseract') setStatus('Initializing OCR...');
                            else if (m.status === 'recognizing text' && m.progress != null) {
                                setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
                                progressCallbackRef.current?.(m.progress);
                            }
                        },
                    }),
                    WORKER_CREATION_TIMEOUT,
                    'Worker creation'
                );

                await worker.setParameters({ tessedit_pageseg_mode: tess.PSM?.SINGLE_BLOCK ?? PSM.SINGLE_BLOCK });

                addLog('OCR worker ready');
                workerRef.current = worker;
                workerRetries.current = 0;
                workerPromise.current = null;
                onOcrReady?.();
                return worker;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                workerRetries.current += 1;
                const delay = RETRY_BASE_DELAY * Math.pow(2, workerRetries.current - 1);
                addLog(`Worker creation failed (${workerRetries.current}/${MAX_WORKER_RETRIES}): ${msg}. Retry in ${delay}ms`);
                workerPromise.current = null;
                if (workerRetries.current < MAX_WORKER_RETRIES) {
                    await new Promise(r => setTimeout(r, delay));
                    return getWorker();
                }
                return null;
            }
        })();

        return workerPromise.current;
    }, [loadTessModule, addLog, setStatus, onOcrReady]);

    /** Pre-warm the OCR engine when capture is ready (e.g. camera on mount / cameraReady). Creates and reuses worker across passes. Prefetches eng traineddata for offline. */
    const preWarm = useCallback(async () => {
        setOcrState('loading');
        addLog('Pre-warming OCR engine...');
        // Prefetch eng traineddata so it's cached before first scan (helps offline after first load)
        const langUrl = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
        fetch(langUrl, { mode: 'cors' }).catch(() => {}); // Fire-and-forget; worker will fetch again if needed
        try {
            const w = await getWorker();
            if (w) {
                addLog('OCR engine pre-warmed and ready');
                setOcrState('ready');
                onOcrReady?.();
            } else {
                addLog('OCR worker unavailable — will use fallback on scan');
                setOcrState('fallback');
                onOcrReady?.();
            }
        } catch (err) {
            addLog(`Pre-warm failed: ${err instanceof Error ? err.message : String(err)}`);
            setOcrState('fallback');
        }
    }, [getWorker, addLog, onOcrReady]);

    // Terminate worker on unmount
    useEffect(() => {
        return () => { workerRef.current?.terminate?.().catch(() => {}); };
    }, []);

    /** Run OCR on a preprocessed image and extract ISBN candidates. */
    const runOcr = useCallback(async (
        processedImage: string,
        label: string,
        extractIsbnCandidates: (text: string) => string[],
        isValidIsbn: (isbn: string) => boolean,
        options?: { psm?: string; charWhitelist?: string; onRecognizeProgress?: (pct: number) => void },
    ): Promise<OcrResult> => {
        const psmOverride = options?.psm;
        const charWhitelist = options?.charWhitelist;
        progressCallbackRef.current = options?.onRecognizeProgress ?? null;
        let text = '';

        if (!isValidOcrInput(processedImage, addLog)) {
            return { isbn: null, allCandidates: [], confidence: undefined };
        }

        // Cache lookup: fast approximate key from bookend chars + length
        const cacheKey = processedImage.slice(0, 200) + processedImage.slice(-200) + ':' + processedImage.length;
        const cached = ocrCacheRef.current.get(cacheKey);
        if (cached) {
            addLog(`[${label}] OCR cache hit`);
            return cached;
        }

        try {
        // Path A: Persistent worker
        let currentWorker = await getWorker();
        let confidence: number | undefined;
        let symbolConfidences: Array<{text: string, confidence: number}> | undefined;
        if (currentWorker) {
            const params: Record<string, string> = { tessedit_pageseg_mode: psmOverride ?? PSM.SINGLE_BLOCK };
            if (charWhitelist) params.tessedit_char_whitelist = charWhitelist;

            for (let attempt = 0; attempt < RECOGNIZE_RETRIES && !text; attempt++) {
                try {
                    await currentWorker.setParameters(params);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await withTimeout(
                        currentWorker.recognize(processedImage),
                        OCR_PASS_TIMEOUT,
                        `OCR ${label}`
                    );
                    text = result.data.text;
                    confidence = typeof result.data?.confidence === 'number' ? result.data.confidence : undefined;
                    symbolConfidences = extractSymbolConfidences(result.data);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    addLog(`Worker recognize failed (attempt ${attempt + 1}/${RECOGNIZE_RETRIES}): ${msg}`);
                    if (attempt < RECOGNIZE_RETRIES - 1) {
                        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
                        addLog(`Retrying in ${delay}ms (exponential backoff)`);
                        await new Promise(r => setTimeout(r, delay));
                        // Reuse same worker for retries; only terminate when giving up
                    } else {
                        currentWorker.terminate?.().catch(() => {});
                        workerRef.current = null;
                        addLog('Worker terminated after exhausting retries — will use fallback');
                    }
                }
            }
        }

        // Path B: One-shot recognize() fallback — use local worker/core paths so it works offline
        if (!text) {
            try {
                const tess = await loadTessModule();
                if (tess.recognize) {
                    addLog(`[${label}] Using one-shot recognize() fallback`);
                    const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
                    const coreURL = new URL(TESS_ASSET_BASE, window.location.href).href;
                    const recognizeOptions: Record<string, unknown> = {
                        workerPath: workerURL,
                        corePath: coreURL,
                        logger: (m: { status: string; progress?: number }) => {
                            if (m.status === 'recognizing text' && m.progress != null) {
                                setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
                                progressCallbackRef.current?.(m.progress);
                            }
                        },
                    };
                    (recognizeOptions as Record<string, unknown>).tessedit_pageseg_mode = psmOverride ?? PSM.SINGLE_BLOCK;
                    if (charWhitelist) (recognizeOptions as Record<string, unknown>).tessedit_char_whitelist = charWhitelist;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await withTimeout(
                        tess.recognize(processedImage, 'eng', recognizeOptions),
                        OCR_PASS_TIMEOUT,
                        `OCR fallback ${label}`
                    );
                    text = result?.data?.text ?? '';
                    if (typeof result?.data?.confidence === 'number') confidence = result.data.confidence;
                    if (!symbolConfidences) symbolConfidences = extractSymbolConfidences(result?.data);
                }
            } catch (err) {
                addLog(`One-shot recognize failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const trimmed = text.trim();
        if (trimmed) addLog(`[${label}] OCR text: "${trimmed.substring(0, 120)}"`);
        else addLog(`[${label}] OCR returned empty text`);

        const candidates = extractIsbnCandidates(trimmed);
        if (candidates.length > 0) addLog(`[${label}] candidates: ${candidates.slice(0, 4).join(', ')}${confidence != null ? ` conf=${confidence}` : ''}`);

        // Confidence-weighted: prefer valid ISBN with higher confidence when multiple exist
        const validCandidates = candidates.filter(c => isValidIsbn(c));
        let validIsbn: string | null = validCandidates.length === 0 ? null
            : validCandidates.length === 1 ? validCandidates[0]
            : confidence != null
                ? validCandidates[0] // already ranked by extractIsbnCandidates; confidence applies to whole pass
                : validCandidates[0];

        // Checksum repair for near-valid ISBN candidates when no valid ISBN found:
        // 1) Try digit normalization (O→0, I→1, etc) then 2) tryFixChecksum for single-digit fixes
        if (!validIsbn && candidates.length > 0) {
            for (const c of candidates) {
                const normalized = fixOcrDigits(c).replace(/[^0-9X]/g, '');
                if (normalized.length === 10 || normalized.length === 13) {
                    if (isValidIsbn(normalized)) {
                        addLog(`[${label}] digit normalization: ${c} → ${normalized}`);
                        validIsbn = normalized;
                        break;
                    }
                }
                const repaired = tryFixChecksum(c);
                if (repaired) {
                    addLog(`[${label}] checksum repair: ${c} → ${repaired}`);
                    validIsbn = repaired;
                    break;
                }
            }
        }
        const ocrResult: OcrResult = { isbn: validIsbn, allCandidates: candidates, confidence, symbolConfidences };

        // Store in cache; evict oldest if over limit
        ocrCacheRef.current.set(cacheKey, ocrResult);
        if (ocrCacheRef.current.size > OCR_CACHE_MAX) {
            const oldest = ocrCacheRef.current.keys().next().value;
            if (oldest !== undefined) ocrCacheRef.current.delete(oldest);
        }

        return ocrResult;
        } finally {
            progressCallbackRef.current = null;
        }
    }, [getWorker, loadTessModule, addLog, setStatus]);

    /** Run OCR with alternative language (e.g. eng+deu for German books). Uses one-shot recognize. */
    const runOcrWithLang = useCallback(async (
        processedImage: string,
        label: string,
        lang: string,
        extractIsbnCandidates: (text: string) => string[],
        isValidIsbn: (isbn: string) => boolean,
    ): Promise<OcrResult> => {
        let text = '';
        let confidence: number | undefined;
        if (!isValidOcrInput(processedImage, addLog)) {
            return { isbn: null, allCandidates: [], confidence };
        }
        try {
            const tess = await loadTessModule();
            if (!tess.recognize) return { isbn: null, allCandidates: [], confidence };
            addLog(`[${label}] OCR with lang=${lang} (multi-language fallback)`);
            const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
            const coreURL = new URL(TESS_ASSET_BASE, window.location.href).href;
            const recognizeOptions: Record<string, unknown> = {
                workerPath: workerURL,
                corePath: coreURL,
                tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // SINGLE_BLOCK for mixed-language text
                logger: (m: { status: string; progress?: number }) => {
                    if (m.status === 'recognizing text' && m.progress) setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
                },
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = await withTimeout(
                tess.recognize(processedImage, lang, recognizeOptions),
                OCR_PASS_TIMEOUT,
                `OCR ${label} (${lang})`
            );
            text = result?.data?.text ?? '';
            if (typeof result?.data?.confidence === 'number') confidence = result.data.confidence;
        } catch (err) {
            addLog(`Multi-lang OCR (${lang}) failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        const trimmed = text.trim();
        const candidates = extractIsbnCandidates(trimmed);
        const validIsbn = candidates.find(c => isValidIsbn(c)) ?? null;
        return { isbn: validIsbn, allCandidates: candidates, confidence };
    }, [loadTessModule, addLog, setStatus]);

    return { preWarm, runOcr, runOcrWithLang, getWorker, ocrState };
}
