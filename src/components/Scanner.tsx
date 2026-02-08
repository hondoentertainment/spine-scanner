import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, Loader2, Edit3, Check, Terminal, Play, Square } from 'lucide-react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates } from '../utils/ocr.ts';
import { useToast } from './Toast.tsx';
import s from './Scanner.module.css';

interface ScannerProps {
    onScan: (isbn: string) => void;
    isScanning: boolean;
}

/* ── Camera constraints ───────────────────────────────────────── */
const getVideoConstraints = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return {
        facingMode: 'environment',
        width: isMobile ? { ideal: 1920 } : { ideal: 1280 },
        height: isMobile ? { ideal: 1080 } : { ideal: 720 },
    };
};

/* ── Image preprocessing for OCR ──────────────────────────────── */
interface CropRegion {
    /** Fraction of image width (0-1) */
    widthFrac: number;
    /** Fraction of image height (0-1) */
    heightFrac: number;
    label: string;
}

const CROP_NARROW: CropRegion = { widthFrac: 0.92, heightFrac: 0.28, label: 'narrow' };
const CROP_MEDIUM: CropRegion = { widthFrac: 0.94, heightFrac: 0.50, label: 'medium' };
const CROP_WIDE: CropRegion   = { widthFrac: 0.96, heightFrac: 0.75, label: 'wide' };

/**
 * Preprocess an image for Tesseract OCR.
 *
 * Key insight: Modern Tesseract.js v7 handles clean grayscale FAR better
 * than aggressively binarized images. Tesseract does its own adaptive
 * thresholding internally — feeding it a binarized image defeats that.
 *
 * Strategy:
 *   "clean"    → grayscale + 2x scale (let Tesseract handle the rest)
 *   "enhanced" → grayscale + moderate contrast/brightness + 2x scale
 */
const preprocessImage = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    rotateDeg: number,
    crop: CropRegion,
    mode: 'clean' | 'enhanced' = 'clean',
): string => {
    const ctx = canvas.getContext('2d')!;

    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    const scale = 2;
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

    // Apply filter based on mode — NO binarization
    if (mode === 'enhanced') {
        ctx.filter = 'grayscale(100%) contrast(140%) brightness(108%)';
    } else {
        ctx.filter = 'grayscale(100%) contrast(110%)';
    }

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    return canvas.toDataURL('image/png');
};

/**
 * Crop the image for barcode scanning (no grayscale — zxing handles it).
 */
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

/* ── Tesseract worker types ───────────────────────────────────── */
interface TesseractWorker {
    recognize: (image: string) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
}

