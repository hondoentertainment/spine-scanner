import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, Loader2, Edit3, Check, Terminal, Play, Square, ImagePlus, Zap } from 'lucide-react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates, tryFixChecksum } from '../utils/ocr.ts';
import { useToast } from './Toast.tsx';
import s from './Scanner.module.css';

/* ================================================================
 *  Types
 * ================================================================ */

interface ScannerProps {
    onScan: (isbn: string) => void;
    isScanning: boolean;
}

interface CropRegion {
    widthFrac: number;
    heightFrac: number;
    label: string;
}

/* ================================================================
 *  Constants
 * ================================================================ */

const CROP_NARROW: CropRegion = { widthFrac: 0.92, heightFrac: 0.28, label: 'narrow' };
const CROP_MEDIUM: CropRegion = { widthFrac: 0.94, heightFrac: 0.50, label: 'medium' };
const CROP_WIDE: CropRegion   = { widthFrac: 0.96, heightFrac: 0.75, label: 'wide' };
const CROP_FULL: CropRegion   = { widthFrac: 1.00, heightFrac: 1.00, label: 'full' };
const CROP_CENTER: CropRegion = { widthFrac: 0.70, heightFrac: 0.40, label: 'center' };

/** Max time (ms) for a single OCR pass before moving on. */
const OCR_PASS_TIMEOUT = 8000;

/** Max time (ms) for the entire OCR pipeline. */
const OCR_TOTAL_TIMEOUT = 35000;

/** Interval (ms) between continuous barcode scans. ~4fps */
const BARCODE_SCAN_INTERVAL = 250;

/**
 * Build local asset paths for Tesseract.js.
 */
const TESS_ASSET_BASE = `${import.meta.env.BASE_URL}tesseract/`.replace('//', '/');

const getVideoConstraints = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return {
        facingMode: 'environment',
        width: isMobile ? { ideal: 1920 } : { ideal: 1920 },
        height: isMobile ? { ideal: 1080 } : { ideal: 1080 },
    };
};

/* ================================================================
 *  Image preprocessing helpers
 * ================================================================ */

type PreprocessMode = 'clean' | 'enhanced' | 'boost' | 'invert' | 'sharpen';

const PREPROCESS_FILTERS: Record<PreprocessMode, string> = {
    clean:    'grayscale(100%) contrast(110%)',
    enhanced: 'grayscale(100%) contrast(140%) brightness(108%)',
    boost:    'grayscale(100%) contrast(180%) brightness(115%)',
    invert:   'grayscale(100%) contrast(130%) invert(100%)',
    sharpen:  'grayscale(100%) contrast(130%) brightness(105%)',
};

const getAdaptiveScale = (imgWidth: number): number => {
    if (imgWidth >= 1920) return 1.5;
    if (imgWidth >= 1280) return 2;
    if (imgWidth >= 640) return 2.5;
    return 3;
};

const preprocessImage = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    rotateDeg: number,
    crop: CropRegion,
    mode: PreprocessMode = 'clean',
): string => {
    const ctx = canvas.getContext('2d')!;
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    const scale = getAdaptiveScale(img.width);
    const outW = cropW * scale;
    const outH = cropH * scale;

    if (rotateDeg === 90 || rotateDeg === 270) {
        canvas.width = outH;
        canvas.height = outW;
    } else {
        canvas.width = outW;
        canvas.height = outH;
    }

    ctx.save();
    if (rotateDeg !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotateDeg * Math.PI) / 180);
        ctx.translate(-outW / 2, -outH / 2);
    }

    ctx.filter = PREPROCESS_FILTERS[mode];
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    // For "sharpen" mode: apply sharpening kernel
    if (mode === 'sharpen' && typeof ctx.getImageData === 'function') {
        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const w = canvas.width;
            const src = new Uint8ClampedArray(data);
            for (let y = 1; y < canvas.height - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = (y * w + x) * 4;
                    for (let c = 0; c < 3; c++) {
                        const val = 5 * src[i + c]
                            - src[((y - 1) * w + x) * 4 + c]
                            - src[((y + 1) * w + x) * 4 + c]
                            - src[(y * w + (x - 1)) * 4 + c]
                            - src[(y * w + (x + 1)) * 4 + c];
                        data[i + c] = Math.min(255, Math.max(0, val));
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        } catch {
            // getImageData not available — skip sharpening
        }
    }

    return canvas.toDataURL('image/png');
};

