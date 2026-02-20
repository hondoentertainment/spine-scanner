import { useRef, useCallback, useEffect } from 'react';

/* ================================================================
 *  Tesseract.js module resolution
 * ================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TessModule = any;

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

/** Promise that rejects after a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
        ),
    ]);
}

export interface OcrResult {
    isbn: string | null;
    allCandidates: string[];
    /** Tesseract confidence 0–100 for this pass. Used for ranking and early exit. */
    confidence?: number;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerPromise = useRef<Promise<any> | null>(null);
    const workerRetries = useRef(0);

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
                            else if (m.status === 'recognizing text' && m.progress) setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
                        },
                    }),
                    WORKER_CREATION_TIMEOUT,
                    'Worker creation'
                );

                await worker.setParameters({ tessedit_pageseg_mode: tess.PSM.SINGLE_BLOCK || '6' });

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

    /** Pre-warm the OCR engine (call when camera is ready). Also prefetches eng traineddata for offline. */
    const preWarm = useCallback(async () => {
        addLog('Pre-warming OCR engine...');
        // Prefetch eng traineddata so it's cached before first scan (helps offline after first load)
        const langUrl = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
        fetch(langUrl, { mode: 'cors' }).catch(() => {}); // Fire-and-forget; worker will fetch again if needed
        try {
            const w = await getWorker();
            if (w) {
                addLog('OCR engine pre-warmed and ready');
                onOcrReady?.();
            } else {
                addLog('OCR worker unavailable — will use fallback on scan');
            }
        } catch (err) {
            addLog(`Pre-warm failed: ${err instanceof Error ? err.message : String(err)}`);
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
        options?: { psm?: string; charWhitelist?: string },
    ): Promise<OcrResult> => {
        const psmOverride = options?.psm;
        const charWhitelist = options?.charWhitelist;
        let text = '';

        // Path A: Persistent worker
        const worker = await getWorker();
        let confidence: number | undefined;
        if (worker) {
            try {
                const params: Record<string, string> = { tessedit_pageseg_mode: psmOverride ?? '6' };
                if (charWhitelist) params.tessedit_char_whitelist = charWhitelist;
                await worker.setParameters(params);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result: any = await withTimeout(
                    worker.recognize(processedImage),
                    OCR_PASS_TIMEOUT,
                    `OCR ${label}`
                );
                text = result.data.text;
                confidence = typeof result.data?.confidence === 'number' ? result.data.confidence : undefined;
            } catch (err) {
                addLog(`Worker recognize failed: ${err instanceof Error ? err.message : String(err)}`);
                workerRef.current = null;
                workerRetries.current = Math.max(0, workerRetries.current - 1);
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
                            if (m.status === 'recognizing text' && m.progress) {
                                setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
                            }
                        },
                    };
                    if (psmOverride) (recognizeOptions as Record<string, unknown>).tessedit_pageseg_mode = psmOverride;
                    if (charWhitelist) (recognizeOptions as Record<string, unknown>).tessedit_char_whitelist = charWhitelist;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await withTimeout(
                        tess.recognize(processedImage, 'eng', recognizeOptions),
                        OCR_PASS_TIMEOUT,
                        `OCR fallback ${label}`
                    );
                    text = result.data.text;
                    if (typeof result.data?.confidence === 'number') confidence = result.data.confidence;
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
        const validIsbn = validCandidates.length === 0 ? null
            : validCandidates.length === 1 ? validCandidates[0]
            : confidence != null
                ? validCandidates[0] // already ranked by extractIsbnCandidates; confidence applies to whole pass
                : validCandidates[0];
        return { isbn: validIsbn, allCandidates: candidates, confidence };
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
        try {
            const tess = await loadTessModule();
            if (!tess.recognize) return { isbn: null, allCandidates: [], confidence };
            addLog(`[${label}] OCR with lang=${lang} (multi-language fallback)`);
            const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
            const coreURL = new URL(TESS_ASSET_BASE, window.location.href).href;
            const recognizeOptions: Record<string, unknown> = {
                workerPath: workerURL,
                corePath: coreURL,
                tessedit_pageseg_mode: '6', // SINGLE_BLOCK for mixed text
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
            text = result.data.text;
            if (typeof result.data?.confidence === 'number') confidence = result.data.confidence;
        } catch (err) {
            addLog(`Multi-lang OCR (${lang}) failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        const trimmed = text.trim();
        const candidates = extractIsbnCandidates(trimmed);
        const validIsbn = candidates.find(c => isValidIsbn(c)) ?? null;
        return { isbn: validIsbn, allCandidates: candidates, confidence };
    }, [loadTessModule, addLog, setStatus]);

    return { preWarm, runOcr, runOcrWithLang, getWorker };
}
