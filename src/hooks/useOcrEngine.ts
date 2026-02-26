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
/** Number of persistent workers in the pool. 2 enables parallel OCR passes. */
const WORKER_POOL_SIZE = 2;
/** Max cached OCR results. Each entry is keyed by image fingerprint + options. */
const OCR_CACHE_SIZE = 40;

/** Promise that rejects after a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
        ),
    ]);
}

/**
 * Lightweight image fingerprint for OCR result caching.
 * Uses the first+last 120 chars of the data URL plus its total length —
 * practically collision-free for different canvas renders.
 */
function imageFingerprint(dataUrl: string, extra: string): string {
    return `${dataUrl.slice(0, 120)}|${dataUrl.slice(-60)}|${dataUrl.length}|${extra}`;
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

/* ================================================================
 *  Worker pool entry
 * ================================================================ */

interface PoolWorker {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker: any;
    busy: boolean;
    retries: number;
}

/**
 * Custom hook that manages the Tesseract.js OCR engine lifecycle:
 * module loading, 2-worker pool creation/retry, pre-warming, OCR execution,
 * and a per-session result cache to skip redundant passes on identical frames.
 */
export function useOcrEngine({ addLog, setStatus, onOcrReady }: UseOcrEngineOptions) {
    const tessModuleRef = useRef<ResolvedTesseract | null>(null);
    const tessModulePromise = useRef<Promise<ResolvedTesseract> | null>(null);
    /** Worker pool — size WORKER_POOL_SIZE. Null slots are uninitialized or dead. */
    const poolRef = useRef<(PoolWorker | null)[]>(Array(WORKER_POOL_SIZE).fill(null));
    const poolPromises = useRef<(Promise<PoolWorker | null> | null)[]>(Array(WORKER_POOL_SIZE).fill(null));
    /** Global retries across all pool slots for circuit-breaker logic. */
    const globalRetriesRef = useRef(0);
    /** Per-session OCR result cache keyed by image fingerprint. */
    const ocrCacheRef = useRef<Map<string, OcrResult>>(new Map());

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

    /** Create a single Tesseract worker and return a PoolWorker entry. */
    const createPoolWorker = useCallback(async (slotIndex: number): Promise<PoolWorker | null> => {
        const slot = poolRef.current[slotIndex];
        if (slot?.worker && !slot.busy) return slot;
        if (globalRetriesRef.current >= MAX_WORKER_RETRIES * WORKER_POOL_SIZE) return null;

        try {
            const tess = await loadTessModule();
            if (!tess.createWorker) {
                addLog('createWorker not available, will use recognize() fallback');
                globalRetriesRef.current = MAX_WORKER_RETRIES * WORKER_POOL_SIZE;
                return null;
            }

            const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
            const coreURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
            const langURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
            addLog(`Creating OCR worker [slot ${slotIndex}] (assets: ${workerURL.substring(0, 50)}...)`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const worker: any = await withTimeout(
                tess.createWorker('eng', 1, {
                    workerPath: workerURL,
                    corePath:   coreURL,
                    // Serve eng.traineddata locally if it was downloaded by copy-tesseract-assets.mjs.
                    // Tesseract appends "/{lang}.traineddata.gz" to this base URL.
                    langPath:   langURL,
                    logger: (m: { status: string; progress?: number }) => {
                        if (m.status === 'loading tesseract core')       setStatus('Loading OCR engine...');
                        else if (m.status === 'loading language traineddata') setStatus('Loading language data...');
                        else if (m.status === 'initializing tesseract')  setStatus('Initializing OCR...');
                        else if (m.status === 'recognizing text' && m.progress) setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
                    },
                }),
                WORKER_CREATION_TIMEOUT,
                `Worker [slot ${slotIndex}] creation`
            );

            await worker.setParameters({ tessedit_pageseg_mode: tess.PSM.SINGLE_BLOCK || '6' });

            addLog(`OCR worker [slot ${slotIndex}] ready`);
            const entry: PoolWorker = { worker, busy: false, retries: 0 };
            poolRef.current[slotIndex] = entry;
            poolPromises.current[slotIndex] = null;
            if (slotIndex === 0) onOcrReady?.(); // Signal ready on first worker
            return entry;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            globalRetriesRef.current += 1;
            const delay = RETRY_BASE_DELAY * Math.pow(2, globalRetriesRef.current - 1);
            addLog(`Worker [slot ${slotIndex}] creation failed: ${msg}. Retry in ${delay}ms`);
            poolPromises.current[slotIndex] = null;
            if (globalRetriesRef.current < MAX_WORKER_RETRIES * WORKER_POOL_SIZE) {
                await new Promise(r => setTimeout(r, delay));
                return createPoolWorker(slotIndex);
            }
            return null;
        }
    }, [loadTessModule, addLog, setStatus, onOcrReady]);

    /**
     * Acquire a free worker from the pool.
     * Returns the first non-busy slot, or null if all are busy or unavailable.
     * Callers must set entry.busy = true and reset it when done.
     */
    const acquireWorker = useCallback(async (): Promise<PoolWorker | null> => {
        // Try to find an existing free worker
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            const slot = poolRef.current[i];
            if (slot?.worker && !slot.busy) return slot;
        }
        // Try to initialise any un-created slot
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            if (!poolRef.current[i] && !poolPromises.current[i]) {
                poolPromises.current[i] = createPoolWorker(i);
                const result = await poolPromises.current[i];
                if (result) return result;
            }
        }
        // Wait on any in-progress creation
        const pending = poolPromises.current.filter(Boolean);
        if (pending.length > 0) {
            const results = await Promise.race(pending.map(p => p!));
            if (results) return results;
        }
        // Last resort: wait for a busy worker to free up (poll with backoff)
        for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            const slot = poolRef.current.find(s => s?.worker && !s.busy);
            if (slot) return slot;
        }
        return null;
    }, [createPoolWorker]);

    /** Pre-warm the OCR engine by initialising all pool workers. */
    const preWarm = useCallback(async () => {
        addLog('Pre-warming OCR engine...');
        // Initialise all pool slots concurrently
        const results = await Promise.allSettled(
            Array.from({ length: WORKER_POOL_SIZE }, (_, i) => createPoolWorker(i))
        );
        const ready = results.filter(r => r.status === 'fulfilled' && r.value?.worker).length;
        if (ready > 0) {
            addLog(`OCR engine pre-warmed: ${ready}/${WORKER_POOL_SIZE} workers ready`);
            onOcrReady?.();
        } else {
            addLog('OCR workers unavailable — will use fallback on scan');
        }
    }, [createPoolWorker, addLog, onOcrReady]);

    // Terminate all pool workers on unmount
    useEffect(() => {
        return () => {
            for (const slot of poolRef.current) {
                slot?.worker?.terminate?.().catch(() => {});
            }
        };
    }, []);

    /** Run OCR on a preprocessed image and extract ISBN candidates. */
    const runOcr = useCallback(async (
        processedImage: string,
        label: string,
        extractIsbnCandidates: (text: string) => string[],
        isValidIsbn: (isbn: string) => boolean,
        options?: { psm?: string; charWhitelist?: string },
    ): Promise<OcrResult> => {
        const psmOverride    = options?.psm;
        const charWhitelist  = options?.charWhitelist;
        const cacheKey       = imageFingerprint(processedImage, `${psmOverride}:${charWhitelist}`);

        // ── Cache hit ──────────────────────────────────────────
        if (ocrCacheRef.current.has(cacheKey)) {
            addLog(`[${label}] OCR cache hit`);
            return ocrCacheRef.current.get(cacheKey)!;
        }

        let text = '';
        let confidence: number | undefined;

        // ── Path A: Pool worker ────────────────────────────────
        const poolEntry = await acquireWorker();
        if (poolEntry) {
            poolEntry.busy = true;
            try {
                const params: Record<string, string> = { tessedit_pageseg_mode: psmOverride ?? '6' };
                if (charWhitelist) params.tessedit_char_whitelist = charWhitelist;
                await poolEntry.worker.setParameters(params);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result: any = await withTimeout(
                    poolEntry.worker.recognize(processedImage),
                    OCR_PASS_TIMEOUT,
                    `OCR ${label}`
                );
                text = result.data.text;
                confidence = typeof result.data?.confidence === 'number' ? result.data.confidence : undefined;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                addLog(`Worker recognize failed: ${msg}`);
                // Terminate the hanging worker to free Web Worker + WASM memory.
                poolEntry.worker.terminate?.().catch(() => {});
                // Remove from pool so it gets recreated on next acquireWorker()
                const idx = poolRef.current.indexOf(poolEntry);
                if (idx !== -1) poolRef.current[idx] = null;
            } finally {
                poolEntry.busy = false;
            }
        }

        // ── Path B: One-shot recognize() fallback ──────────────
        if (!text) {
            try {
                const tess = await loadTessModule();
                if (tess.recognize) {
                    addLog(`[${label}] Using one-shot recognize() fallback`);
                    const workerURL = new URL(`${TESS_ASSET_BASE}worker.min.js`, window.location.href).href;
                    const coreURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
                    const langURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
                    const recognizeOptions: Record<string, unknown> = {
                        workerPath: workerURL,
                        corePath:   coreURL,
                        langPath:   langURL,
                        logger: (m: { status: string; progress?: number }) => {
                            if (m.status === 'recognizing text' && m.progress)
                                setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
                        },
                    };
                    if (psmOverride)   recognizeOptions.tessedit_pageseg_mode  = psmOverride;
                    if (charWhitelist) recognizeOptions.tessedit_char_whitelist = charWhitelist;
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
        else         addLog(`[${label}] OCR returned empty text`);

        const candidates  = extractIsbnCandidates(trimmed);
        if (candidates.length > 0) addLog(`[${label}] candidates: ${candidates.slice(0, 4).join(', ')}${confidence != null ? ` conf=${confidence}` : ''}`);

        const validIsbn = candidates.find(c => isValidIsbn(c)) ?? null;
        const ocrResult: OcrResult = { isbn: validIsbn, allCandidates: candidates, confidence };

        // ── Cache store (evict oldest when full) ───────────────
        ocrCacheRef.current.set(cacheKey, ocrResult);
        if (ocrCacheRef.current.size > OCR_CACHE_SIZE) {
            ocrCacheRef.current.delete(ocrCacheRef.current.keys().next().value!);
        }

        return ocrResult;
    }, [acquireWorker, loadTessModule, addLog, setStatus]);

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
            const coreURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
            const langURL   = new URL(TESS_ASSET_BASE, window.location.href).href;
            const recognizeOptions: Record<string, unknown> = {
                workerPath: workerURL,
                corePath:   coreURL,
                langPath:   langURL,
                tessedit_pageseg_mode: '6',
                logger: (m: { status: string; progress?: number }) => {
                    if (m.status === 'recognizing text' && m.progress)
                        setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
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
        const trimmed  = text.trim();
        const candidates = extractIsbnCandidates(trimmed);
        const validIsbn  = candidates.find(c => isValidIsbn(c)) ?? null;
        return { isbn: validIsbn, allCandidates: candidates, confidence };
    }, [loadTessModule, addLog, setStatus]);

    // Expose getWorker for backward-compat (tests, DebugPanel)
    const getWorker = useCallback(async () => {
        const entry = await acquireWorker();
        return entry?.worker ?? null;
    }, [acquireWorker]);

    return { preWarm, runOcr, runOcrWithLang, getWorker };
}
