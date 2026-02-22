import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Loader2, Edit3, Check, Play, Square, ImagePlus, Zap, Image as ImageIcon, Focus, Flashlight, Barcode, Type, Activity } from 'lucide-react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { getNearMissCandidates } from '../utils/ocr.ts';
import { useToast } from './Toast.tsx';
import { useOcrEngine } from '../hooks/useOcrEngine.ts';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.ts';
import { useScanPipeline, isLowResolution, assessVideoFrameQuality, CROP_MEDIUM, type OcrLanguage, type ScanProgress } from '../hooks/useScanPipeline.ts';
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
    /** When true, stay on scanner after successful scan for batch adding. */
    batchMode?: boolean;
}

const EMPTY_TELEMETRY: LiveScanTelemetry = {
    attempts: 0, nativeHits: 0, zxingHits: 0,
    confirmed: 0, cooldownSuppressed: 0, busySuppressed: 0,
};

/** Camera constraints with fallback chain: 1920→1280→640. Industry std for OCR resolution. */
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
    /* ── Core refs ────────────────────────────────────────────── */
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    /* ── UI state ─────────────────────────────────────────────── */
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState('Point camera at ISBN barcode');
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
    const [cameraResolution, setCameraResolution] = useState<{ width: number; height: number } | null>(null);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [liveQualityHint, setLiveQualityHint] = useState<'ready' | 'blurry' | 'dark' | null>(null);
    const [scanMode, setScanMode] = useState<ScanMode>('auto');
    const [torchWarningShown, setTorchWarningShown] = useState(false);
    const [ocrReady, setOcrReady] = useState(false);
    const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('both');
    const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);

    /* ── Refs for async closures ──────────────────────────────── */
    const processingRef = useRef(false);
    const autoScanRef = useRef(false);
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

    /* ── Logging ──────────────────────────────────────────────── */
    const addLog = useCallback((msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 50));
    }, []);

    /* ── OCR engine hook ──────────────────────────────────────── */
    const { preWarm, runOcr, runOcrWithLang, ocrState } = useOcrEngine({
        addLog, setStatus,
        onOcrReady: useCallback(() => setOcrReady(true), []),
    });

    /* ── Barcode scanner hook ─────────────────────────────────── */
    const isBusy = useCallback(() => processingRef.current || isScanning, [isScanning]);
    const { tryBarcodeDecode, continuousActiveRef, setTelemetryCallback, refocus } = useBarcodeScanner({
        addLog, onScan, isScanning, cameraReady, cameraError,
        webcamRef: webcamRef as React.RefObject<Webcam | null>,
        isBusy,
    });

    // Wire telemetry state updates
    useEffect(() => {
        setTelemetryCallback(setLiveTelemetry);
    }, [setTelemetryCallback]);

    /* ── Scan pipeline hook (shared by capture + upload) ──────── */
    const { runPipeline } = useScanPipeline({
        addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode,
        onProgress: useCallback((p: ScanProgress) => setScanProgress(p), []),
        ocrLanguage,
    });

    /* ── Pre-warm OCR on mount and when camera ready (mobile: load before first capture) ─ */
    useEffect(() => {
        preWarm();
    }, [preWarm]);
    useEffect(() => {
        if (cameraReady && !cameraError) preWarm();
    }, [cameraReady, cameraError, preWarm]);

    /* ── Live pre-capture quality feedback (industry std: hold steady when blur detected) ─── */
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
                setLiveQualityHint('blurry');
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

    /* ── Capture & scan from camera ───────────────────────────── */
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

        let imageSrc = webcamRef.current.getScreenshot();
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
        setStatus('Scanning...');
        setIsbnSuggestions([]);
        setRepairedMap({});

        try {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load captured image'));
                img.src = imageSrc;
            });

            addLog(`Frame: ${img.width}x${img.height}`);
            const result = await runPipeline(img, canvas, '');

            if (result.isbn) {
                setAutoScan(false);
                hapticSuccess();
                onScan(result.isbn);
                if (batchModeProp) {
                    setStatus('Added! Point at next book or barcode');
                    setIsbnSuggestions([]);
                    setShowManual(false);
                }
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                setShowManual(true);
                setStatus(autoScanRef.current
                    ? 'Auto-scanning... adjust position'
                    : 'ISBN not confirmed. Check suggestions or adjust position.');
            } else {
                hapticFailure();
                if (!autoScanRef.current) {
                    setStatus('No ISBN detected. Try adjusting position or use manual input.');
                    setShowManual(true);
                    const diag = result.diagnostics;
                    if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                        toastDetail({
                            message: 'Image quality may be affecting OCR',
                            type: 'warning',
                            details: formatDiagnostics(diag),
                        });
                    }
                } else {
                    setStatus('Auto-scanning... align ISBN in viewfinder');
                }
            }
        } catch (err: unknown) {
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`SCAN ERROR: ${msg}`);
            setStatus(`Scan error: ${msg.substring(0, 100)}`);
            setShowDebug(true);
            toastDetail({
                message: 'Scan failed',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogs),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runPipeline, addLog, toastDetail, debugLogs]);

    /* ── Torch toggle (low light) ───────────────────────────────── */
    const toggleTorch = useCallback(() => {
        const track = videoTrackRef.current;
        if (!track) return;
        const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
        if (!caps?.torch) {
            addLog('Torch not supported on this device');
            return;
        }
        hapticHoldSteady();
        const next = !torchOn;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        track.applyConstraints({ advanced: [{ torch: next }] } as any)
            .then(() => {
                setTorchOn(next);
                addLog(`Torch ${next ? 'on' : 'off'}`);
                if (next && !torchWarningShown) {
                    setTorchWarningShown(true);
                    toast('Avoid holding flashlight too close — can cause glare.', 'info');
                }
            })
            .catch(() => addLog('Torch toggle failed'));
    }, [torchOn, torchWarningShown, addLog, toast]);

    /* ── Photo upload handler ─────────────────────────────────── */
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || processingRef.current || isScanning) return;
        e.target.value = '';

        addLog(`Photo upload: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        processingRef.current = true;
        setProcessing(true);
        setScanProgress(null);
        setStatus('Processing uploaded photo...');
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
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = imageSrc;
            });

            const canvas = canvasRef.current;
            if (!canvas) { addLog('Error: Missing canvas'); return; }

            addLog(`Photo: ${img.width}x${img.height}`);
            const result = await runPipeline(img, canvas, 'photo-');

            if (result.isbn) {
                hapticSuccess();
                onScan(result.isbn);
            } else if (result.suggestions.length > 0 || (result.repairedMap && Object.keys(result.repairedMap).length > 0)) {
                setIsbnSuggestions(result.suggestions);
                setRepairedMap(result.repairedMap ?? {});
                setShowManual(true);
                setStatus('ISBN not confirmed. Check suggestions or try a clearer photo.');
            } else {
                hapticFailure();
                setStatus('No ISBN detected. Try a clearer photo or enter manually.');
                setShowManual(true);
                const diag = result.diagnostics;
                if (diag && (diag.skipReason || diag.quality?.isBlurry || diag.quality?.isDark)) {
                    toastDetail({
                        message: 'Image quality may be affecting OCR',
                        type: 'warning',
                        details: formatDiagnostics(diag),
                    });
                }
            }
        } catch (err: unknown) {
            hapticFailure();
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`PHOTO SCAN ERROR: ${msg}`);
            setStatus(`Scan error: ${msg.substring(0, 100)}`);
            setShowDebug(true);
            toastDetail({
                message: 'Scan failed',
                type: 'error',
                details: buildErrorDiagnostics(msg, debugLogs),
            });
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runPipeline, addLog, toastDetail, debugLogs]);

    /* ── Photo-only capture (no ISBN scan) ────────────────────── */
    const capturePhotoOnly = useCallback(() => {
        if (!onPhotoCapture || processingRef.current || isScanning) return;

        const video = webcamRef.current?.video as HTMLVideoElement | undefined;
        const screenshot = webcamRef.current?.getScreenshot?.();

        if (screenshot) {
            addLog('Photo-only capture from camera');
            onPhotoCapture(screenshot);
            return;
        }
        if (video && video.readyState >= 2 && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0);
                addLog('Photo-only capture from video frame');
                onPhotoCapture(canvas.toDataURL('image/jpeg', 0.92));
                return;
            }
        }
        photoOnlyInputRef.current?.click();
    }, [onPhotoCapture, isScanning, addLog]);

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

    /* ── Auto-scan interval (OCR fallback) ────────────────────── */
    useEffect(() => {
        if (!autoScan) return;
        addLog('Auto-scan (OCR) started');
        setStatus('Auto-scanning with OCR... align ISBN text in viewfinder');
        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current && liveQualityHintRef.current !== 'blurry') capture();
        }, 2000);
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
            const nearMisses = getNearMissCandidates(cleanIsbn);
            if (nearMisses.length > 0) {
                setIsbnSuggestions(nearMisses);
                setRepairedMap(nearMisses.reduce((acc, m) => ({ ...acc, [m]: cleanIsbn }), {}));
                setStatus(`Invalid checksum. Try one of: ${nearMisses.slice(0, 3).join(', ')}`);
                toast(`Did you mean ${nearMisses[0]}? Tap a suggestion to use it.`, 'info');
                return;
            }
            toast('Invalid ISBN checksum. Please double-check the number.', 'error');
            return;
        }
        onScan(cleanIsbn);
        setManualIsbn('');
        setShowManual(false);
    };

    /* ── Keyboard: Space/Enter to capture when viewfinder focused (accessibility) ───────────────── */
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            const active = document.activeElement as HTMLElement;
            if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
            if (active?.closest('button') && active !== containerRef.current) return;
            if (!containerRef.current?.contains(active)) return;
            e.preventDefault();
            if (!processingRef.current && !isScanning && cameraReady && liveQualityHint !== 'blurry') {
                capture();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [capture, cameraReady, liveQualityHint, isScanning]);


    /* ── Render ────────────────────────────────────────────────── */
    return (
        <div ref={containerRef} className="scanner-container glass" style={{ position: 'relative', overflow: 'hidden' }} tabIndex={0} aria-label="Book scanner: press Space or Enter to capture">
            <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints()}
                onUserMedia={(stream) => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus('Scanning for barcodes automatically...');
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
                            setCameraResolution(w && h ? { width: w, height: h } : null);
                            addLog(`Camera: ${w}x${h}${settings.facingMode ? ` (${settings.facingMode})` : ''}`);
                        }
                    } catch { /* best effort */ }
                }}
                onUserMediaError={(err) => {
                    videoTrackRef.current = null;
                    setHasTorch(false);
                    const msg = err instanceof Error ? err.message : 'Camera access denied';
                    setCameraError(`Camera error: ${msg}`);
                    setStatus('Camera unavailable — upload a photo or enter ISBN manually.');
                    addLog(`Camera error: ${msg}`);
                }}
                style={{ width: '100%', height: 'auto', display: 'block', minHeight: '220px', maxHeight: '45vh' }}
                playsInline
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* P5: Barcode targeting guide (industry std: fill frame, 5-10cm distance) */}
            <div className={s.viewfinderOverlay} role="img" aria-label="Camera viewfinder for scanning barcode or ISBN">
                <div className={s.barcodeGuide} aria-hidden="true">
                    <div className={`${s.guideCorner} ${s.guideTopLeft}`} />
                    <div className={`${s.guideCorner} ${s.guideTopRight}`} />
                    <div className={`${s.guideCorner} ${s.guideBottomLeft}`} />
                    <div className={`${s.guideCorner} ${s.guideBottomRight}`} />
                    <div className={s.scanLine} />
                </div>
                <p className={`${s.guideHint} ${liveQualityHint === 'ready' ? s.guideHintReady : liveQualityHint === 'blurry' || liveQualityHint === 'dark' ? s.guideHintBlurry : ''}`} id="viewfinder-hint" aria-live="polite" aria-atomic="true">
                    {liveQualityHint === 'ready'
                        ? (scanMode === 'barcode' ? 'Hold 5–10 cm away. Align barcode in frame — Ready' : scanMode === 'ocr' ? 'Hold 5–10 cm away. Fill frame with ISBN text — Ready' : 'Hold 5–10 cm away. Fill frame with barcode or ISBN — Ready')
                        : liveQualityHint === 'blurry'
                            ? 'Hold steady'
                            : liveQualityHint === 'dark'
                                ? 'Improve lighting'
                                : (scanMode === 'barcode' ? 'Align barcode in frame (5–10 cm away)' : scanMode === 'ocr' ? 'Fill frame with ISBN text (5–10 cm away)' : 'Align barcode or ISBN in frame (5–10 cm away)')}
                </p>
            </div>

            {continuousActiveRef.current && !processing && (
                <div className={s.scanIndicator}>
                    <Zap size={14} />
                    <span>Live barcode scanning</span>
                </div>
            )}

            <DebugPanel
                logs={debugLogs}
                telemetry={liveTelemetry}
                show={showDebug}
                onToggle={() => setShowDebug(prev => !prev)}
            />

            <div className={s.controls}>
                <div className={s.statusLine} role="status" aria-live="polite" aria-atomic="true">
                    <div className={s.cameraStatus}>
                        <span className={`${s.cameraDot} ${cameraReady ? s.cameraDotReady : cameraError ? s.cameraDotError : s.cameraDotPending}`} />
                        <span className={s.cameraLabel}>
                            {cameraError ? 'Camera error' : cameraReady ? 'Camera ready' : 'Camera starting'}
                        </span>
                    </div>
                    <p className={s.statusText} id="status-text">{status}</p>
                    {ocrState === 'loading' && (
                        <span className={s.ocrReadyBadge} aria-live="polite" title="Downloading and initializing OCR engine">
                            <Loader2 size={12} className="animate-spin" /> OCR loading…
                        </span>
                    )}
                    {ocrState === 'fallback' && (
                        <span className={s.ocrReadyBadge} title="Using fallback OCR mode — first scan may be slower">
                            <Activity size={12} /> OCR (fallback)
                        </span>
                    )}
                    {ocrState === 'ready' && (
                        <span className={s.ocrReadyBadge} title="OCR ready for offline scan">
                            <Activity size={12} /> OCR ready
                        </span>
                    )}
                    {cameraResolution && isLowResolution(cameraResolution.width) && !cameraError && (
                        <p className={s.resolutionHint} aria-live="polite">
                            Move closer for better scan quality
                        </p>
                    )}
                    {(isScanning || processing) && (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    )}
                </div>

                {/* OCR progress bar: Pass X of Y — Z% */}
                {processing && scanProgress && (scanProgress.phase === 'ocr' || scanProgress.phase === 'ocr-multilang') && scanProgress.totalPasses != null && scanProgress.totalPasses > 0 && (
                    <div className={s.progressContainer} role="progressbar" aria-valuenow={scanProgress.currentPass ?? 0} aria-valuemin={0} aria-valuemax={scanProgress.totalPasses} aria-label={scanProgress.passProgress != null ? `OCR pass ${scanProgress.currentPass ?? 0} of ${scanProgress.totalPasses}, ${scanProgress.passProgress} percent` : `OCR pass ${scanProgress.currentPass ?? 0} of ${scanProgress.totalPasses}`}>
                        <div className={s.progressLabel}>
                            <span>
                                OCR pass {scanProgress.currentPass ?? 0} of {scanProgress.totalPasses}
                                {scanProgress.passProgress != null && ` — ${scanProgress.passProgress}%`}
                            </span>
                        </div>
                        <div className={s.progressBarTrack}>
                            <div className={s.progressBarFill} style={{ width: `${(() => {
                                const passFrac = (scanProgress.currentPass ?? 0) / scanProgress.totalPasses;
                                const withinPass = (scanProgress.passProgress ?? 0) / 100;
                                return Math.min(100, (passFrac - 1 / scanProgress.totalPasses + withinPass / scanProgress.totalPasses) * 100);
                            })()}%` }} />
                        </div>
                    </div>
                )}
                {/* Possible matches during scan */}
                {processing && scanProgress?.possibleCandidates && scanProgress.possibleCandidates.length > 0 && (
                    <p className={s.statusText} aria-live="polite" style={{ marginTop: '0.25rem', fontSize: '0.9em', opacity: 0.9 }}>
                        Possible: {scanProgress.possibleCandidates[0]}
                    </p>
                )}

                {cameraError && (
                    <div className={s.cameraError}>
                        {cameraError}
                        {!showManual && (
                            <button onClick={() => setShowManual(true)} style={{
                                marginLeft: '0.5rem', textDecoration: 'underline', background: 'none',
                                border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit',
                            }}>
                                Enter ISBN manually
                            </button>
                        )}
                    </div>
                )}

                {/* Hidden file inputs */}
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handleFileUpload} style={{ display: 'none' }} aria-hidden="true" />
                <input ref={photoOnlyInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handlePhotoOnlyFileUpload} style={{ display: 'none' }} aria-hidden="true" />

                {cameraError ? (
                    <div className={s.fallbackActions}>
                        <button onClick={() => fileInputRef.current?.click()} disabled={processing || isScanning}
                            className={`glass ${s.uploadBtn}`}>
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <ImagePlus size={20} />}
                            {processing ? 'Scanning...' : 'Take Photo / Upload'}
                        </button>
                        {onPhotoCapture && (
                            <button onClick={() => photoOnlyInputRef.current?.click()} disabled={processing || isScanning}
                                className={`glass ${s.uploadBtn}`}>
                                <ImageIcon size={20} /> Add by photo
                            </button>
                        )}
                        {!showManual ? (
                            <button onClick={() => setShowManual(true)} className={`glass ${s.manualEntryBtn}`}>
                                <Edit3 size={18} /> Enter ISBN manually
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
                    <>
                    <div className={s.scanModeRow}>
                        <span className={s.scanModeLabel}>Mode:</span>
                        <button type="button" onClick={() => setScanMode('barcode')} aria-pressed={scanMode === 'barcode'}
                            className={`${s.scanModeBtn} ${scanMode === 'barcode' ? s.scanModeBtnActive : ''}`} title="Barcode only">
                            <Barcode size={16} /> Barcode
                        </button>
                        <button type="button" onClick={() => setScanMode('ocr')} aria-pressed={scanMode === 'ocr'}
                            className={`${s.scanModeBtn} ${scanMode === 'ocr' ? s.scanModeBtnActive : ''}`} title="OCR text only">
                            <Type size={16} /> OCR
                        </button>
                        <button type="button" onClick={() => setScanMode('auto')} aria-pressed={scanMode === 'auto'}
                            className={`${s.scanModeBtn} ${scanMode === 'auto' ? s.scanModeBtnActive : ''}`} title="Both (default)">
                            <Zap size={16} /> Auto
                        </button>
                    </div>
                    <div className={s.languageRow}>
                        <span className={s.languageLabel}>Language:</span>
                        <button type="button" onClick={() => setOcrLanguage('en')} aria-pressed={ocrLanguage === 'en'}
                            className={`${s.languageBtn} ${ocrLanguage === 'en' ? s.languageBtnActive : ''}`} title="English only">
                            English
                        </button>
                        <button type="button" onClick={() => setOcrLanguage('de')} aria-pressed={ocrLanguage === 'de'}
                            className={`${s.languageBtn} ${ocrLanguage === 'de' ? s.languageBtnActive : ''}`} title="German fallback">
                            German
                        </button>
                        <button type="button" onClick={() => setOcrLanguage('both')} aria-pressed={ocrLanguage === 'both'}
                            className={`${s.languageBtn} ${ocrLanguage === 'both' ? s.languageBtnActive : ''}`} title="English and German">
                            Both
                        </button>
                    </div>
                    <div className={s.btnRow}>
                        <button onClick={capture} disabled={processing || isScanning || !cameraReady || liveQualityHint === 'blurry'}
                            aria-label={processing ? 'Scanning in progress' : liveQualityHint === 'blurry' ? 'Hold steady to enable capture' : 'Capture and scan'}
                            aria-describedby="status-text"
                            className={`glass ${s.captureBtn}`}
                            style={{ background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)' }}
                            title="Capture frame for OCR text recognition">
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'OCR Scan'}
                        </button>
                        <button onClick={() => { hapticHoldSteady(); fileInputRef.current?.click(); }} disabled={processing || isScanning}
                            aria-label="Upload photo of ISBN" className={`glass ${s.roundBtn}`} title="Upload photo of ISBN">
                            <ImagePlus size={20} />
                        </button>
                        <button onClick={() => { hapticHoldSteady(); setAutoScan(prev => !prev); }} disabled={isScanning}
                            aria-label={autoScan ? 'Stop auto OCR scan' : 'Start auto OCR scan'}
                            className={`glass ${s.roundBtn}`}
                            style={{ background: autoScan ? 'var(--accent-blue)' : 'transparent' }}
                            title={autoScan ? 'Stop auto OCR scan' : 'Auto OCR scan (for text ISBNs)'}>
                            {autoScan ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button onClick={() => { hapticHoldSteady(); setShowManual(true); }} aria-label="Manual ISBN entry"
                            className={`glass ${s.roundBtn}`} title="Manual ISBN entry">
                            <Edit3 size={20} />
                        </button>
                        <button onClick={() => { hapticHoldSteady(); refocus(); }}
                            aria-label="Refocus camera" className={`glass ${s.roundBtn}`}
                            title="Tap to refocus camera">
                            <Focus size={20} />
                        </button>
                        {hasTorch && (
                            <button onClick={toggleTorch}
                                aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight for low light'}
                                className={`glass ${s.roundBtn}`}
                                style={{ background: torchOn ? 'var(--accent-blue)' : 'transparent' }}
                                title={torchOn ? 'Flashlight on' : 'Flashlight for low light'}>
                                <Flashlight size={20} />
                            </button>
                        )}
                        {onPhotoCapture && (
                            <button onClick={() => { hapticHoldSteady(); capturePhotoOnly(); }} disabled={processing || isScanning}
                                aria-label="Capture book photo" className={`glass ${s.roundBtn}`}
                                title="Add book by photo (no ISBN scan)">
                                <ImageIcon size={20} />
                            </button>
                        )}
                    </div>
                    </>
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

                {(isbnSuggestions.length > 0 || Object.keys(repairedMap).length > 0) && (
                    <div className={s.suggestionRow} role="group" aria-label="ISBN suggestions" aria-live="polite">
                        {Object.entries(repairedMap).map(([repaired, original], idx) => (
                            <button key={`rep-${repaired}`} ref={idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => onScan(repaired)}
                                className={`glass ${s.suggestionBtn} ${s.repairBtn}`}
                                title={`Try repaired: ${original} → ${repaired}`}
                                aria-label={`Try repaired ISBN ${repaired}`}>
                                Try <strong>{repaired}</strong> ✓
                            </button>
                        ))}
                        {isbnSuggestions.filter(c => !Object.keys(repairedMap).includes(c)).map((candidate, idx) => (
                            <button key={candidate} ref={Object.keys(repairedMap).length === 0 && idx === 0 ? firstSuggestionRef : undefined} type="button"
                                onClick={() => {
                                    if (isValidIsbn(candidate)) onScan(candidate);
                                    else { setManualIsbn(candidate); setShowManual(true); }
                                }}
                                className={`glass ${s.suggestionBtn}`}
                                title={isValidIsbn(candidate) ? 'Valid ISBN — tap to add' : 'Checksum may be invalid — tap to edit'}>
                                {candidate}
                                {isValidIsbn(candidate)
                                    ? <span style={{ color: '#22c55e', fontWeight: 700 }}>{'\u2713'}</span>
                                    : <span className={s.suggestionNote}>?</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scanner;