const detectBrightness = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    crop: CropRegion,
): number => {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.getImageData !== 'function') return 128;
        const cropX = img.width * (1 - crop.widthFrac) / 2;
        const cropY = img.height * (1 - crop.heightFrac) / 2;
        const cropW = img.width * crop.widthFrac;
        const cropH = img.height * crop.heightFrac;
        const sampleW = Math.min(cropW, 200);
        const sampleH = Math.min(cropH, 150);
        canvas.width = sampleW;
        canvas.height = sampleH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        let total = 0;
        for (let i = 0; i < imgData.data.length; i += 4) {
            total += imgData.data[i];
        }
        return total / (imgData.data.length / 4);
    } catch {
        return 128;
    }
};

/** Crop for barcode — no filters. */
const cropForBarcode = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    crop: CropRegion,
): string => {
    const ctx = canvas.getContext('2d')!;
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    canvas.width = cropW;
    canvas.height = cropH;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return canvas.toDataURL('image/png');
};

/** Promise that rejects after a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
        ),
    ]);
}

/* ================================================================
 *  Tesseract.js module resolution
 * ================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TessModule = any;

interface ResolvedTesseract {
    createWorker: TessModule;
    recognize: TessModule;
    PSM: Record<string, string>;
}

function resolveTesseractModule(mod: TessModule): ResolvedTesseract {
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

/* ================================================================
 *  Component
 * ================================================================ */

