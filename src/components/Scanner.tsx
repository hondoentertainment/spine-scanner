import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Loader2, Edit3, Check, Play, Square, ImagePlus, Zap, Image as ImageIcon, Focus } from 'lucide-react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { useToast } from './Toast.tsx';
import { useOcrEngine } from '../hooks/useOcrEngine.ts';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.ts';
import { useScanPipeline } from '../hooks/useScanPipeline.ts';
import type { LiveScanTelemetry } from '../hooks/useBarcodeScanner.ts';
import DebugPanel from './DebugPanel.tsx';
import s from './Scanner.module.css';

/* ================================================================
 *  Types & Constants
 * ================================================================ */

interface ScannerProps {
    onScan: (isbn: string) => void;
    onPhotoCapture?: (imageDataUrl: string) => void;
    isScanning: boolean;
}

const EMPTY_TELEMETRY: LiveScanTelemetry = {
    attempts: 0, nativeHits: 0, zxingHits: 0,
    confirmed: 0, cooldownSuppressed: 0, busySuppressed: 0,
};

const getVideoConstraints = (): MediaTrackConstraints => ({
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(({ focusMode: { ideal: 'continuous' } }) as any),
});

/* ================================================================
 *  Component
 * ================================================================ */

const Scanner: React.FC<ScannerProps> = ({ onScan, onPhotoCapture, isScanning }) => {
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
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const [liveTelemetry, setLiveTelemetry] = useState<LiveScanTelemetry>({ ...EMPTY_TELEMETRY });

    /* ── Refs for async closures ──────────────────────────────── */
    const processingRef = useRef(false);
    const autoScanRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const photoOnlyInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { processingRef.current = processing; }, [processing]);
    useEffect(() => { autoScanRef.current = autoScan; }, [autoScan]);

    const { toast } = useToast();

    /* ── Logging ──────────────────────────────────────────────── */
    const addLog = useCallback((msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 50));
    }, []);

    /* ── OCR engine hook ──────────────────────────────────────── */
    const { preWarm, runOcr } = useOcrEngine({ addLog, setStatus });

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
        addLog, setStatus, runOcr, tryBarcodeDecode,
    });

    /* ── Pre-warm OCR when camera is ready ────────────────────── */
    useEffect(() => {
        if (cameraReady) preWarm();
    }, [cameraReady, preWarm]);

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
        setStatus('Scanning...');
        setIsbnSuggestions([]);

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
                onScan(result.isbn);
            } else if (result.suggestions.length > 0) {
                setIsbnSuggestions(result.suggestions);
                setShowManual(true);
                setStatus(autoScanRef.current
                    ? 'Auto-scanning... adjust position'
                    : 'ISBN not confirmed. Check suggestions or adjust position.');
            } else {
                if (!autoScanRef.current) {
                    setStatus('No ISBN detected. Try adjusting position or use manual input.');
                    setShowManual(true);
                } else {
                    setStatus('Auto-scanning... align ISBN in viewfinder');
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`SCAN ERROR: ${msg}`);
            setStatus(`Scan error: ${msg.substring(0, 100)}`);
            setShowDebug(true);
            toast(`Scan failed: ${msg.substring(0, 60)}`, 'error');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runPipeline, addLog, toast]);

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
                onScan(result.isbn);
            } else if (result.suggestions.length > 0) {
                setIsbnSuggestions(result.suggestions);
                setShowManual(true);
                setStatus('ISBN not confirmed. Check suggestions or try a clearer photo.');
            } else {
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
    }, [onScan, isScanning, runPipeline, addLog, toast]);

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
                onUserMedia={(stream) => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus('Scanning for barcodes automatically...');
                    try {
                        const track = stream.getVideoTracks()[0];
                        if (track) {
                            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const advanced: Record<string, any> = {};
                            if (caps?.focusMode) advanced.focusMode = 'continuous';
                            if (caps?.torch) advanced.torch = false;
                            if (Object.keys(advanced).length > 0) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                track.applyConstraints({ advanced: [advanced] } as any)
                                    .then(() => addLog(`Camera constraints applied: ${Object.keys(advanced).join(', ')}`))
                                    .catch(() => {/* best effort */});
                            }
                            const settings = track.getSettings();
                            addLog(`Camera: ${settings.width}x${settings.height}${settings.facingMode ? ` (${settings.facingMode})` : ''}`);
                        }
                    } catch { /* best effort */ }
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

            {/* P5: Barcode targeting guide */}
            <div className={s.viewfinderOverlay}>
                <div className={s.barcodeGuide}>
                    <div className={`${s.guideCorner} ${s.guideTopLeft}`} />
                    <div className={`${s.guideCorner} ${s.guideTopRight}`} />
                    <div className={`${s.guideCorner} ${s.guideBottomLeft}`} />
                    <div className={`${s.guideCorner} ${s.guideBottomRight}`} />
                    <div className={s.scanLine} />
                </div>
                <p className={s.guideHint}>Align barcode within the frame</p>
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
                    <div className={s.btnRow}>
                        <button onClick={capture} disabled={processing || isScanning || !cameraReady}
                            aria-label={processing ? 'Scanning in progress' : 'Capture and scan'}
                            className={`glass ${s.captureBtn}`}
                            style={{ background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)' }}
                            title="Capture frame for OCR text recognition">
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'OCR Scan'}
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={processing || isScanning}
                            aria-label="Upload photo of ISBN" className={`glass ${s.roundBtn}`} title="Upload photo of ISBN">
                            <ImagePlus size={20} />
                        </button>
                        <button onClick={() => setAutoScan(prev => !prev)} disabled={isScanning}
                            aria-label={autoScan ? 'Stop auto OCR scan' : 'Start auto OCR scan'}
                            className={`glass ${s.roundBtn}`}
                            style={{ background: autoScan ? 'var(--accent-blue)' : 'transparent' }}
                            title={autoScan ? 'Stop auto OCR scan' : 'Auto OCR scan (for text ISBNs)'}>
                            {autoScan ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button onClick={() => setShowManual(true)} aria-label="Manual ISBN entry"
                            className={`glass ${s.roundBtn}`} title="Manual ISBN entry">
                            <Edit3 size={20} />
                        </button>
                        <button onClick={refocus}
                            aria-label="Refocus camera" className={`glass ${s.roundBtn}`}
                            title="Tap to refocus camera">
                            <Focus size={20} />
                        </button>
                        {onPhotoCapture && (
                            <button onClick={capturePhotoOnly} disabled={processing || isScanning}
                                aria-label="Capture book photo" className={`glass ${s.roundBtn}`}
                                title="Add book by photo (no ISBN scan)">
                                <ImageIcon size={20} />
                            </button>
                        )}
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
