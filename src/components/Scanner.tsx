import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Loader2, Check, ImagePlus, Zap, X, Flashlight, Maximize2, HelpCircle, Settings, SwitchCamera, ZoomIn, ZoomOut, Layers } from 'lucide-react';
import { isValidIsbn, formatIsbnForDisplay } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates } from '../utils/ocr.ts';
import { runBrowserShelfScan } from '../shelf/runBrowserShelfScan.ts';
import type { ShelfReviewItem } from '../shelf/types.ts';
import ShelfScanReview from './ShelfScanReview.tsx';
import { useToast } from './Toast.tsx';
import { useOcrEngine } from '../hooks/useOcrEngine.ts';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.ts';
import { useFrameAveraging } from '../hooks/useFrameAveraging.ts';
import { useScanPipeline, assessVideoFrameQuality, CROP_MEDIUM, type OcrLanguage, type ScanProgress, type RunPipelineOptions, type ScanConfidenceBand, type ScanDetectionMethod } from '../hooks/useScanPipeline.ts';
import { buildErrorDiagnostics, formatDiagnostics } from '../utils/ocrDiagnostics.ts';
import type { LiveScanTelemetry } from '../hooks/useBarcodeScanner.ts';
import { hapticSuccess, hapticFailure, hapticHoldSteady } from '../utils/haptics.ts';
import DebugPanel from './DebugPanel.tsx';
import s from './Scanner.module.css';
import { uiContracts } from '../testing/uiContracts.ts';
import { e2eHooksEnabled, readE2EShelfReview } from '../lib/e2eHooks.ts';

/* ================================================================
 *  Types & Constants
 * ================================================================ */

export type ScanMode = 'auto' | 'barcode' | 'ocr' | 'shelf';

type ScanResultMeta = {
    detectionMethod?: ScanDetectionMethod;
    confidence?: number;
    confidenceBand?: ScanConfidenceBand;
};

const getScanResultSummary = (meta: ScanResultMeta): { title: string; detail: string } => {
    if (meta.detectionMethod === 'barcode') {
        return { title: 'Barcode found', detail: 'We read the ISBN. Adding the book next.' };
    }

    if (meta.detectionMethod === 'ocr-multilang') {
        const confidenceLabel = meta.confidence != null ? `${Math.round(meta.confidence)}% sure` : 'not sure how close';
        return { title: 'Spine match', detail: `We read the spine (${confidenceLabel}). Confirm it if it looks off.` };
    }

    if (meta.confidence != null) {
        const bandLabel = meta.confidenceBand === 'high' ? 'High' : meta.confidenceBand === 'medium' ? 'Medium' : 'Low';
        return { title: 'Spine match', detail: `${bandLabel} confidence. We'll add it if the ISBN checks out.` };
    }

    return { title: 'Spine match', detail: 'We read a likely ISBN from the spine.' };
};

