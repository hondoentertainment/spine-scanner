import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Loader2, Edit3, Check, ImagePlus, Zap, Image as ImageIcon, X, Flashlight, Maximize2, HelpCircle, Settings } from 'lucide-react';
import { isValidIsbn, formatIsbnForDisplay } from '../utils/isbnValidation.ts';
import { getNearMissCandidates } from '../utils/ocr.ts';
import { useToast } from './Toast.tsx';
import { useOcrEngine } from '../hooks/useOcrEngine.ts';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.ts';
import { useFrameAveraging } from '../hooks/useFrameAveraging.ts';
import { useScanPipeline, assessVideoFrameQuality, CROP_MEDIUM, type OcrLanguage, type ScanProgress, type RunPipelineOptions } from '../hooks/useScanPipeline.ts';
import { buildErrorDiagnostics, formatDiagnostics } from '../utils/ocrDiagnostics.ts';
import type { LiveScanTelemetry } from '../hooks/useBarcodeScanner.ts';
import { hapticSuccess, hapticFailure, hapticHoldSteady } from '../utils/haptics.ts';
import DebugPanel from './DebugPanel.tsx';
import s from './Scanner.module.css';

/* ================================================================
 *  Types & Constants
 * ================================================================ */

export type ScanMode = 'auto' | 'barcode' | 'ocr';

interface ScannerProps {
    onScan: (isbn: string) => void;
    onPhotoCapture?: (imageDataUrl: string) => void;
    isScanning: boolean;
    batchMode?: boolean;
}

const EMPTY_TELEMETRY: LiveScanTelemetry = {
    attempts: 0, nativeHits: 0, zxingHits: 0,
    confirmed: 0, cooldownSuppressed: 0, busySuppressed: 0,
};

const getVideoConstraints = (): MediaTrackConstraints => ({
    facingMode: 'environment',
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(({ focusMode: { ideal: 'continuous' } }) as any),
});

/* ================================================================
 *  Component
 * ================================================================ */