/* ── Component ────────────────────────────────────────────────── */
const Scanner: React.FC<ScannerProps> = ({ onScan, isScanning }) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<string>('Align ISBN inside viewfinder');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [manualIsbn, setManualIsbn] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [isbnSuggestions, setIsbnSuggestions] = useState<string[]>([]);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const autoScanRef = useRef(false);
    const processingRef = useRef(false);
    const showManualRef = useRef(false);

    // Persistent barcode reader and Tesseract worker (created once, reused)
    const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const workerRef = useRef<TesseractWorker | null>(null);
    const workerInitPromise = useRef<Promise<TesseractWorker> | null>(null);

    const { toast } = useToast();

    // Keep refs in sync with state
    useEffect(() => { autoScanRef.current = autoScan; }, [autoScan]);
    useEffect(() => { processingRef.current = processing; }, [processing]);
    useEffect(() => { showManualRef.current = showManual; }, [showManual]);

    const addLog = useCallback((msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 20));
    }, []);

    /* ── Lazy barcode reader ────────────────────────────────────── */
    const getBarcodeReader = useCallback(async () => {
        if (barcodeReaderRef.current) return barcodeReaderRef.current;
        const mod = await import('@zxing/browser');
        const reader = new mod.BrowserMultiFormatReader();
        barcodeReaderRef.current = reader;
        return reader;
    }, []);

    /* ── Lazy persistent Tesseract worker ────────────────────────── */
    const getWorker = useCallback(async (): Promise<TesseractWorker> => {
        if (workerRef.current) return workerRef.current;

        // Ensure only one worker creation at a time
        if (workerInitPromise.current) return workerInitPromise.current;

        workerInitPromise.current = (async () => {
            addLog('Initializing OCR engine...');
            const tesseract = await import('tesseract.js');
            const createWorker = tesseract.createWorker;
            const PSM = tesseract.PSM;

            const worker = await createWorker('eng', 1, {
                logger: (m: { status: string; progress?: number }) => {
                    if (m.status === 'recognizing text' && m.progress) {
                        setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
                    }
                },
            });

            // Configure for ISBN detection:
            // - SINGLE_BLOCK: treat the image as a single block of text
            // - Character whitelist: only digits, X, hyphens, spaces, and ISBN label chars
            await worker.setParameters({
                tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                tessedit_char_whitelist: '0123456789X- :ISBNisbn.',
            });

            addLog('OCR engine ready');
            workerRef.current = worker as unknown as TesseractWorker;
            workerInitPromise.current = null;
            return workerRef.current;
        })();

        return workerInitPromise.current;
    }, [addLog]);

    // Terminate worker on unmount
    useEffect(() => {
        return () => {
            workerRef.current?.terminate().catch(() => {});
        };
    }, []);

    /* ── Try barcode decoding on an image/canvas ────────────────── */
    const tryBarcodeDecode = useCallback(async (
        imageSource: HTMLImageElement | string,
        label: string,
    ): Promise<string | null> => {
        try {
            const reader = await getBarcodeReader();

            let result;
            if (typeof imageSource === 'string') {
                // Data URL → load into an Image element for zxing
                const tempImg = new Image();
                await new Promise<void>((resolve, reject) => {
                    tempImg.onload = () => resolve();
                    tempImg.onerror = () => reject(new Error('Failed to load'));
                    tempImg.src = imageSource;
                });
                result = await reader.decodeFromImageElement(tempImg);
            } else {
                result = await reader.decodeFromImageElement(imageSource);
            }

            const text = result.getText().replace(/[^0-9X]/g, '');
            if ((text.length === 13 || text.length === 10) && isValidIsbn(text)) {
                addLog(`Barcode [${label}]: ${text} ✓`);
                return text;
            }
            if (text.length === 13 || text.length === 10) {
                addLog(`Barcode [${label}]: ${text} (invalid checksum)`);
                return text; // Still return — it's a real barcode read
            }
        } catch {
            // No barcode found — this is normal
        }
        return null;
    }, [getBarcodeReader, addLog]);

    /* ── Run OCR on a preprocessed image ────────────────────────── */
    const runOcr = useCallback(async (
        processedImage: string,
        label: string,
    ): Promise<{ isbn: string | null; allCandidates: string[] }> => {
        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(processedImage);

        const trimmed = text.trim();
        addLog(`[${label}] OCR: "${trimmed.substring(0, 60)}"`);

        const candidates = extractIsbnCandidates(trimmed);

        if (candidates.length > 0) {
            addLog(`[${label}] candidates: ${candidates.slice(0, 3).join(', ')}`);
        }

        // Only auto-accept a candidate if it has a valid ISBN checksum
        const validIsbn = candidates.find(c => isValidIsbn(c));
        return { isbn: validIsbn ?? null, allCandidates: candidates };
    }, [getWorker, addLog]);

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

        // Capture screenshot from webcam
        let imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            // Fallback: draw current video frame to canvas
            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { addLog('Error: No canvas context'); return; }
            ctx.drawImage(video, 0, 0, width, height);
            imageSrc = canvas.toDataURL('image/jpeg', 0.92);
        }

        if (!imageSrc) { addLog('Error: Failed to capture frame'); return; }

        processingRef.current = true;
        setProcessing(true);
        setStatus('Scanning...');
        setIsbnSuggestions([]);

        const allCandidates = new Set<string>();

        try {
            // Load captured image into an Image element
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = imageSrc;
            });

            /* ─── Phase 1: Barcode scanning (fast) ─────────────── */
            addLog('Phase 1: Barcode scan...');
            setStatus('Scanning barcode...');

            // Try full frame first
            let isbn = await tryBarcodeDecode(img, 'full');

            // Try cropped viewfinder region
            if (!isbn) {
                const croppedBarcode = cropForBarcode(img, canvas, CROP_NARROW);
                isbn = await tryBarcodeDecode(croppedBarcode, 'crop');
            }

            // Try medium crop
            if (!isbn) {
                const medCrop = cropForBarcode(img, canvas, CROP_MEDIUM);
                isbn = await tryBarcodeDecode(medCrop, 'med');
            }

            if (isbn && isValidIsbn(isbn)) {
                addLog(`ISBN found via barcode: ${isbn}`);
                setStatus(`Found ISBN: ${isbn}`);
                setAutoScan(false);
                onScan(isbn);
                return;
            }
            if (isbn) {
                // Barcode read but invalid checksum — keep as suggestion
                allCandidates.add(isbn);
                addLog(`Barcode read (invalid checksum): ${isbn}`);
            }

            /* ─── Phase 2: OCR scanning (slower) ──────────────── */
            addLog('Phase 2: OCR scan...');

            // Strategy: try multiple crop regions x orientations x preprocessing
            // Stop as soon as we find a valid ISBN
            const ocrPasses: Array<{
                crop: CropRegion;
                rotation: number;
                mode: 'clean' | 'enhanced';
                label: string;
            }> = [
                // Narrow crop, horizontal (most likely for back-cover ISBN)
                { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: 'narrow-0°' },
                { crop: CROP_NARROW, rotation: 0,   mode: 'enhanced', label: 'narrow-0°-enh' },
                // Narrow crop, rotated (for spine text)
                { crop: CROP_NARROW, rotation: 90,  mode: 'clean',    label: 'narrow-90°' },
                { crop: CROP_NARROW, rotation: 270, mode: 'clean',    label: 'narrow-270°' },
                // Medium crop, horizontal (wider search area)
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'clean',    label: 'medium-0°' },
                { crop: CROP_MEDIUM, rotation: 0,   mode: 'enhanced', label: 'medium-0°-enh' },
                // Wide crop as last resort
                { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: 'wide-0°' },
            ];

            for (const pass of ocrPasses) {
                setStatus(`OCR: ${pass.label}...`);
                const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                const result = await runOcr(processed, pass.label);

                // Collect all candidates for suggestions
                result.allCandidates.forEach(c => allCandidates.add(c));

                if (result.isbn) {
                    addLog(`ISBN found via OCR [${pass.label}]: ${result.isbn}`);
                    setStatus(`Found ISBN: ${result.isbn}`);
                    setAutoScan(false);
                    onScan(result.isbn);
                    return;
                }
            }

            /* ─── Phase 3: No valid ISBN found ─────────────────── */
            const candidateList = Array.from(allCandidates);
            if (candidateList.length > 0) {
                addLog(`No valid ISBN, but ${candidateList.length} suggestion(s)`);
                setIsbnSuggestions(candidateList.slice(0, 5));
                if (!showManualRef.current) {
                    setShowManual(true);
                }
                if (!autoScanRef.current) {
                    setStatus('ISBN not confirmed. Check suggestions below or adjust position.');
                } else {
                    setStatus('Auto-scanning... adjust position');
                }
            } else {
                addLog('No ISBN detected in any orientation/crop.');
                if (!autoScanRef.current) {
                    setStatus('No ISBN detected. Try adjusting position or use manual input.');
                    setShowManual(true);
                } else {
                    setStatus('Auto-scanning... align ISBN in viewfinder');
                }
            }
        } catch (err: unknown) {
            addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setStatus('Scan failed. Try again.');
            toast('Scan failed. Please try again or use manual entry.', 'error');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, tryBarcodeDecode, runOcr, addLog, toast]);

    /* ── Auto-scan interval ───────────────────────────────────── */
    useEffect(() => {
        if (!autoScan) return;
        addLog('Auto-scan started');
        setStatus('Auto-scanning... align ISBN in viewfinder');
        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current) capture();
        }, 2500);
        return () => { clearInterval(interval); addLog('Auto-scan stopped'); };
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
                screenshotQuality={0.92}
                videoConstraints={getVideoConstraints()}
                onUserMedia={() => {
                    setCameraError(null);
                    setCameraReady(true);
                    setStatus('Align ISBN inside viewfinder');
                }}
                onUserMediaError={(err) => {
                    const msg = err instanceof Error ? err.message : 'Camera access denied';
                    setCameraError(`Camera error: ${msg}`);
                    setStatus('Camera error. Check permissions.');
                }}
                style={{ width: '100%', height: 'auto', display: 'block', minHeight: '240px' }}
                playsInline
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="viewfinder"></div>

            {/* Debug log toggle */}
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

            {/* Controls */}
            <div className={s.controls}>
                <div className={s.statusLine}>
                    <div className={s.cameraStatus}>
                        <span className={`${s.cameraDot} ${cameraReady ? s.cameraDotReady : cameraError ? s.cameraDotError : s.cameraDotPending}`} />
                        <span className={s.cameraLabel}>
                            {cameraError ? 'Camera error' : cameraReady ? 'Camera ready' : 'Camera starting'}
                        </span>
                    </div>
                    <p className={s.statusText}>{status}</p>
                    {(isScanning || (autoScan && processing)) && (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    )}
                </div>
                {cameraError && (
                    <div className={s.cameraError}>{cameraError}</div>
                )}

                {!showManual ? (
                    <div className={s.btnRow}>
                        <button
                            onClick={capture}
                            disabled={processing || isScanning || autoScan || !!cameraError || !cameraReady}
                            aria-label={processing ? 'Scanning in progress' : 'Capture and scan'}
                            className={`glass ${s.captureBtn}`}
                            style={{ background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)' }}
                        >
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'Capture'}
                        </button>
                        <button
                            onClick={() => setAutoScan(prev => !prev)}
                            disabled={isScanning}
                            aria-label={autoScan ? 'Stop auto-scan' : 'Start auto-scan'}
                            className={`glass ${s.roundBtn}`}
                            style={{ background: autoScan ? 'var(--accent-blue)' : 'transparent' }}
                            title={autoScan ? 'Stop auto-scan' : 'Start auto-scan'}
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
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Enter ISBN..."
                            value={manualIsbn}
                            onChange={(e) => setManualIsbn(e.target.value)}
                            aria-label="Enter ISBN manually"
                            className={`glass ${s.manualInput}`}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={manualIsbn.length < 5 || isScanning}
                            aria-label="Submit ISBN"
                            className={`glass ${s.submitBtn}`}
                        >
                            {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowManual(false)}
                            className={`glass ${s.closeBtn}`}
                        >
                            Close
                        </button>
                    </form>
                )}

                {isbnSuggestions.length > 0 && (
                    <div className={s.suggestionRow}>
                        {isbnSuggestions.map((candidate) => (
                            <button
                                key={candidate}
                                type="button"
                                onClick={() => {
                                    if (isValidIsbn(candidate)) {
                                        onScan(candidate);
                                    } else {
                                        setManualIsbn(candidate);
                                        setShowManual(true);
                                    }
                                }}
                                className={`glass ${s.suggestionBtn}`}
                                title={isValidIsbn(candidate) ? 'Valid ISBN — tap to add' : 'Checksum may be invalid — tap to edit'}
                            >
                                {candidate}
                                {isValidIsbn(candidate)
                                    ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span>
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