interface ScannerProps {
    onScan: (isbn: string, options?: { allowReview?: boolean; source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion' }) => Promise<void> | void;
    onPhotoCapture?: (imageDataUrl: string) => void;
    isScanning: boolean;
    batchMode?: boolean;
    onOpenSupport?: () => void;
    onOpenPrivacy?: () => void;
    onViewLibrary?: (isbn?: string) => void;
    /** Accepted shelf-photo rows. Return false to keep the review list open. */
    onShelfImport?: (items: ShelfReviewItem[]) => boolean | void;
    /** Pause live barcode detection while the reader is typing an ISBN. */
    liveScanPaused?: boolean;
    /** Focus the always-visible ISBN field after a miss. */
    onNeedManualIsbn?: () => void;
    /** Prefill the ISBN field when a near-miss needs editing. */
    onEditIsbn?: (isbn: string) => void;
}

const EMPTY_TELEMETRY: LiveScanTelemetry = {
    attempts: 0, nativeHits: 0, zxingHits: 0,
    confirmed: 0, cooldownSuppressed: 0, busySuppressed: 0,
};

const getVideoConstraints = (facing: 'environment' | 'user' = 'environment'): MediaTrackConstraints => ({
    facingMode: facing,
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(({ focusMode: { ideal: 'continuous' } }) as any),
});

const SCANNER_DEBUG_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SCANNER_DEBUG === 'true';

function cameraUnavailableMessage(raw: string): string {
    const text = raw.toLowerCase();
    if (text.includes('permission') || text.includes('notallowed') || text.includes('denied')) {
        return 'Camera access is blocked. Allow it in the browser, or add a book from a photo.';
    }
    if (
        text.includes('notfound')
        || text.includes('device not found')
        || text.includes('no camera')
        || text.includes('requested device')
    ) {
        return 'No camera was found. Add a book from a photo or type the ISBN.';
    }
    return 'The camera didn\u2019t start. Add a book from a photo or type the ISBN.';
}

const SCAN_MODES: { mode: ScanMode; label: string; description: string }[] = [
    { mode: 'auto', label: 'Auto', description: 'Barcode, then the spine' },
    { mode: 'barcode', label: 'Barcode', description: 'The ISBN bars on the back' },
    { mode: 'ocr', label: 'Spine', description: 'The title on the spine' },
    { mode: 'shelf', label: 'Shelf', description: 'A row of books' },
];

const SCAN_GUIDANCE: Record<ScanMode, { title: string; pointAt: string; next: string; ready: string }> = {
    auto: {
        title: 'Scan a book',
        pointAt: 'Point at the barcode. If there is no barcode, point at the spine.',
        next: 'Next, we look it up and add the book.',
        ready: 'Ready. Point at the barcode or the spine.',
    },
    barcode: {
        title: 'Scan a barcode',
        pointAt: 'Point at the ISBN barcode on the back cover.',
        next: 'Next, we look up the book and add it.',
        ready: 'Ready. Point at the barcode.',
    },
    ocr: {
        title: 'Scan a spine',
        pointAt: 'Point at the title on the spine and hold still.',
        next: 'Next, we read the title and you confirm the match.',
        ready: 'Ready. Point at the spine.',
    },
    shelf: {
        title: 'Scan a shelf',
        pointAt: 'Point at a row of spines so they fill the frame.',
        next: 'Next, you review each book before it is added.',
        ready: 'Ready. Point at the shelf.',
    },
};

/* ================================================================
 *  Component
 * ================================================================ */

const Scanner: React.FC<ScannerProps> = ({
    onScan,
    onPhotoCapture,
    isScanning,
    batchMode: batchModeProp = false,
    onOpenSupport,
    onOpenPrivacy,
    onShelfImport,
    liveScanPaused = false,
    onNeedManualIsbn,
    onEditIsbn,
}) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState(SCAN_GUIDANCE.auto.ready);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [isbnSuggestions, setIsbnSuggestions] = useState<string[]>([]);
    const [repairedMap, setRepairedMap] = useState<Record<string, string>>({});
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    // Mirror of `debugLogs` for reads that must not invalidate dependent callbacks.
    // Without this, `capture` (below) lists `debugLogs` in its deps; every `addLog`
    // call recreates `capture`, which retriggers the auto-scan effect that calls
    // `addLog` again — an infinite render loop under React 19's scheduling.
    const debugLogsRef = useRef<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [liveTelemetry, setLiveTelemetry] = useState<LiveScanTelemetry>({ ...EMPTY_TELEMETRY });
    const [liveQualityHint, setLiveQualityHint] = useState<'ready' | 'blurry' | 'dark' | 'blurry-dark' | null>(null);
    const [, setOcrReady] = useState(false);
    const [ocrLanguage] = useState<OcrLanguage>('both');
    const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
    const [scanSuccessFlash, setScanSuccessFlash] = useState(false);
    const [successAnnouncement, setSuccessAnnouncement] = useState('');
    const [ocrFallbackDismissed, setOcrFallbackDismissed] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
    const [scanMode, setScanMode] = useState<ScanMode>('auto');
    const [submitting, setSubmitting] = useState(false);
    const [lastScanMeta, setLastScanMeta] = useState<ScanResultMeta | null>(null);
    const [ocrElapsedSec, setOcrElapsedSec] = useState(0);
    const [shelfItems, setShelfItems] = useState<ShelfReviewItem[] | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    useEffect(() => {
        abortControllerRef.current = new AbortController();
        return () => { abortControllerRef.current?.abort(); };
    }, []);

    useEffect(() => {
        const seeded = readE2EShelfReview(e2eHooksEnabled());
        if (seeded && seeded.length > 0) setShelfItems(seeded);
    }, []);
    const processingRef = useRef(false);
    const submittingRef = useRef(false);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const cameraPanelRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const takePhotoInputRef = useRef<HTMLInputElement>(null);
    const firstSuggestionRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => { processingRef.current = processing; }, [processing]);
    const liveQualityHintRef = useRef(liveQualityHint);
    useEffect(() => { liveQualityHintRef.current = liveQualityHint; }, [liveQualityHint]);

    const autoScan = scanMode === 'auto';
    const shelfMode = scanMode === 'shelf';
    const liveBarcodeEnabled = scanMode !== 'ocr' && scanMode !== 'shelf';