const Scanner: React.FC<ScannerProps> = ({ onScan, isScanning }) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<string>('Point camera at ISBN barcode');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [manualIsbn, setManualIsbn] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [isbnSuggestions, setIsbnSuggestions] = useState<string[]>([]);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const [continuousActive, setContinuousActive] = useState(false);
    const autoScanRef = useRef(false);
    const processingRef = useRef(false);
    const showManualRef = useRef(false);
    const continuousActiveRef = useRef(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

    // Tesseract state
    const tessModuleRef = useRef<ResolvedTesseract | null>(null);
    const tessModulePromise = useRef<Promise<ResolvedTesseract> | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerPromise = useRef<Promise<any> | null>(null);
    const workerRetries = useRef(0);
    const MAX_WORKER_RETRIES = 3;

    const { toast } = useToast();

    useEffect(() => { autoScanRef.current = autoScan; }, [autoScan]);
    useEffect(() => { processingRef.current = processing; }, [processing]);
    useEffect(() => { showManualRef.current = showManual; }, [showManual]);
    useEffect(() => { continuousActiveRef.current = continuousActive; }, [continuousActive]);

    // Create barcode canvas on mount
    useEffect(() => {
        const c = document.createElement('canvas');
        barcodeCanvasRef.current = c;
        return () => { barcodeCanvasRef.current = null; };
    }, []);

    const addLog = useCallback((msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 50));
    }, []);

    /* ── Load the tesseract.js module (once) ────────────────────── */
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

    /* ── Create a persistent Tesseract worker (with retry) ──────── */
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
                            if (m.status === 'loading tesseract core') {
                                setStatus('Loading OCR engine...');
                            } else if (m.status === 'loading language traineddata') {
                                setStatus('Downloading language data...');
                            } else if (m.status === 'initializing tesseract') {
                                setStatus('Initializing OCR...');
                            } else if (m.status === 'recognizing text' && m.progress) {
                                setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
                            }
                        },
                    }),
                    30000,
                    'Worker creation'
                );

                await worker.setParameters({
                    tessedit_pageseg_mode: tess.PSM.SINGLE_BLOCK || '6',
                });

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
    }, [loadTessModule, addLog]);

    // Pre-warm OCR engine when camera is ready
    useEffect(() => {
        if (!cameraReady) return;
        addLog('Pre-warming OCR engine...');
        getWorker()
            .then(w => {
                if (w) addLog('OCR engine pre-warmed and ready');
                else addLog('OCR worker unavailable — will use fallback on scan');
            })
            .catch(err => addLog(`Pre-warm failed: ${err instanceof Error ? err.message : String(err)}`));
    }, [cameraReady, getWorker, addLog]);

    // Terminate worker on unmount
    useEffect(() => {
        return () => { workerRef.current?.terminate?.().catch(() => {}); };
    }, []);

    /* ── Barcode reader ─────────────────────────────────────────── */
    const getBarcodeReader = useCallback(async () => {
        if (barcodeReaderRef.current) return barcodeReaderRef.current;
        const mod = await import('@zxing/browser');
        const reader = new mod.BrowserMultiFormatReader();
        barcodeReaderRef.current = reader;
        return reader;
    }, []);

    /* ── Try barcode decode on an image source ──────────────────── */
    const tryBarcodeDecode = useCallback(async (
        imageSource: HTMLImageElement | string,
        label: string,
    ): Promise<string | null> => {
        try {
            const reader = await getBarcodeReader();
            let result;
            if (typeof imageSource === 'string') {
                const tempImg = new Image();
                await new Promise<void>((resolve, reject) => {
                    tempImg.onload = () => resolve();
                    tempImg.onerror = () => reject(new Error('img load fail'));
                    tempImg.src = imageSource;
                });
                result = await reader.decodeFromImageElement(tempImg);
            } else {
                result = await reader.decodeFromImageElement(imageSource);
            }
            const text = result.getText().replace(/[^0-9X]/g, '');
            if ((text.length === 13 || text.length === 10)) {
                addLog(`Barcode [${label}]: ${text}${isValidIsbn(text) ? ' ✓' : ' (bad checksum)'}`);
                return text;
            }
        } catch {
            // No barcode — normal
        }
        return null;
    }, [getBarcodeReader, addLog]);

    /* ================================================================
     *  CONTINUOUS BARCODE SCANNING
     *
     *  This is the PRIMARY detection method. Runs automatically
     *  when the camera is ready, scanning ~4fps for barcodes.
     *  Uses native BarcodeDetector API where available (Chrome/Edge),
     *  falls back to ZXing frame-by-frame.
     * ================================================================ */

    useEffect(() => {
        if (!cameraReady || cameraError || isScanning) return;

        let active = true;
        let scanCount = 0;
        setContinuousActive(true);
        addLog('Continuous barcode scanning started');

        const scan = async () => {
            if (!active) return;

            const video = webcamRef.current?.video as HTMLVideoElement | undefined;
            if (!video || video.readyState < 2) {
                if (active) setTimeout(scan, 500);
                return;
            }

            try {
                // === Native BarcodeDetector API (fastest, GPU-accelerated) ===
                // Available in Chrome 83+, Edge 83+, Opera 69+, Samsung Internet
                if ('BarcodeDetector' in window) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const detector = new (window as any).BarcodeDetector({
                            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
                        });
                        const barcodes = await detector.detect(video);
                        for (const bc of barcodes) {
                            const text = (bc.rawValue || '').replace(/[^0-9X]/g, '');
                            if ((text.length === 13 || text.length === 10) && isValidIsbn(text)) {
                                addLog(`Barcode (native BarcodeDetector): ${text} ✓`);
                                setContinuousActive(false);
                                active = false;
                                onScan(text);
                                return;
                            }
                        }
                    } catch {
                        // BarcodeDetector.detect() failed — continue to ZXing
                    }
                }

                // === ZXing fallback — decode from video frame ===
                const bCanvas = barcodeCanvasRef.current;
                if (bCanvas) {
                    const ctx = bCanvas.getContext('2d');
                    if (ctx) {
                        // Use reduced resolution for speed (720p is enough for barcodes)
                        const targetW = Math.min(video.videoWidth, 1280);
                        const targetH = Math.round(targetW * (video.videoHeight / video.videoWidth));
                        bCanvas.width = targetW;
                        bCanvas.height = targetH;
                        ctx.drawImage(video, 0, 0, targetW, targetH);

                        try {
                            const reader = await getBarcodeReader();
                            // Create temp image from canvas for ZXing
                            const dataUrl = bCanvas.toDataURL('image/jpeg', 0.85);
                            const tmpImg = new Image();
                            await new Promise<void>((resolve, reject) => {
                                tmpImg.onload = () => resolve();
                                tmpImg.onerror = () => reject(new Error('fail'));
                                tmpImg.src = dataUrl;
                            });
                            const result = await reader.decodeFromImageElement(tmpImg);
                            const text = result.getText().replace(/[^0-9X]/g, '');
                            if ((text.length === 13 || text.length === 10) && isValidIsbn(text)) {
                                addLog(`Barcode (ZXing continuous): ${text} ✓`);
                                setContinuousActive(false);
                                active = false;
                                onScan(text);
                                return;
                            }
                        } catch {
                            // No barcode in this frame — normal
                        }
                    }
                }
            } catch {
                // Scan error — continue
            }

            scanCount++;
            // Log periodically to show scanning is active
            if (scanCount === 1) {
                addLog('Scanning for barcodes... point camera at ISBN barcode');
            } else if (scanCount % 40 === 0) {
                addLog(`Still scanning... (${scanCount} frames checked)`);
            }

            if (active) {
                setTimeout(scan, BARCODE_SCAN_INTERVAL);
            }
        };

        // Start scanning after a short delay for camera to stabilize
        setTimeout(scan, 500);

        return () => {
            active = false;
            setContinuousActive(false);
            addLog('Continuous barcode scanning stopped');
        };
    }, [cameraReady, cameraError, isScanning, onScan, getBarcodeReader, addLog]);

    /* ── Run OCR on a preprocessed image ────────────────────────── */
    const runOcr = useCallback(async (
        processedImage: string,
        label: string,
    ): Promise<{ isbn: string | null; allCandidates: string[] }> => {
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
                workerRetries.current = Math.max(0, workerRetries.current - 1); // Allow retry
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
        if (trimmed) {
            addLog(`[${label}] OCR text: "${trimmed.substring(0, 120)}"`);
        } else {
            addLog(`[${label}] OCR returned empty text`);
        }

        const candidates = extractIsbnCandidates(trimmed);
        if (candidates.length > 0) {
            addLog(`[${label}] candidates: ${candidates.slice(0, 4).join(', ')}`);
        }

        const validIsbn = candidates.find(c => isValidIsbn(c));
        return { isbn: validIsbn ?? null, allCandidates: candidates };
    }, [getWorker, loadTessModule, addLog]);

    /* ── Main capture & scan pipeline ───────────────────────────── */
    const capture = useCallback(async () => {
        if (!webcamRef.current || processingRef.current || isScanning) return;

        const video = webcamRef.current.video as HTMLVideoElement | undefined;
        const canvas = canvasRef.current;
        if (!canvas) { addLog('Error: Missing canvas'); return; }
        if (!video || video.readyState < 2) {
            addLog('Error: Video not ready');
            setStatus('Camera is not ready yet. Please wait...');
            return;
        }

        // Capture frame
        let imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { addLog('Error: No canvas context'); return; }
            ctx.drawImage(video, 0, 0, width, height);
            imageSrc = canvas.toDataURL('image/jpeg', 0.92);
            addLog('Used manual canvas capture fallback');
        }
        if (!imageSrc) { addLog('Error: Failed to capture frame'); return; }

        processingRef.current = true;
        setProcessing(true);
        setStatus('Scanning...');
        setIsbnSuggestions([]);

        const allCandidates = new Set<string>();
        const ocrStartTime = Date.now();

        try {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load captured image'));
                img.src = imageSrc;
            });

            addLog(`Frame: ${img.width}x${img.height}`);

            /* ── Phase 1: Barcode scan (fast, multiple crops) ──── */
            addLog('Phase 1: Barcode scan...');
            setStatus('Scanning barcode...');

            let isbn: string | null = null;
            try {
                isbn = await tryBarcodeDecode(img, 'full');
                if (!isbn) {
                    isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_CENTER), 'center');
                }
                if (!isbn) {
                    isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_NARROW), 'narrow');
                }
                if (!isbn) {
                    isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_MEDIUM), 'medium');
                }
                if (!isbn) {
                    isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_WIDE), 'wide');
                }
            } catch (barcodeErr) {
                addLog(`Barcode phase error: ${barcodeErr instanceof Error ? barcodeErr.message : String(barcodeErr)}`);
            }

            if (isbn && isValidIsbn(isbn)) {
                addLog(`ISBN via barcode: ${isbn}`);
                setStatus(`Found ISBN: ${isbn}`);
                setAutoScan(false);
                onScan(isbn);
                return;
            }
            if (isbn) {
                allCandidates.add(isbn);
            }

            /* ── Phase 2: OCR scan (focused, fast) ─────────────── */
            addLog('Phase 2: OCR scan (focused pipeline)...');

            const brightness = detectBrightness(img, canvas, CROP_MEDIUM);
            const isDark = brightness < 90;
            addLog(`Scene brightness: ${brightness.toFixed(0)} (${isDark ? 'dark' : 'normal'})`);

            // Focused OCR passes — only the most effective combinations.
            // Each pass is run with a per-pass timeout to prevent hanging.
            const ocrPasses: Array<{
                crop: CropRegion;
                rotation: number;
                mode: PreprocessMode;
                label: string;
            }> = [
                // Tier 1: Most likely to succeed (horizontal text)
                { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: 'narrow-0' },
                { crop: CROP_NARROW, rotation: 0,   mode: 'enhanced', label: 'narrow-0-enh' },
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'clean',    label: 'medium-0' },
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'enhanced', label: 'medium-0-enh' },

                // Tier 2: Rotated (vertical book spines)
                { crop: CROP_NARROW, rotation: 90,  mode: 'clean',    label: 'narrow-90' },
                { crop: CROP_NARROW, rotation: 270, mode: 'clean',    label: 'narrow-270' },

                // Tier 3: Aggressive or special modes
                { crop: CROP_NARROW, rotation: 0,   mode: 'boost',    label: 'narrow-0-boost' },
                ...(isDark ? [
                    { crop: CROP_NARROW, rotation: 0, mode: 'invert' as PreprocessMode, label: 'narrow-0-inv' },
                ] : []),
                { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: 'wide-0' },
            ];

            for (const pass of ocrPasses) {
                // Check total timeout
                if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) {
                    addLog(`OCR total timeout reached (${OCR_TOTAL_TIMEOUT}ms). Stopping.`);
                    break;
                }

                try {
                    setStatus(`OCR: ${pass.label}...`);
                    const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                    const result = await runOcr(processed, pass.label);
                    result.allCandidates.forEach(c => allCandidates.add(c));

                    if (result.isbn) {
                        addLog(`ISBN via OCR [${pass.label}]: ${result.isbn}`);
                        setStatus(`Found ISBN: ${result.isbn}`);
                        setAutoScan(false);
                        onScan(result.isbn);
                        return;
                    }
                } catch (ocrErr) {
                    addLog(`OCR pass [${pass.label}] error: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
                }
            }

            /* ── Phase 3: No valid ISBN ───────────────────────── */
            const candidateList = Array.from(allCandidates);

            // Try fuzzy checksum repair — show as suggestions only
            const repairedSuggestions: string[] = [];
            for (const c of candidateList) {
                if (!isValidIsbn(c)) {
                    const repaired = tryFixChecksum(c);
                    if (repaired && !candidateList.includes(repaired) && !repairedSuggestions.includes(repaired)) {
                        repairedSuggestions.push(repaired);
                        addLog(`Checksum repair: ${c} → ${repaired} (suggested)`);
                    }
                }
            }
            const allSuggestions = [...candidateList, ...repairedSuggestions];

            if (allSuggestions.length > 0) {
                addLog(`No valid ISBN, ${allSuggestions.length} suggestion(s): ${allSuggestions.slice(0, 4).join(', ')}`);
                setIsbnSuggestions(allSuggestions.slice(0, 6));
                if (!showManualRef.current) setShowManual(true);
                setStatus(autoScanRef.current
                    ? 'Auto-scanning... adjust position'
                    : 'ISBN not confirmed. Check suggestions or adjust position.');
            } else {
                addLog('No ISBN detected in any pass.');
                if (!autoScanRef.current) {
                    setStatus('No ISBN detected. Try adjusting position or use manual input.');
                    setShowManual(true);
                } else {
                    setStatus('Auto-scanning... align ISBN in viewfinder');
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : '';
            addLog(`SCAN ERROR: ${msg}`);
            if (stack) addLog(`Stack: ${stack}`);
            setStatus(`Scan error: ${msg.substring(0, 100)}`);
            setShowDebug(true);
            toast(`Scan failed: ${msg.substring(0, 60)}`, 'error');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, tryBarcodeDecode, runOcr, addLog, toast]);

    /* ── Photo upload handler ─────────────────────────────────── */
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || processingRef.current || isScanning) return;

        e.target.value = '';

        addLog(`Photo upload: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        processingRef.current = true;
        setProcessing(true);
        setStatus('Processing uploaded photo...');
        setIsbnSuggestions([]);

        const allCandidates = new Set<string>();
        const ocrStartTime = Date.now();

        try {
            const imageSrc = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });

            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = imageSrc;
            });

            const canvas = canvasRef.current;
            if (!canvas) { addLog('Error: Missing canvas'); return; }

            addLog(`Photo: ${img.width}x${img.height}`);

            /* ── Phase 1: Barcode scan ──── */
            addLog('Phase 1: Barcode scan on photo...');
            setStatus('Scanning barcode in photo...');

            let isbn: string | null = null;
            try {
                isbn = await tryBarcodeDecode(img, 'photo-full');
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_NARROW), 'photo-narrow');
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_MEDIUM), 'photo-medium');
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_WIDE), 'photo-wide');
            } catch (barcodeErr) {
                addLog(`Barcode phase error: ${barcodeErr instanceof Error ? barcodeErr.message : String(barcodeErr)}`);
            }

            if (isbn && isValidIsbn(isbn)) {
                addLog(`ISBN via barcode (photo): ${isbn}`);
                setStatus(`Found ISBN: ${isbn}`);
                onScan(isbn);
                return;
            }
            if (isbn) allCandidates.add(isbn);

            /* ── Phase 2: OCR scan (focused) ──────── */
            addLog('Phase 2: OCR on photo...');

            const photoBrightness = detectBrightness(img, canvas, CROP_MEDIUM);
            const photoDark = photoBrightness < 90;
            addLog(`Photo brightness: ${photoBrightness.toFixed(0)} (${photoDark ? 'dark' : 'normal'})`);

            const ocrPasses: Array<{
                crop: CropRegion;
                rotation: number;
                mode: PreprocessMode;
                label: string;
            }> = [
                { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: 'photo-narrow-0' },
                { crop: CROP_NARROW, rotation: 0,   mode: 'enhanced', label: 'photo-narrow-0-enh' },
                { crop: CROP_CENTER, rotation: 0,   mode: 'clean',    label: 'photo-center-0' },
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'clean',    label: 'photo-medium-0' },
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'enhanced', label: 'photo-medium-0-enh' },
                { crop: CROP_NARROW, rotation: 90,  mode: 'clean',    label: 'photo-narrow-90' },
                { crop: CROP_NARROW, rotation: 270, mode: 'clean',    label: 'photo-narrow-270' },
                { crop: CROP_NARROW, rotation: 0,   mode: 'boost',    label: 'photo-narrow-boost' },
                ...(photoDark ? [
                    { crop: CROP_NARROW, rotation: 0, mode: 'invert' as PreprocessMode, label: 'photo-narrow-inv' },
                ] : []),
                { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: 'photo-wide-0' },
                { crop: CROP_FULL,   rotation: 0,   mode: 'clean',    label: 'photo-full-0' },
            ];

            for (const pass of ocrPasses) {
                if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) {
                    addLog(`OCR total timeout reached. Stopping.`);
                    break;
                }
                try {
                    setStatus(`OCR: ${pass.label}...`);
                    const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                    const result = await runOcr(processed, pass.label);
                    result.allCandidates.forEach(c => allCandidates.add(c));

                    if (result.isbn) {
                        addLog(`ISBN via OCR [${pass.label}]: ${result.isbn}`);
                        setStatus(`Found ISBN: ${result.isbn}`);
                        onScan(result.isbn);
                        return;
                    }
                } catch (ocrErr) {
                    addLog(`OCR pass [${pass.label}] error: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
                }
            }

            /* ── Phase 3: No valid ISBN ──── */
            const candidateList = Array.from(allCandidates);
            const photoRepaired: string[] = [];
            for (const c of candidateList) {
                if (!isValidIsbn(c)) {
                    const repaired = tryFixChecksum(c);
                    if (repaired && !candidateList.includes(repaired) && !photoRepaired.includes(repaired)) {
                        photoRepaired.push(repaired);
                        addLog(`Checksum repair: ${c} → ${repaired} (suggested)`);
                    }
                }
            }
            const allPhotoSuggestions = [...candidateList, ...photoRepaired];

            if (allPhotoSuggestions.length > 0) {
                addLog(`No valid ISBN from photo, ${allPhotoSuggestions.length} suggestion(s)`);
                setIsbnSuggestions(allPhotoSuggestions.slice(0, 6));
                setShowManual(true);
                setStatus('ISBN not confirmed. Check suggestions or try a clearer photo.');
            } else {
                addLog('No ISBN detected in photo.');
                setStatus('No ISBN detected. Try a clearer photo or enter manually.');
                setShowManual(true);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`PHOTO SCAN ERROR: ${msg}`);
            setStatus(`Scan error: ${msg.substring(0, 100)}`);
            setShowDebug(true);
            toast(`Scan failed: ${msg.substring(0, 60)}`, 'error');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, tryBarcodeDecode, runOcr, addLog, toast]);

    /* ── Auto-scan interval (OCR fallback) ─────────────────────── */
    useEffect(() => {
        if (!autoScan) return;
        addLog('Auto-scan (OCR) started');
        setStatus('Auto-scanning with OCR... align ISBN text in viewfinder');
        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current) capture();
        }, 3000);
        return () => { clearInterval(interval); addLog('Auto-scan (OCR) stopped'); };
    }, [autoScan, capture, addLog]);

    /* ── Manual ISBN submit ───────────────────────────────────── */
    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanIsbn = manualIsbn.replace(/[^0-9X]/g, '');
        if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
            toast('Please enter a 10 or 13 digit ISBN.', 'warning');
            return;
        }
        if (!isValidIsbn(cleanIsbn)) {
            toast('Invalid ISBN checksum. Please double-check the number.', 'error');
            return;
        }
        onScan(cleanIsbn);
        setManualIsbn('');
        setShowManual(false);
    };

    /* ── Render ────────────────────────────────────────────────── */
    return (
        <div className="scanner-container glass" style={{ position: 'relative', overflow: 'hidden' }}>
            <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints()}
                onUserMedia={() => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus('Scanning for barcodes automatically...');
                }}
                onUserMediaError={(err) => {
                    const msg = err instanceof Error ? err.message : 'Camera access denied';
                    setCameraError(`Camera error: ${msg}`);
                    setStatus('Camera unavailable — upload a photo or enter ISBN manually.');
                    addLog(`Camera error: ${msg}`);
                }}
                style={{ width: '100%', height: 'auto', display: 'block', minHeight: '340px' }}
                playsInline
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="viewfinder"></div>

            {/* Continuous scanning indicator */}
            {continuousActive && !processing && (
                <div className={s.scanIndicator}>
                    <Zap size={14} />
                    <span>Live barcode scanning</span>
                </div>
            )}

            <button
                onClick={() => setShowDebug(!showDebug)}
                aria-label={showDebug ? 'Hide debug logs' : 'Show debug logs'}
                className={s.debugBtn}
                style={{ background: showDebug ? 'var(--primary)' : 'rgba(0,0,0,0.5)' }}
            >
                <Terminal size={16} />
            </button>

            {showDebug && (
                <div className={s.debugPanel}>
                    <div className={s.debugHeader}>
                        <span>SCANNER LOGS</span>
                        <button
                            className={s.copyLogsBtn}
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(debugLogs.slice().reverse().join('\n'));
                                    toast('Scanner logs copied', 'success');
                                } catch {
                                    toast('Unable to copy logs', 'error');
                                }
                            }}
                            aria-label="Copy scanner logs"
                        >
                            Copy
                        </button>
                    </div>
                    {debugLogs.map((log, i) => (
                        <div key={i} className={s.debugLine}>&gt; {log}</div>
                    ))}
                </div>
            )}

            <div className={s.controls}>
                <div className={s.statusLine}>
                    <div className={s.cameraStatus}>
                        <span className={`${s.cameraDot} ${cameraReady ? s.cameraDotReady : cameraError ? s.cameraDotError : s.cameraDotPending}`} />
                        <span className={s.cameraLabel}>
                            {cameraError ? 'Camera error' : cameraReady ? 'Camera ready' : 'Camera starting'}
                        </span>
                    </div>
                    <p className={s.statusText}>{status}</p>
                    {(isScanning || processing) && (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    )}
                </div>
                {cameraError && (
                    <div className={s.cameraError}>
                        {cameraError}
                        {!showManual && (
                            <button
                                onClick={() => setShowManual(true)}
                                style={{
                                    marginLeft: '0.5rem',
                                    textDecoration: 'underline',
                                    background: 'none',
                                    border: 'none',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    fontSize: 'inherit',
                                }}
                            >
                                Enter ISBN manually
                            </button>
                        )}
                    </div>
                )}

                {/* Hidden file input for photo upload */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                />

                {cameraError ? (
                    <div className={s.fallbackActions}>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={processing || isScanning}
                            className={`glass ${s.uploadBtn}`}
                        >
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <ImagePlus size={20} />}
                            {processing ? 'Scanning...' : 'Take Photo / Upload'}
                        </button>
                        {!showManual ? (
                            <button
                                onClick={() => setShowManual(true)}
                                className={`glass ${s.manualEntryBtn}`}
                            >
                                <Edit3 size={18} />
                                Enter ISBN manually
                            </button>
                        ) : (
                            <form onSubmit={handleManualSubmit} className={s.manualForm}>
                                <input type="text" inputMode="numeric" placeholder="Enter ISBN..." value={manualIsbn}
                                    onChange={(e) => setManualIsbn(e.target.value)} aria-label="Enter ISBN manually"
                                    className={`glass ${s.manualInput}`} autoFocus />
                                <button type="submit" disabled={manualIsbn.length < 5 || isScanning}
                                    aria-label="Submit ISBN" className={`glass ${s.submitBtn}`}>
                                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                                </button>
                                <button type="button" onClick={() => setShowManual(false)} className={`glass ${s.closeBtn}`}>Close</button>
                            </form>
                        )}
                    </div>
                ) : !showManual ? (
                    <div className={s.btnRow}>
                        <button
                            onClick={capture}
                            disabled={processing || isScanning || !cameraReady}
                            aria-label={processing ? 'Scanning in progress' : 'Capture and scan'}
                            className={`glass ${s.captureBtn}`}
                            style={{ background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)' }}
                            title="Capture frame for OCR text recognition"
                        >
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'OCR Scan'}
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={processing || isScanning}
                            aria-label="Upload photo of ISBN"
                            className={`glass ${s.roundBtn}`}
                            title="Upload photo of ISBN"
                        >
                            <ImagePlus size={20} />
                        </button>
                        <button
                            onClick={() => setAutoScan(prev => !prev)}
                            disabled={isScanning}
                            aria-label={autoScan ? 'Stop auto OCR scan' : 'Start auto OCR scan'}
                            className={`glass ${s.roundBtn}`}
                            style={{ background: autoScan ? 'var(--accent-blue)' : 'transparent' }}
                            title={autoScan ? 'Stop auto OCR scan' : 'Auto OCR scan (for text ISBNs)'}
                        >
                            {autoScan ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button
                            onClick={() => setShowManual(true)}
                            aria-label="Manual ISBN entry"
                            className={`glass ${s.roundBtn}`}
                            title="Manual ISBN entry"
                        >
                            <Edit3 size={20} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleManualSubmit} className={s.manualForm}>
                        <input type="text" inputMode="numeric" placeholder="Enter ISBN..." value={manualIsbn}
                            onChange={(e) => setManualIsbn(e.target.value)} aria-label="Enter ISBN manually"
                            className={`glass ${s.manualInput}`} autoFocus />
                        <button type="submit" disabled={manualIsbn.length < 5 || isScanning}
                            aria-label="Submit ISBN" className={`glass ${s.submitBtn}`}>
                            {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        </button>
                        <button type="button" onClick={() => setShowManual(false)} className={`glass ${s.closeBtn}`}>Close</button>
                    </form>
                )}

                {isbnSuggestions.length > 0 && (
                    <div className={s.suggestionRow}>
                        {isbnSuggestions.map((candidate) => (
                            <button key={candidate} type="button"
                                onClick={() => {
                                    if (isValidIsbn(candidate)) { onScan(candidate); }
                                    else { setManualIsbn(candidate); setShowManual(true); }
                                }}
                                className={`glass ${s.suggestionBtn}`}
                                title={isValidIsbn(candidate) ? 'Valid ISBN — tap to add' : 'Checksum may be invalid — tap to edit'}
                            >
                                {candidate}
                                {isValidIsbn(candidate)
                                    ? <span style={{ color: '#22c55e', fontWeight: 700 }}>{'\u2713'}</span>
                                    : <span className={s.suggestionNote}>?</span>
                                }
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scanner;