const Scanner: React.FC<ScannerProps> = ({ onScan, onPhotoCapture, isScanning, batchMode: batchModeProp = false }) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState('Point camera at book barcode');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [manualIsbn, setManualIsbn] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [isbnSuggestions, setIsbnSuggestions] = useState<string[]>([]);
    const [repairedMap, setRepairedMap] = useState<Record<string, string>>({});
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
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

    const abortControllerRef = useRef<AbortController | null>(null);
    useEffect(() => {
        abortControllerRef.current = new AbortController();
        return () => { abortControllerRef.current?.abort(); };
    }, []);
    const processingRef = useRef(false);
    const autoScanRef = useRef(false);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const cameraPanelRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const photoOnlyInputRef = useRef<HTMLInputElement>(null);
    const firstSuggestionRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => { processingRef.current = processing; }, [processing]);
    useEffect(() => { autoScanRef.current = autoScan; }, [autoScan]);
    const liveQualityHintRef = useRef(liveQualityHint);
    useEffect(() => { liveQualityHintRef.current = liveQualityHint; }, [liveQualityHint]);

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
        setDebugLogs(prev => [msg, ...prev].slice(0, 50));
    }, []);

    const { preWarm, runOcr, runOcrWithLang, ocrState } = useOcrEngine({
        addLog, setStatus,
        onOcrReady: useCallback(() => setOcrReady(true), []),
    });

    const isBusy = useCallback(() => processingRef.current || isScanning, [isScanning]);
    const { tryBarcodeDecode, continuousActiveRef, setTelemetryCallback } = useBarcodeScanner({
        addLog, onScan, isScanning, cameraReady, cameraError,
        webcamRef: webcamRef as React.RefObject<Webcam | null>,
        isBusy,
    });

    useEffect(() => {
        setTelemetryCallback(setLiveTelemetry);
    }, [setTelemetryCallback]);

    const { captureAveragedFrame } = useFrameAveraging();

    const { runPipeline } = useScanPipeline({
        addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode,
        onProgress: useCallback((p: ScanProgress) => setScanProgress(p), []),
        ocrLanguage,
    });

    useEffect(() => {
        preWarm();
    }, [preWarm]);
    useEffect(() => {
        if (cameraReady && !cameraError) preWarm();
    }, [cameraReady, cameraError, preWarm]);

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

    const capture = useCallback(async () => {
        if (!webcamRef.current || processingRef.current || isScanning) return;

        const video = webcamRef.current.video as HTMLVideoElement | undefined;
        const canvas = canvasRef.current;
        if (!canvas) { addLog('Error: Missing canvas'); return; }
        if (!video || video.readyState < 2) {
            addLog('Error: Video not ready');
            setStatus('Camera starting — one moment...');
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

        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus('Looking for ISBN...');
        setIsbnSuggestions([]);
        setRepairedMap({});

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
                setStatus('Scan cancelled');
                return;
            }

            if (result.isbn) {
                setAutoScan(false);
                hapticSuccess();
                setScanSuccessFlash(true);
                setTimeout(() => setScanSuccessFlash(false), 800);
                setSuccessAnnouncement(`Scan successful. ISBN ${result.isbn} added.`);
                setTimeout(() => setSuccessAnnouncement(''), 1500);
                onScan(result.isbn);
                if (batchModeProp) {
                    setStatus('Book added! Point at next book');
                    setIsbnSuggestions([]);
                    setShowManual(false);
                }
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                setShowManual(true);
                setStatus(autoScanRef.current
                    ? 'Searching... adjust position'
                    : 'We found something — tap a match below');
            } else {
                hapticFailure();
                if (!autoScanRef.current) {
                    setStatus('Not found — try moving closer or type the ISBN');
                    setShowManual(true);
                    const diag = result.diagnostics;
                    if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                        toastDetail({
                            message: 'Image quality may be affecting the scan',
                            type: 'warning',
                            details: formatDiagnostics(diag),
                        });
                    }
                } else {
                    setStatus('Searching... center the barcode in view');
                }
            }
        } catch (err: unknown) {
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`SCAN ERROR: ${msg}`);
            const isOcrWorkerError = /timeout|tesseract|worker|module|fallback|one-shot/i.test(msg);
            setStatus(isOcrWorkerError
                ? 'Scan engine busy — upload a photo or type ISBN'
                : 'Scan didn\'t work — try again or type ISBN');
            setShowManual(true);
            setShowDebug(true);
            toastDetail({
                message: isOcrWorkerError
                    ? 'Scanner busy — upload a photo or enter ISBN'
                    : 'Scan failed — try a photo upload or enter ISBN',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogs),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runPipeline, addLog, toastDetail, debugLogs, batchModeProp, captureAveragedFrame]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || processingRef.current || isScanning) return;
        e.target.value = '';

        addLog(`Photo upload: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus('Scanning your photo...');
        setIsbnSuggestions([]);
        setRepairedMap({});

        try {
            const imageSrc = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });

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
                setStatus('Scan cancelled');
                return;
            }

            if (result.isbn) {
                hapticSuccess();
                setScanSuccessFlash(true);
                setTimeout(() => setScanSuccessFlash(false), 800);
                setSuccessAnnouncement(`Scan successful. ISBN ${result.isbn} added.`);
                setTimeout(() => setSuccessAnnouncement(''), 1500);
                onScan(result.isbn);
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                setShowManual(true);
                setStatus('We found something — tap a match below');
            } else {
                hapticFailure();
                setStatus('Not found — try a clearer photo or type ISBN');
                setShowManual(true);
                const diag = result.diagnostics;
                if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                    toastDetail({
                        message: 'Photo quality may be affecting the scan',
                        type: 'warning',
                        details: formatDiagnostics(diag),
                    });
                }
            }
        } catch (err: unknown) {
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`PHOTO SCAN ERROR: ${msg}`);
            const isOcrWorkerError = /timeout|tesseract|worker|module|fallback|one-shot/i.test(msg);
            setStatus(isOcrWorkerError
                ? 'Scanner busy — try another photo or type ISBN'
                : 'Didn\'t work — try a different photo or type ISBN');
            setShowManual(true);
            setShowDebug(true);
            toastDetail({
                message: isOcrWorkerError
                    ? 'Scanner busy — try another photo or enter ISBN'
                    : 'Scan failed — try another photo or enter ISBN',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogs),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runPipeline, addLog, toastDetail, debugLogs]);

    const handlePhotoOnlyFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !onPhotoCapture || processingRef.current || isScanning) return;

        const reader = new FileReader();
        reader.onload = () => {
            addLog(`Photo-only upload: ${file.name}`);
            onPhotoCapture(reader.result as string);
        };
        reader.onerror = () => toast('Failed to read image.', 'error');
        reader.readAsDataURL(file);
    }, [onPhotoCapture, isScanning, addLog, toast]);

    useEffect(() => {
        if (!autoScan) return;
        addLog('Auto-scan (OCR) started');
        setStatus('Auto-scanning... hold book steady');
        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current && liveQualityHintRef.current !== 'blurry' && liveQualityHintRef.current !== 'blurry-dark') capture();
        }, 2000);
        return () => { clearInterval(interval); addLog('Auto-scan (OCR) stopped'); };
    }, [autoScan, capture, addLog]);

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanIsbn = manualIsbn.toUpperCase().replace(/[^0-9X]/g, '');
        if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
            toast('Enter a 10 or 13 digit ISBN.', 'warning');
            return;
        }
        if (!isValidIsbn(cleanIsbn)) {
            const nearMisses = getNearMissCandidates(cleanIsbn);
            if (nearMisses.length > 0) {
                setIsbnSuggestions(nearMisses);
                setRepairedMap(nearMisses.reduce((acc, m) => ({ ...acc, [m]: cleanIsbn }), {}));
                setStatus('That doesn\'t look right — did you mean one of these?');
                toast(`Did you mean ${nearMisses[0]}? Tap to use it.`, 'info');
                return;
            }
            toast('Invalid ISBN. Please double-check and try again.', 'error');
            return;
        }
        onScan(cleanIsbn);
        setManualIsbn('');
        setShowManual(false);
    };

    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            const active = document.activeElement as HTMLElement;
            if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
            if (active?.closest('button') && active !== containerRef.current) return;
            if (!containerRef.current?.contains(active)) return;
            e.preventDefault();
            if (!processingRef.current && !isScanning && cameraReady && liveQualityHint !== 'blurry' && liveQualityHint !== 'blurry-dark') {
                capture();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [capture, cameraReady, liveQualityHint, isScanning]);


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

    const getSimpleHint = (): string => {
        if (liveQualityHint === 'ready') return 'Ready — tap Scan';
        if (liveQualityHint === 'blurry') return 'Hold steady...';
        if (liveQualityHint === 'dark') return hasTorch && !torchOn ? 'Too dark — tap flashlight' : 'Need more light';
        if (liveQualityHint === 'blurry-dark') return hasTorch && !torchOn ? 'Hold steady — tap flashlight' : 'Hold steady, need more light';
        return 'Center the barcode in the frame';
    };

    const getProgressPercent = (): number => {
        if (!scanProgress || scanProgress.totalPasses == null || scanProgress.totalPasses <= 0) return 0;
        const completedPasses = Math.max(0, (scanProgress.currentPass ?? 0) - 1);
        const withinPass = (scanProgress.passProgress ?? 0) / 100;
        return Math.min(100, Math.max(0, ((completedPasses + withinPass) / scanProgress.totalPasses) * 100));
    };

    /* ── Render ────────────────────────────────────────────────── */

    const systemStatusLabel = cameraError ? 'Camera Unavailable' : !cameraReady ? 'Initializing' : 'System Ready';
    const systemDotClass = cameraError ? s.systemDotError : !cameraReady ? s.systemDotWarning : '';

    return (
        <div ref={containerRef} className={s.scannerLayout} tabIndex={0} aria-label="Book scanner: press Space or Enter to capture" aria-busy={processing || isScanning}>

            {/* ═══════ LEFT PANEL: Controls ═══════ */}
            <div className={s.controlsPanel}>
                <div className={s.systemStatus} role="status" aria-live="polite">
                    <span className={`${s.systemDot} ${systemDotClass}`} />
                    {systemStatusLabel}
                    {(isScanning || processing) && <Loader2 size={12} className="animate-spin" />}
                </div>

                <h2 className={s.panelTitle}>Scan Barcode</h2>
                <p className={s.panelDescription}>
                    Position the barcode within the frame. The system will automatically detect and capture the details.
                </p>

                {ocrState === 'fallback' && !ocrFallbackDismissed && (
                    <div className={s.ocrFallbackBanner} role="alert">
                        <p className={s.ocrFallbackTitle}>Text recognition loaded in compatibility mode</p>
                        <p className={s.ocrFallbackText}>Scanning still works but may be slower.</p>
                        <div className={s.ocrFallbackActions}>
                            <button type="button" onClick={() => setOcrFallbackDismissed(true)} className={s.ocrFallbackDismiss}>
                                OK
                            </button>
                        </div>
                    </div>
                )}

                <div className={s.statusLine} role="status" aria-live="polite" aria-atomic="true">
                    <p className={s.statusHeading} id="status-text">
                        {processing ? 'Scanning...' : cameraError ? 'No camera' : 'Ready to scan'}
                    </p>
                    <p className={s.statusText}>{status}</p>
                </div>

                {processing && scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang') && scanProgress.totalPasses != null && scanProgress.totalPasses > 0 && (
                    <div className={s.progressContainer} role="progressbar" aria-valuenow={Math.round(getProgressPercent())} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress">
                        <div className={s.progressBarTrack}>
                            <div className={s.progressBarFill} style={{ width: `${getProgressPercent()}%` }} />
                        </div>
                    </div>
                )}

                {processing && scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang') && (
                    <button type="button" onClick={cancelScan} className={s.cancelScanBtn} aria-label="Cancel scan">
                        <X size={16} /> Cancel
                    </button>
                )}

                {cameraError && (
                    <div className={s.cameraError}>{cameraError}</div>
                )}

                {/* Hidden file inputs */}
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handleFileUpload} style={{ display: 'none' }} aria-hidden="true" />
                <input ref={photoOnlyInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handlePhotoOnlyFileUpload} style={{ display: 'none' }} aria-hidden="true" />

                {cameraError ? (
                    <div className={s.fallbackActions}>
                        <button onClick={() => fileInputRef.current?.click()} disabled={processing || isScanning}
                            className={s.primaryBtn}>
                            {processing ? <Loader2 className="animate-spin" size={24} /> : (
                                <span className={s.ctaIcon}><ImagePlus size={22} /></span>
                            )}
                            {processing ? 'Scanning...' : 'Upload a Photo'}
                        </button>
                        {onPhotoCapture && (
                            <button onClick={() => photoOnlyInputRef.current?.click()} disabled={processing || isScanning}
                                className={s.secondaryBtn}>
                                <span className={s.secondaryBtnIcon}><ImageIcon size={16} /></span>
                                Add by photo
                            </button>
                        )}
                        <button onClick={() => setShowManual(true)} className={s.secondaryBtn}>
                            <span className={s.secondaryBtnIcon}><Edit3 size={16} /></span>
                            Type ISBN manually
                        </button>
                        {showManual && (
                            <form onSubmit={handleManualSubmit} className={s.manualForm}>
                                <input type="text" inputMode="text" pattern="[0-9Xx\-]{10,17}" placeholder="Enter ISBN..." value={manualIsbn}
                                    onChange={(e) => setManualIsbn(e.target.value)} aria-label="Enter ISBN manually"
                                    className={s.manualInput} autoFocus />
                                <button type="submit" disabled={manualIsbn.length < 5 || isScanning}
                                    aria-label="Submit ISBN" className={s.submitBtn}>
                                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                                </button>
                            </form>
                        )}
                    </div>
                ) : showManual ? (
                    <div className={s.manualSection}>
                        <form onSubmit={handleManualSubmit} className={s.manualForm}>
                            <input type="text" inputMode="text" pattern="[0-9Xx\-]{10,17}" placeholder="Type ISBN number..." value={manualIsbn}
                                onChange={(e) => setManualIsbn(e.target.value)} aria-label="Enter ISBN manually"
                                className={s.manualInput} autoFocus />
                            <button type="submit" disabled={manualIsbn.length < 5 || isScanning}
                                aria-label="Submit ISBN" className={s.submitBtn}>
                                {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                            </button>
                        </form>
                        <button type="button" onClick={() => setShowManual(false)} className={s.backToScanBtn}>
                            <Camera size={16} /> Back to scanning
                        </button>
                    </div>
                ) : (
                    <>
                        <button onClick={capture} disabled={processing || isScanning || !cameraReady || liveQualityHint === 'blurry' || liveQualityHint === 'blurry-dark'}
                            aria-label={processing ? 'Scanning in progress' : (liveQualityHint === 'blurry' || liveQualityHint === 'blurry-dark') ? 'Hold steady to scan' : 'Scan book'}
                            aria-describedby="status-text"
                            className={s.primaryBtn}>
                            {processing ? <Loader2 className="animate-spin" size={24} /> : (
                                <span className={s.ctaIcon}><Camera size={24} /></span>
                            )}
                            {processing ? 'Scanning...' : 'Capture Scan'}
                            {!processing && <span className={s.ctaSubtext}>Tap to freeze</span>}
                        </button>

                        <div className={s.secondaryRow}>
                            <button onClick={() => { hapticHoldSteady(); fileInputRef.current?.click(); }} disabled={processing || isScanning}
                                className={s.secondaryBtn}>
                                <span className={s.secondaryBtnIcon}><ImagePlus size={16} /></span>
                                Upload Photo
                            </button>
                            <button onClick={() => { hapticHoldSteady(); setShowManual(true); }}
                                className={s.secondaryBtn}>
                                <span className={s.secondaryBtnIcon}><Edit3 size={16} /></span>
                                Type ISBN
                            </button>
                        </div>
                    </>
                )}

                {(isbnSuggestions.length > 0 || Object.keys(repairedMap).length > 0) && (
                    <div className={s.suggestionSection} role="group" aria-label="Possible matches" aria-live="polite">
                        <p className={s.suggestionHeader}>
                            {Object.keys(repairedMap).length > 0
                                ? 'Did you mean one of these?'
                                : 'Possible matches — tap to add:'}
                        </p>
                        <div className={s.suggestionRow}>
                        {Object.entries(repairedMap).map(([repaired, original], idx) => (
                            <button key={`rep-${repaired}`} ref={idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => onScan(repaired)}
                                className={`${s.suggestionBtn} ${s.repairBtn}`}
                                title={`Corrected from ${original}`}
                                aria-label={`Use ISBN ${repaired}`}>
                                <strong>{formatIsbnForDisplay(repaired)}</strong> <Check size={14} />
                            </button>
                        ))}
                        {isbnSuggestions.filter(c => !Object.keys(repairedMap).includes(c)).map((candidate, idx) => (
                            <button key={candidate} ref={Object.keys(repairedMap).length === 0 && idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => {
                                    if (isValidIsbn(candidate)) onScan(candidate);
                                    else { setManualIsbn(candidate); setShowManual(true); }
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
                    <button type="button" className={s.footerLink} onClick={() => setShowDebug(prev => !prev)}>
                        <HelpCircle size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                        Help Center
                    </button>
                    <button type="button" className={s.footerLink} onClick={() => setShowDebug(prev => !prev)}>
                        <Settings size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                        Scanner Settings
                    </button>
                </div>
            </div>

            {/* ═══════ RIGHT PANEL: Camera Feed ═══════ */}
            <div ref={cameraPanelRef} className={s.cameraPanel}>
                <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints()}
                onUserMedia={(stream) => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus('Ready — point at a barcode or ISBN');
                    try {
                        const track = stream.getVideoTracks()[0];
                        if (track) {
                            videoTrackRef.current = track;
                            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const advanced: Record<string, any> = {};
                            if (caps?.focusMode) advanced.focusMode = 'continuous';
                            if (caps?.torch) { advanced.torch = false; setHasTorch(true); }
                            if (Object.keys(advanced).length > 0) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                track.applyConstraints({ advanced: [advanced] } as any)
                                    .then(() => addLog(`Camera constraints applied: ${Object.keys(advanced).join(', ')}`))
                                    .catch(() => {/* best effort */});
                            }
                            const settings = track.getSettings();
                            const w = settings.width ?? 0;
                            const h = settings.height ?? 0;
                            addLog(`Camera: ${w}x${h}${settings.facingMode ? ` (${settings.facingMode})` : ''}${caps?.torch ? ' (torch available)' : ''}`);
                        }
                    } catch { /* best effort */ }
                }}
                onUserMediaError={(err) => {
                    const msg = err instanceof Error ? err.message : 'Camera access denied';
                    setCameraError(`Can't access camera: ${msg}`);
                    setStatus('No camera — upload a photo or type the ISBN');
                    addLog(`Camera error: ${msg}`);
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                playsInline
            />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {!cameraReady && !cameraError && (
                    <div className={s.cameraLoadingOverlay} aria-hidden="true">
                        <div className={s.cameraLoadingSkeleton} />
                        <p className={s.cameraLoadingText}>Starting camera…</p>
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
                        <button type="button" onClick={toggleFullscreen} className={s.cameraControlBtn} aria-label="Toggle fullscreen">
                            <Maximize2 size={16} />
                        </button>
                        <button type="button" onClick={() => setShowDebug(prev => !prev)} className={s.cameraControlBtn} aria-label="Toggle debug info">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* Viewfinder overlay */}
                <div className={s.viewfinderOverlay} role="img" aria-label="Camera viewfinder">
                    <div className={s.barcodeGuide} aria-hidden="true">
                        <div className={`${s.guideCorner} ${s.guideTopLeft}`} />
                        <div className={`${s.guideCorner} ${s.guideTopRight}`} />
                        <div className={`${s.guideCorner} ${s.guideBottomLeft}`} />
                        <div className={`${s.guideCorner} ${s.guideBottomRight}`} />
                        <div className={s.scanLine} />
                    </div>
                    <p className={`${s.guideHint} ${liveQualityHint === 'ready' ? s.guideHintReady : (liveQualityHint === 'blurry' || liveQualityHint === 'dark' || liveQualityHint === 'blurry-dark') ? s.guideHintBlurry : ''}`} id="viewfinder-hint" aria-live="polite" aria-atomic="true">
                        {getSimpleHint()}
                    </p>
                </div>

                {/* Auto-detect badge */}
                {continuousActiveRef.current && !processing && (
                    <div className={s.autoDetectBadge}>
                        <Zap size={10} />
                        Auto-Detect Active
                    </div>
                )}

                <DebugPanel
                    logs={debugLogs}
                    telemetry={liveTelemetry}
                    show={showDebug}
                    onToggle={() => setShowDebug(prev => !prev)}
                />
            </div>
        </div>
    );
};

export default Scanner;