    const submitScan = useCallback(async (
        isbn: string,
        options?: { allowReview?: boolean; source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion' }
    ) => {
        submittingRef.current = true;
        setSubmitting(true);
        try {
            await onScan(isbn, options);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }, [onScan]);

    const suggestionsCount = isbnSuggestions.length + Object.keys(repairedMap).length;
    useEffect(() => {
        if (suggestionsCount > 0) {
            const t = setTimeout(() => firstSuggestionRef.current?.focus({ preventScroll: true }), 0);
            return () => clearTimeout(t);
        }
    }, [suggestionsCount]);

    const { toast, toastDetail } = useToast();

    const addLog = useCallback((msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => {
            const next = [msg, ...prev].slice(0, 50);
            debugLogsRef.current = next;
            return next;
        });
    }, []);

    const { preWarm, runOcr, runOcrWithLang, ocrState } = useOcrEngine({
        addLog, setStatus,
        onOcrReady: useCallback(() => setOcrReady(true), []),
    });

    const isBusy = useCallback(
        () => processingRef.current || submittingRef.current || isScanning || liveScanPaused || isbnSuggestions.length > 0,
        [isScanning, liveScanPaused, isbnSuggestions.length]
    );
    const { tryBarcodeDecode, continuousActiveRef, setTelemetryCallback } = useBarcodeScanner({
        addLog, onScan: submitScan, isScanning, cameraReady, cameraError,
        webcamRef: webcamRef as React.RefObject<Webcam | null>,
        isBusy,
        enabled: liveBarcodeEnabled,
    });

    useEffect(() => {
        setTelemetryCallback(setLiveTelemetry);
    }, [setTelemetryCallback]);

    const { captureAveragedFrame } = useFrameAveraging();

    const { runPipeline } = useScanPipeline({
        addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode,
        onProgress: useCallback((p: ScanProgress) => setScanProgress(p), []),
        ocrLanguage,
        scanMode: scanMode === 'shelf' ? 'auto' : scanMode,
    });

    useEffect(() => {
        preWarm();
    }, [preWarm]);
    useEffect(() => {
        if (cameraReady && !cameraError) preWarm();
    }, [cameraReady, cameraError, preWarm]);

    const inOcrPhase = processing && scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang');
    useEffect(() => {
        if (!inOcrPhase) {
            setOcrElapsedSec(0);
            return;
        }
        setOcrElapsedSec(0);
        const start = Date.now();
        const interval = setInterval(() => setOcrElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
        return () => clearInterval(interval);
    }, [inOcrPhase]);

    useEffect(() => {
        if (!cameraReady || cameraError || processing || isScanning) {
            setLiveQualityHint(null);
            return;
        }
        const video = webcamRef.current?.video as HTMLVideoElement | undefined;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const interval = setInterval(() => {
            if (!video || video.readyState < 2 || processingRef.current || isScanning) return;
            const quality = assessVideoFrameQuality(video, canvas, CROP_MEDIUM);
            if (quality.isBlurry && quality.isDark) {
                setLiveQualityHint('blurry-dark');
            } else if (quality.isBlurry) {
                setLiveQualityHint('blurry');
            } else if (quality.isDark) {
                setLiveQualityHint('dark');
            } else {
                setLiveQualityHint('ready');
            }
        }, 600);
        return () => clearInterval(interval);
    }, [cameraReady, cameraError, processing, isScanning]);

    const processShelf = useCallback(async (imageSrc: string) => {
        if (!imageSrc || processingRef.current || isScanning) return;
        const signal = abortControllerRef.current?.signal;
        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus('Looking for books on the shelf…');
        setIsbnSuggestions([]);
        setRepairedMap({});
        setLastScanMeta(null);
        try {
            const items = await runBrowserShelfScan(imageSrc, {
                signal,
                onProgress: setStatus,
                recognizeText: async (crop, regionId) => {
                    if (!crop) return { text: '', confidence: 0 };
                    const ocr = await runOcr(crop, `shelf-${regionId}`, extractIsbnCandidates, isValidIsbn);
                    return { text: ocr.text ?? '', confidence: ocr.confidence };
                },
            });
            if (signal?.aborted) {
                setStatus('Cancelled. Point at the shelf again.');
                return;
            }
            if (items.length === 0) {
                hapticFailure();
                setStatus('No books in that photo. Move closer, or scan one book.');
                toast('No books in that photo.', 'warning');
                return;
            }
            hapticSuccess();
            setShelfItems(items);
            setStatus(`Found ${items.length === 1 ? '1 book' : `${items.length} books`}. Keep, edit, or skip each one.`);
        } catch (err: unknown) {
            if (signal?.aborted) {
                setStatus('Cancelled. Point at the shelf again.');
                return;
            }
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`SHELF SCAN ERROR: ${msg}`);
            setStatus('Could not read that photo. Try again, or scan one book.');
            toast('Could not read that photo. Try again.', 'error');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [addLog, isScanning, runOcr, toast]);

    const capture = useCallback(async () => {
        if (!webcamRef.current || processingRef.current || isScanning) return;

        const video = webcamRef.current.video as HTMLVideoElement | undefined;
        const canvas = canvasRef.current;
        if (!canvas) { addLog('Error: Missing canvas'); return; }
        if (!video || video.readyState < 2) {
            addLog('Error: Video not ready');
            setStatus('Starting the camera…');
            return;
        }

        let imageSrc: string | null = null;
        if (video && video.readyState >= 2) {
            imageSrc = await captureAveragedFrame(video);
        }
        if (!imageSrc) imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) { addLog('Error: No canvas context'); return; }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            imageSrc = canvas.toDataURL('image/jpeg', 0.92);
            addLog('Used manual canvas capture fallback');
        }
        if (!imageSrc) { addLog('Error: Failed to capture frame'); return; }

        if (scanMode === 'shelf') {
            await processShelf(imageSrc);
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus(scanMode === 'ocr' ? 'Reading the spine…' : 'Reading the barcode…');
        setIsbnSuggestions([]);
        setRepairedMap({});
        setLastScanMeta(null);

        try {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Image load timed out after 10s')), 10000);
                img.onload = () => { clearTimeout(timer); resolve(); };
                img.onerror = () => { clearTimeout(timer); reject(new Error('Failed to load captured image')); };
                img.src = imageSrc;
            });

            addLog(`Frame: ${img.width}x${img.height}`);
            const pipelineOpts: RunPipelineOptions = { signal: abortControllerRef.current?.signal };
            const result = await runPipeline(img, canvas, '', pipelineOpts);

            if (abortControllerRef.current?.signal.aborted) {
                setStatus('Cancelled. Point at the book again.');
                return;
            }

            if (result.isbn) {
                setLastScanMeta({
                    detectionMethod: result.detectionMethod,
                    confidence: result.confidence,
                    confidenceBand: result.confidenceBand,
                });
                hapticSuccess();
                setScanSuccessFlash(true);
                setTimeout(() => setScanSuccessFlash(false), 800);
                setSuccessAnnouncement(`Added ISBN ${result.isbn}.`);
                setTimeout(() => setSuccessAnnouncement(''), 1500);
                await submitScan(result.isbn, {
                    source: scanMode === 'ocr' ? 'ocr' : scanMode === 'barcode' ? 'barcode' : 'scan',
                });
                setStatus('Added. Point at the next book.');
                setIsbnSuggestions([]);
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setLastScanMeta(null);
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                onNeedManualIsbn?.();
                setStatus(autoScan
                    ? 'Still looking. Keep the book in view.'
                    : 'Tap a match below.');
            } else {
                setLastScanMeta(null);
                hapticFailure();
                if (!autoScan) {
                    setStatus(scanMode === 'ocr'
                        ? 'No match. Hold still, or type the ISBN.'
                        : 'No match. Move closer, or type the ISBN.');
                    onNeedManualIsbn?.();
                    const diag = result.diagnostics;
                    if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                        toastDetail({
                            message: 'This picture is hard to read.',
                            type: 'warning',
                            details: formatDiagnostics(diag),
                        });
                    }
                } else {
                    setStatus('Still looking. Keep the barcode or spine in view.');
                }
            }
        } catch (err: unknown) {
            setLastScanMeta(null);
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`SCAN ERROR: ${msg}`);
            const isOcrWorkerError = /timeout|tesseract|worker|module|fallback|one-shot/i.test(msg);
            setStatus(isOcrWorkerError
                ? 'The scanner is busy. Add a photo, or type the ISBN.'
                : 'That scan did not work. Try again, or type the ISBN.');
            onNeedManualIsbn?.();
            if (SCANNER_DEBUG_ENABLED) setShowDebug(true);
            toastDetail({
                message: isOcrWorkerError
                    ? 'Scanner is busy. Add a photo or type the ISBN.'
                    : 'Scan failed. Try a photo or type the ISBN.',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogsRef.current),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [submitScan, isScanning, runPipeline, addLog, toastDetail, captureAveragedFrame, autoScan, scanMode, processShelf, onNeedManualIsbn]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || processingRef.current || isScanning) return;
        e.target.value = '';

        addLog(`Photo upload: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

        let imageSrc: string;
        try {
            imageSrc = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });
        } catch {
            toast('Could not read that photo.', 'error');
            return;
        }

        if (scanMode === 'shelf') {
            await processShelf(imageSrc);
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus('Reading your photo…');
        setIsbnSuggestions([]);
        setRepairedMap({});
        setLastScanMeta(null);

        try {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Image load timed out after 10s')), 10000);
                img.onload = () => { clearTimeout(timer); resolve(); };
                img.onerror = () => { clearTimeout(timer); reject(new Error('Failed to load image')); };
                img.src = imageSrc;
            });

            const canvas = canvasRef.current;
            if (!canvas) { addLog('Error: Missing canvas'); return; }

            addLog(`Photo: ${img.width}x${img.height}`);
            const pipelineOpts: RunPipelineOptions = { signal: abortControllerRef.current?.signal };
            const result = await runPipeline(img, canvas, 'photo-', pipelineOpts);

            if (abortControllerRef.current?.signal.aborted) {
                setStatus('Cancelled. Point at the book again.');
                return;
            }

            if (result.isbn) {
                setLastScanMeta({
                    detectionMethod: result.detectionMethod,
                    confidence: result.confidence,
                    confidenceBand: result.confidenceBand,
                });
                hapticSuccess();
                setScanSuccessFlash(true);
                setTimeout(() => setScanSuccessFlash(false), 800);
                setSuccessAnnouncement(`Added ISBN ${result.isbn}.`);
                setTimeout(() => setSuccessAnnouncement(''), 1500);
                await submitScan(result.isbn, {
                    source: scanMode === 'ocr' ? 'ocr' : scanMode === 'barcode' ? 'barcode' : 'scan',
                });
                setStatus('Added. Point at the next book.');
                setIsbnSuggestions([]);
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setLastScanMeta(null);
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                onNeedManualIsbn?.();
                setStatus('Tap a match below.');
            } else {
                setLastScanMeta(null);
                hapticFailure();
                setStatus('Could not read that photo. Try a clearer one, or type the ISBN.');
                onNeedManualIsbn?.();
                if (onPhotoCapture && !shelfMode) {
                    toast('No ISBN in that photo. You can still save it.', 'info', 7000, undefined, {
                        label: 'Save photo',
                        onClick: () => onPhotoCapture(imageSrc),
                    });
                }
                const diag = result.diagnostics;
                if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                    toastDetail({
                        message: 'This photo is hard to read.',
                        type: 'warning',
                        details: formatDiagnostics(diag),
                    });
                }
            }
        } catch (err: unknown) {
            setLastScanMeta(null);
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`PHOTO SCAN ERROR: ${msg}`);
            const isOcrWorkerError = /timeout|tesseract|worker|module|fallback|one-shot/i.test(msg);
            setStatus(isOcrWorkerError
                ? 'The scanner is busy. Try another photo, or type the ISBN.'
                : 'That photo did not work. Try another, or type the ISBN.');
            onNeedManualIsbn?.();
            if (SCANNER_DEBUG_ENABLED) setShowDebug(true);
            toastDetail({
                message: isOcrWorkerError
                    ? 'Scanner is busy. Try another photo or type the ISBN.'
                    : 'Scan failed. Try another photo or type the ISBN.',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogsRef.current),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [submitScan, isScanning, runPipeline, addLog, toastDetail, toast, scanMode, processShelf, onNeedManualIsbn, onPhotoCapture, shelfMode]);

    useEffect(() => {
        if (!autoScan || cameraError) return;
        addLog('Auto-scan (OCR) started');
        setStatus('Hold still. Looking for a barcode or a spine.');
        const interval = setInterval(() => {
            if (!isBusy() && autoScan && liveQualityHintRef.current !== 'blurry' && liveQualityHintRef.current !== 'blurry-dark') capture();
        }, 2000);
        return () => { clearInterval(interval); addLog('Auto-scan (OCR) stopped'); };
    }, [autoScan, cameraError, capture, addLog, isBusy]);

    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            const active = document.activeElement as HTMLElement;
            if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
            if (active?.closest('button') && active !== containerRef.current) return;
            if (!containerRef.current?.contains(active)) return;
            e.preventDefault();
            const qualityBlocked = scanMode !== 'shelf' && (liveQualityHint === 'blurry' || liveQualityHint === 'blurry-dark');
            if (!processingRef.current && !isScanning && cameraReady && !qualityBlocked) {
                capture();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [capture, cameraReady, liveQualityHint, isScanning, scanMode]);


    const cancelScan = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        addLog('Scan cancelled by user');
    }, [addLog]);

    const toggleTorch = useCallback(async () => {
        const track = videoTrackRef.current;
        if (!track) return;
        const next = !torchOn;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await track.applyConstraints({ advanced: [{ torch: next } as any] });
            setTorchOn(next);
            addLog(`Torch ${next ? 'on' : 'off'}`);
        } catch { /* torch not supported */ }
    }, [torchOn, addLog]);

    const toggleFullscreen = useCallback(() => {
        const el = cameraPanelRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            el.requestFullscreen().catch(() => {});
        }
    }, []);

    const switchCamera = useCallback(() => {
        const next = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(next);
        setCameraReady(false);
        setHasTorch(false);
        setTorchOn(false);
        setZoomLevel(1);
        setZoomRange(null);
        addLog(`Switching camera to ${next}`);
    }, [facingMode, addLog]);

    const changeZoom = useCallback(async (level: number) => {
        const track = videoTrackRef.current;
        if (!track || !zoomRange) return;
        const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, level));
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await track.applyConstraints({ advanced: [{ zoom: clamped } as any] });
            setZoomLevel(clamped);
        } catch { /* zoom not supported */ }
    }, [zoomRange]);

    const getSimpleHint = (): string => {
        if (shelfMode) return 'Point at the shelf';
        if (scanMode === 'ocr') {
            if (liveQualityHint === 'blurry' || liveQualityHint === 'blurry-dark') return 'Hold still. Point at the spine.';
            if (liveQualityHint === 'dark') return 'Too dark. Point at the spine in better light.';
            return 'Point at the spine';
        }
        if (liveQualityHint === 'ready') return 'Looks good. Tap Scan.';
        if (liveQualityHint === 'blurry') return 'Hold still.';
        if (liveQualityHint === 'dark') return hasTorch && !torchOn ? 'Too dark. Tap the flashlight.' : 'Too dark. Add light.';
        if (liveQualityHint === 'blurry-dark') return 'Hold still and add light.';
        return scanMode === 'barcode' ? 'Point at the barcode' : 'Point at the barcode or the spine';
    };

    const scanResultSummary = lastScanMeta ? getScanResultSummary(lastScanMeta) : null;

    const getProgressPercent = (): number => {
        if (!scanProgress || scanProgress.totalPasses == null || scanProgress.totalPasses <= 0) return 0;
        const completedPasses = Math.max(0, (scanProgress.currentPass ?? 0) - 1);
        const withinPass = (scanProgress.passProgress ?? 0) / 100;
        return Math.min(100, Math.max(0, ((completedPasses + withinPass) / scanProgress.totalPasses) * 100));
    };

    /* Render */

    const guidance = SCAN_GUIDANCE[scanMode];
    const systemStatusLabel = cameraError ? 'No camera' : !cameraReady ? 'Starting camera' : 'Camera ready';
    const systemDotClass = cameraError ? s.systemDotError : !cameraReady ? s.systemDotWarning : '';
    const qualityBlocked = !shelfMode && (liveQualityHint === 'blurry' || liveQualityHint === 'blurry-dark');
    const photoCaptureLabel = shelfMode ? 'Take shelf photo' : 'Take photo of ISBN';
    const galleryLabel = shelfMode ? 'Upload shelf photo' : 'Add from photo';

    if (shelfItems && shelfItems.length > 0) {
        return (
            <ShelfScanReview
                items={shelfItems}
                onChange={setShelfItems}
                onCancel={() => {
                    setShelfItems(null);
                    setStatus(SCAN_GUIDANCE.shelf.ready);
                }}
                onConfirm={(items) => {
                    const accepted = onShelfImport?.(items);
                    if (accepted !== false) setShelfItems(null);
                }}
            />
        );
    }

    return (
        <div ref={containerRef} className={s.scannerLayout} tabIndex={0} aria-label="Book scanner: press Space or Enter to capture" aria-busy={processing || isScanning}>

            {/* Left panel: controls */}
            <div className={s.controlsPanel}>
                <div className={`${s.systemStatus} ${cameraError ? s.systemStatusError : ''}`} role="status" aria-live="polite">
                    <span className={`${s.systemDot} ${systemDotClass}`} />
                    {systemStatusLabel}
                    {(isScanning || processing || submitting) && <Loader2 size={12} className="animate-spin" />}
                </div>

                <h2 className={s.panelTitle}>{guidance.title}</h2>
                <p className={s.panelDescription}>
                    {guidance.pointAt} {guidance.next}
                </p>

                {/* Scan mode selector */}
                <div className={s.scanModeSelector} role="radiogroup" aria-label="Scan mode">
                    {SCAN_MODES.map(({ mode, label, description }) => (
                        <button key={mode} type="button"
                            role="radio" aria-checked={scanMode === mode}
                            aria-label={`${label}: ${description}`}
                            className={`${s.scanModeBtn} ${scanMode === mode ? s.scanModeBtnActive : ''}`}
                            onClick={() => {
                                setScanMode(mode);
                                setStatus(SCAN_GUIDANCE[mode].ready);
                                addLog(`Scan mode: ${label}`);
                            }}>
                            <span className={s.scanModeName}>{label}</span>
                            <span className={s.scanModeDesc}>{description}</span>
                        </button>
                    ))}
                </div>

                {ocrState === 'fallback' && !ocrFallbackDismissed && (
                    <div className={s.ocrFallbackBanner} role="alert">
                        <p className={s.ocrFallbackTitle}>Text reading is in a slower mode</p>
                        <p className={s.ocrFallbackText}>Scanning still works. It may take longer.</p>
                        <div className={s.ocrFallbackActions}>
                            <button type="button" onClick={() => setOcrFallbackDismissed(true)} className={s.ocrFallbackDismiss}>
                                OK
                            </button>
                        </div>
                    </div>
                )}

                <div className={s.statusLine} role="status" aria-live="polite" aria-atomic="true">
                    <p className={s.statusHeading} id="status-text">
                        {processing ? (inOcrPhase ? `Reading the spine… ${ocrElapsedSec}s` : 'Looking…') : cameraError ? 'No camera' : 'Ready'}
                    </p>
                    <p className={s.statusText}>{cameraError ?? status}</p>
                </div>

                {scanResultSummary && !processing && (
                    <div className={s.scanHealthCard} aria-live="polite">
                        <p className={s.scanHealthTitle}>{scanResultSummary.title}</p>
                        <p className={s.scanHealthText}>{scanResultSummary.detail}</p>
                    </div>
                )}

                {processing && scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang') && scanProgress.totalPasses != null && scanProgress.totalPasses > 0 && (
                    <div className={s.progressContainer} role="progressbar" aria-valuenow={Math.round(getProgressPercent())} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress">
                        <div className={s.progressBarTrack}>
                            <div className={s.progressBarFill} style={{ width: `${getProgressPercent()}%` }} />
                        </div>
                    </div>
                )}

                {processing && (shelfMode || (scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang'))) && (
                    <button type="button" onClick={cancelScan} className={s.cancelScanBtn} aria-label="Cancel scan">
                        <X size={16} /> Cancel
                    </button>
                )}

                {/* Hidden file inputs */}
                <input ref={fileInputRef} type="file" accept="image/*" data-testid={uiContracts.scannerFileInputTestId}
                    onChange={handleFileUpload} style={{ display: 'none' }} aria-hidden="true" />
                <input ref={takePhotoInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handleFileUpload} style={{ display: 'none' }} aria-hidden="true" />

                {cameraError ? (
                    <div className={s.fallbackActions}>
                        <button onClick={() => takePhotoInputRef.current?.click()} disabled={processing || isScanning}
                            className={s.primaryBtn}
                            title={shelfMode ? 'Open camera to photograph a bookshelf' : 'Open camera to take a photo of the ISBN or barcode'}>
                            {processing ? <Loader2 className="animate-spin" size={24} /> : (
                                <span className={s.ctaIcon}><Camera size={22} /></span>
                            )}
                            {processing ? 'Scanning...' : photoCaptureLabel}
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={processing || isScanning}
                            className={s.secondaryBtn}
                            title={shelfMode ? 'Choose a bookshelf photo from your device' : 'Add a book from a photo on this device'}>
                            <span className={s.secondaryBtnIcon}><ImagePlus size={16} /></span>
                            {galleryLabel}
                        </button>
                    </div>
                ) : (
                    <>
                        <button onClick={capture} disabled={processing || submitting || isScanning || !cameraReady || qualityBlocked}
                            aria-label={processing ? 'Scanning in progress' : qualityBlocked ? 'Hold steady to scan' : shelfMode ? 'Scan shelf' : 'Scan book'}
                            aria-describedby="status-text"
                            data-testid={uiContracts.scannerCaptureTestId}
                            className={s.primaryBtn}>
                            {processing ? <Loader2 className="animate-spin" size={24} /> : (
                                <span className={s.ctaIcon}><Camera size={24} /></span>
                            )}
                            {processing ? 'Looking…' : shelfMode ? 'Scan shelf' : 'Scan'}
                            {!processing && <span className={s.ctaSubtext}>{shelfMode ? 'Then you review each book' : 'Then we add the book'}</span>}
                        </button>

                        <div className={s.secondaryRow}>
                            <button onClick={() => { hapticHoldSteady(); takePhotoInputRef.current?.click(); }} disabled={processing || isScanning}
                                className={s.secondaryBtn}
                                title={shelfMode ? 'Open camera to photograph a bookshelf' : 'Open camera to take a photo of the ISBN or barcode'}>
                                <span className={s.secondaryBtnIcon}><Camera size={16} /></span>
                                {photoCaptureLabel}
                            </button>
                            <button onClick={() => { hapticHoldSteady(); fileInputRef.current?.click(); }} disabled={processing || isScanning}
                                className={s.secondaryBtn}
                                title={shelfMode ? 'Choose a bookshelf photo from your device' : 'Add a book from a photo on this device'}>
                                <span className={s.secondaryBtnIcon}><ImagePlus size={16} /></span>
                                {galleryLabel}
                            </button>
                        </div>
                    </>
                )}

                {(isbnSuggestions.length > 0 || Object.keys(repairedMap).length > 0) && (
                    <div className={s.suggestionSection} role="group" aria-label="Possible matches" aria-live="polite">
                        <p className={s.suggestionHeader}>
                            {Object.keys(repairedMap).length > 0
                                ? 'Did you mean one of these?'
                                : 'Tap a match to add it.'}
                        </p>
                        <div className={s.suggestionRow}>
                        {Object.entries(repairedMap).map(([repaired, original], idx) => (
                            <button key={`rep-${repaired}`} ref={idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => { void submitScan(repaired, { source: 'suggestion' }); }}
                                className={`${s.suggestionBtn} ${s.repairBtn}`}
                                title={`Corrected from ${original}`}
                                aria-label={`Use ISBN ${repaired}`}>
                                <strong>{formatIsbnForDisplay(repaired)}</strong> <Check size={14} />
                            </button>
                        ))}
                        {isbnSuggestions.filter(c => !Object.keys(repairedMap).includes(c)).map((candidate, idx) => (
                            <button key={candidate} ref={Object.keys(repairedMap).length === 0 && idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => {
                                    if (isValidIsbn(candidate)) void submitScan(candidate, { source: 'suggestion' });
                                    else onEditIsbn?.(candidate);
                                }}
                                className={s.suggestionBtn}
                                title={isValidIsbn(candidate) ? 'Tap to add this book' : 'Tap to edit and verify'}>
                                {formatIsbnForDisplay(candidate)}
                                {isValidIsbn(candidate)
                                    ? <Check size={14} style={{ color: '#22c55e' }} />
                                    : <span className={s.suggestionNote}>edit</span>}
                            </button>
                        ))}
                        </div>
                    </div>
                )}

                <div className={s.panelFooter}>
                    <button type="button" className={s.footerLink} onClick={onOpenSupport}>
                        <HelpCircle size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                        Help Center
                    </button>
                    <button type="button" className={s.footerLink} onClick={onOpenPrivacy}>
                        <Settings size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                        Privacy & camera
                    </button>
                </div>
            </div>

            {/* Right panel: camera feed */}
            <div ref={cameraPanelRef} className={s.cameraPanel} data-testid="scanner-camera">
                <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints(facingMode)}
                onUserMedia={(stream) => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus(SCAN_GUIDANCE[scanMode].ready);
                    try {
                        const track = stream.getVideoTracks()[0];
                        if (track) {
                            videoTrackRef.current = track;
                            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const advanced: Record<string, any> = {};
                            if (caps?.focusMode) advanced.focusMode = 'continuous';
                            if (caps?.torch) { advanced.torch = false; setHasTorch(true); }
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const zCaps = caps?.zoom as any;
                            if (zCaps && typeof zCaps === 'object' && zCaps.min != null && zCaps.max != null) {
                                setZoomRange({ min: zCaps.min, max: zCaps.max, step: zCaps.step ?? 0.1 });
                                setZoomLevel(1);
                            }
                            if (Object.keys(advanced).length > 0) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                track.applyConstraints({ advanced: [advanced] } as any)
                                    .then(() => addLog(`Camera constraints applied: ${Object.keys(advanced).join(', ')}`))
                                    .catch(() => {/* best effort */});
                            }
                            const settings = track.getSettings();
                            const w = settings.width ?? 0;
                            const h = settings.height ?? 0;
                            addLog(`Camera: ${w}x${h}${settings.facingMode ? ` (${settings.facingMode})` : ''}${caps?.torch ? ' torch' : ''}${zCaps ? ` zoom ${zCaps.min}-${zCaps.max}x` : ''}`);
                        }
                    } catch { /* best effort */ }
                }}
                onUserMediaError={(err) => {
                    const msg = err instanceof Error ? err.message : 'Camera access denied';
                    setCameraError(cameraUnavailableMessage(msg));
                    setStatus(cameraUnavailableMessage(msg));
                    addLog(`Camera error: ${msg}`);
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                playsInline
            />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {!cameraReady && !cameraError && (
                    <div className={s.cameraLoadingOverlay} aria-hidden="true">
                        <div className={s.cameraLoadingSkeleton} />
                        <p className={s.cameraLoadingText}>Starting camera...</p>
                    </div>
                )}

                {scanSuccessFlash && (
                    <div className={s.successFlash} role="status" aria-live="polite">
                        <Check size={48} strokeWidth={3} />
                    </div>
                )}

                {successAnnouncement && (
                    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                        {successAnnouncement}
                    </div>
                )}

                {/* Live Feed badge */}
                {cameraReady && !cameraError && (
                    <div className={s.liveFeedBadge}>
                        <Zap size={12} /> Live Feed
                    </div>
                )}

                {/* Batch mode badge */}
                {batchModeProp && cameraReady && !cameraError && (
                    <div className={s.batchModeBadge} role="status" aria-label="Batch mode – stay on scanner">
                        <Layers size={12} /> Batch mode – stay on scanner
                    </div>
                )}

                {/* Camera control buttons */}
                {cameraReady && !cameraError && (
                    <div className={s.cameraControls}>
                        {hasTorch && (
                            <button type="button" onClick={toggleTorch}
                                className={`${s.cameraControlBtn} ${torchOn ? s.cameraControlBtnActive : ''}`}
                                aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}>
                                <Flashlight size={16} />
                            </button>
                        )}
                        <button type="button" onClick={switchCamera} className={s.cameraControlBtn}
                            aria-label={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}>
                            <SwitchCamera size={16} />
                        </button>
                        <button type="button" onClick={toggleFullscreen} className={s.cameraControlBtn} aria-label="Toggle fullscreen">
                            <Maximize2 size={16} />
                        </button>
                        {SCANNER_DEBUG_ENABLED && (
                            <button type="button" onClick={() => setShowDebug(prev => !prev)} className={s.cameraControlBtn} aria-label="Toggle scanner diagnostics">
                                <Settings size={16} />
                            </button>
                        )}
                    </div>
                )}

                {/* Zoom controls */}
                {cameraReady && !cameraError && zoomRange && zoomRange.max > 1 && (
                    <div className={s.zoomControls} data-testid="scanner-zoom">
                        <button type="button" onClick={() => changeZoom(zoomLevel - (zoomRange.step * 2 || 0.5))}
                            disabled={zoomLevel <= zoomRange.min}
                            className={s.zoomBtn} aria-label="Zoom out">
                            <ZoomOut size={14} />
                        </button>
                        <input type="range" className={s.zoomSlider}
                            min={zoomRange.min} max={zoomRange.max} step={zoomRange.step}
                            value={zoomLevel}
                            onChange={(e) => changeZoom(parseFloat(e.target.value))}
                            aria-label={`Zoom level ${zoomLevel.toFixed(1)}x`} />
                        <button type="button" onClick={() => changeZoom(zoomLevel + (zoomRange.step * 2 || 0.5))}
                            disabled={zoomLevel >= zoomRange.max}
                            className={s.zoomBtn} aria-label="Zoom in">
                            <ZoomIn size={14} />
                        </button>
                        <span className={s.zoomLabel}>{zoomLevel.toFixed(1)}x</span>
                    </div>
                )}

                {/* Viewfinder overlay */}
                <div className={s.viewfinderOverlay} role="img" aria-label={cameraError ? 'Camera unavailable' : 'Camera viewfinder'}>
                    {cameraError ? (
                        <p className={s.cameraUnavailable} role="status">{cameraError}</p>
                    ) : (
                        <>
                            <div className={s.barcodeGuide} aria-hidden="true">
                                <div className={`${s.guideCorner} ${s.guideTopLeft}`} />
                                <div className={`${s.guideCorner} ${s.guideTopRight}`} />
                                <div className={`${s.guideCorner} ${s.guideBottomLeft}`} />
                                <div className={`${s.guideCorner} ${s.guideBottomRight}`} />
                                {cameraReady && <div className={s.scanLine} />}
                            </div>
                            <p className={`${s.guideHint} ${liveQualityHint === 'ready' ? s.guideHintReady : (liveQualityHint === 'blurry' || liveQualityHint === 'dark' || liveQualityHint === 'blurry-dark') ? s.guideHintBlurry : ''}`} id="viewfinder-hint" aria-live="polite" aria-atomic="true">
                                {cameraReady ? getSimpleHint() : 'Starting camera…'}
                            </p>
                        </>
                    )}
                </div>

                {/* Auto-detect badge */}
                {continuousActiveRef.current && !processing && (
                    <div className={s.autoDetectBadge}>
                        <Zap size={10} />
                        Auto-Detect Active
                    </div>
                )}

                {SCANNER_DEBUG_ENABLED && (
                    <DebugPanel
                        logs={debugLogs}
                        telemetry={liveTelemetry}
                        show={showDebug}
                        onToggle={() => setShowDebug(prev => !prev)}
                    />
                )}
            </div>
        </div>
    );
};

export default Scanner;
