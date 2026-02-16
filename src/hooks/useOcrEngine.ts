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

/** Max time (ms) for a single OCR pass before moving on. */
const OCR_PASS_TIMEOUT = 8000;

const TESS_ASSET_BASE = `${import.meta.env.BASE_URL}tesseract/`.replace('//', '/');
const MAX_WORKER_RETRIES = 3;

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
}

interface UseOcrEngineOptions {
    addLog: (msg: string) => void;
    setStatus: (msg: string) => void;
}

/**
 * Custom hook that manages the Tesseract.js OCR engine lifecycle:
 * module loading, worker creation/retry, pre-warming, and OCR execution.
 */
export function useOcrEngine({ addLog, setStatus }: UseOcrEngineOptions) {
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

    const getWorker = useCallback(async () => {
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
                    30000,
                    'Worker creation'
                );

                await worker.setParameters({ tessedit_pageseg_mode: tess.PSM.SINGLE_BLOCK || '6' });

                addLog('OCR worker ready');
                workerRef.current = worker;
                workerRetries.current = 0;
                workerPromise.current = null;
                return worker;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                workerRetries.current += 1;
                addLog(`Worker creation failed (${workerRetries.current}/${MAX_WORKER_RETRIES}): ${msg}`);
                workerPromise.current = null;
                return null;
            }
        })();

        return workerPromise.current;
    }, [loadTessModule, addLog, setStatus]);

    /** Pre-warm the OCR engine (call when camera is ready). */
    const preWarm = useCallback(async () => {
        addLog('Pre-warming OCR engine...');
        try {
            const w = await getWorker();
            if (w) addLog('OCR engine pre-warmed and ready');
            else addLog('OCR worker unavailable — will use fallback on scan');
        } catch (err) {
            addLog(`Pre-warm failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [getWorker, addLog]);

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
    ): Promise<OcrResult> => {
        let text = '';

        // Path A: Persistent worker
        const worker = await getWorker();
        if (worker) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result: any = await withTimeout(
                    worker.recognize(processedImage),
                    OCR_PASS_TIMEOUT,
                    `OCR ${label}`
                );
                text = result.data.text;
            } catch (err) {
                addLog(`Worker recognize failed: ${err instanceof Error ? err.message : String(err)}`);
                workerRef.current = null;
                workerRetries.current = Math.max(0, workerRetries.current - 1);
            }
        }

        // Path B: One-shot recognize() fallback
        if (!text) {
            try {
                const tess = await loadTessModule();
                if (tess.recognize) {
                    addLog(`[${label}] Using one-shot recognize() fallback`);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await withTimeout(
                        tess.recognize(processedImage, 'eng', {
                            logger: (m: { status: string; progress?: number }) => {
                                if (m.status === 'recognizing text' && m.progress) {
                                    setStatus(`OCR (${label}): ${Math.round(m.progress * 100)}%`);
                                }
                            },
                        }),
                        OCR_PASS_TIMEOUT,
                        `OCR fallback ${label}`
                    );
                    text = result.data.text;
                }
            } catch (err) {
                addLog(`One-shot recognize failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const trimmed = text.trim();
        if (trimmed) addLog(`[${label}] OCR text: "${trimmed.substring(0, 120)}"`);
        else addLog(`[${label}] OCR returned empty text`);

        const candidates = extractIsbnCandidates(trimmed);
        if (candidates.length > 0) addLog(`[${label}] candidates: ${candidates.slice(0, 4).join(', ')}`);

        const validIsbn = candidates.find(c => isValidIsbn(c));
        return { isbn: validIsbn ?? null, allCandidates: candidates };
    }, [getWorker, loadTessModule, addLog, setStatus]);

    return { preWarm, runOcr, getWorker };
}
