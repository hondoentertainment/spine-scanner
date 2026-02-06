import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import Tesseract from 'tesseract.js';
import { Camera, Loader2, Edit3, Check, Terminal, Play, Square } from 'lucide-react';
import { validateISBN } from '../utils/isbnValidation.ts';

interface ScannerProps {
    onScan: (isbn: string) => void;
    isScanning: boolean;
}

// Viewfinder dimensions as fractions of the video frame (must match CSS .viewfinder)
const VIEWFINDER_WIDTH = 0.90;
const VIEWFINDER_HEIGHT = 0.25;

// Adaptive video constraints: prefer high-res but let mobile pick what works
const getVideoConstraints = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return {
        facingMode: 'environment',
        width: isMobile ? { ideal: 1280 } : { ideal: 1280 },
        height: isMobile ? { ideal: 720 } : { ideal: 720 },
    };
};

/**
 * Fix common OCR misreads in digit strings:
 * O/o -> 0, I/l -> 1, S/s -> 5, B -> 8, G/g -> 9, Z/z -> 2
 */
const fixOcrDigits = (s: string): string =>
    s.replace(/[Oo]/g, '0')
     .replace(/[Il|]/g, '1')
     .replace(/[Ss]/g, '5')
     .replace(/[Bb]/g, '8')
     .replace(/[Gg]/g, '9')
     .replace(/[Zz]/g, '2');

/**
 * Extract ISBN candidates from OCR text.
 * Tries both the raw text and an OCR-corrected version.
 */
const extractIsbn = (text: string): string | null => {
    const candidates: string[] = [];

    for (const source of [text, fixOcrDigits(text)]) {
        // Look for ISBN-13 (starts with 978 or 979) and ISBN-10 patterns
        const matches = source.match(/[0-9][- 0-9]{8,17}[0-9X]/g);
        if (matches) {
            for (const m of matches) {
                const clean = m.replace(/[^0-9X]/g, '');
                if (clean.length === 13 || clean.length === 10) {
                    candidates.push(clean);
                }
            }
        }
    }

    // Also try: look for "ISBN" label nearby and grab following digits
    const isbnLabel = text.match(/ISBN[- ]?(?:1[03])?[: ]?\s*([0-9X][- 0-9X]{9,17})/gi);
    if (isbnLabel) {
        for (const m of isbnLabel) {
            const digits = m.replace(/[^0-9X]/g, '');
            if (digits.length === 13 || digits.length === 10) {
                candidates.push(digits);
            }
        }
    }

    // Prefer ISBN-13 starting with 978/979, then any ISBN-13, then ISBN-10
    const isbn13_978 = candidates.find(c => c.length === 13 && (c.startsWith('978') || c.startsWith('979')));
    if (isbn13_978) return isbn13_978;

    const isbn13 = candidates.find(c => c.length === 13);
    if (isbn13) return isbn13;

    const isbn10 = candidates.find(c => c.length === 10);
    if (isbn10) return isbn10;

    return null;
};

/**
 * Crop the center viewfinder region from the full image, apply preprocessing,
 * and return the processed image as a data URL.
 * Optionally rotate by the given degrees.
 */
const preprocessImage = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    rotateDeg: number = 0,
): string => {
    const ctx = canvas.getContext('2d')!;

    // Crop to viewfinder region
    const cropX = img.width * (1 - VIEWFINDER_WIDTH) / 2;
    const cropY = img.height * (1 - VIEWFINDER_HEIGHT) / 2;
    const cropW = img.width * VIEWFINDER_WIDTH;
    const cropH = img.height * VIEWFINDER_HEIGHT;

    // Scale up the cropped region for better OCR accuracy
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

    // Apply contrast boost and grayscale via CSS filter
    ctx.filter = 'grayscale(100%) contrast(200%) brightness(110%)';
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    // Apply manual thresholding for better binarization
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = avg > 128 ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
};

const Scanner: React.FC<ScannerProps> = ({ onScan, isScanning }) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<string>('Align ISBN inside viewfinder');
    const [manualIsbn, setManualIsbn] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const autoScanRef = useRef(false);
    const processingRef = useRef(false);

    // Keep refs in sync with state for use in interval callbacks
    useEffect(() => {
        autoScanRef.current = autoScan;
    }, [autoScan]);
    useEffect(() => {
        processingRef.current = processing;
    }, [processing]);

    const addLog = (msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 15));
    };

    const runOcrOnImage = useCallback(async (processedImage: string, label: string): Promise<string | null> => {
        const { data: { text } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: (m) => {
                if (m.status === 'recognizing text' && m.progress) {
                    setStatus(`Scanning (${label})... ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        addLog(`[${label}] text: "${text.trim().substring(0, 50)}"`);
        return extractIsbn(text);
    }, []);

    const capture = useCallback(async () => {
        if (!webcamRef.current || processingRef.current || isScanning) return;

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc || !canvasRef.current) {
            addLog('Error: Failed to capture frame');
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        setStatus('Processing...');

        try {
            const canvas = canvasRef.current;
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = imageSrc;
            });

            // Try horizontal (normal orientation) first
            addLog('Trying horizontal scan...');
            const horizontalImg = preprocessImage(img, canvas, 0);
            let isbn = await runOcrOnImage(horizontalImg, 'horiz');

            // If no result, try rotated 90° (for vertical book spines)
            if (!isbn) {
                addLog('Trying 90° rotation...');
                const rotated90 = preprocessImage(img, canvas, 90);
                isbn = await runOcrOnImage(rotated90, 'rot90');
            }

            // Try 270° rotation as well
            if (!isbn) {
                addLog('Trying 270° rotation...');
                const rotated270 = preprocessImage(img, canvas, 270);
                isbn = await runOcrOnImage(rotated270, 'rot270');
            }

            if (isbn) {
                addLog(`ISBN found: ${isbn}`);
                setStatus(`Found ISBN: ${isbn}`);
                setAutoScan(false);
                onScan(isbn);
            } else {
                addLog('No ISBN detected in any orientation.');
                if (!autoScanRef.current) {
                    setStatus('No ISBN detected. Try adjusting position or use manual input.');
                    setShowManual(true);
                } else {
                    setStatus('Auto-scanning... adjust book position');
                }
            }
        } catch (err: unknown) {
            addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setStatus('Scan failed. Try again.');
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runOcrOnImage]);

    // Auto-scan: repeatedly capture every 2 seconds
    useEffect(() => {
        if (!autoScan) return;

        addLog('Auto-scan started');
        setStatus('Auto-scanning... align ISBN in viewfinder');

        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current) {
                capture();
            }
        }, 2000);

        return () => {
            clearInterval(interval);
            addLog('Auto-scan stopped');
        };
    }, [autoScan, capture]);

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanIsbn = manualIsbn.replace(/[^0-9X]/g, '');
        const validation = validateISBN(cleanIsbn);
        if (validation.valid) {
            onScan(cleanIsbn);
            setManualIsbn('');
            setShowManual(false);
        } else {
            alert(validation.error || 'Invalid ISBN');
        }
    };

    return (
        <div className="scanner-container glass" style={{ position: 'relative', overflow: 'hidden' }}>
            <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints()}
                style={{ width: '100%', height: 'auto', display: 'block', minHeight: '240px' }}
                playsInline
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="viewfinder"></div>

            <button
                onClick={() => setShowDebug(!showDebug)}
                style={{
                    position: 'absolute', top: '0.75rem', right: '0.75rem', padding: '0.625rem',
                    borderRadius: '50%', background: showDebug ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                    color: 'white', border: 'none', cursor: 'pointer', zIndex: 100,
                    WebkitTapHighlightColor: 'transparent',
                    minWidth: '44px', minHeight: '44px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <Terminal size={16} />
            </button>

            {showDebug && (
                <div style={{
                    position: 'absolute', top: '3.5rem', right: '0.75rem',
                    width: 'min(260px, calc(100% - 1.5rem))',
                    background: 'rgba(0,0,0,0.85)', padding: '0.75rem', borderRadius: '0.5rem',
                    fontSize: '0.65rem', color: '#00ff00', fontFamily: 'monospace',
                    pointerEvents: 'none', zIndex: 100, border: '1px solid #00ff00',
                    maxHeight: '200px', overflowY: 'auto'
                }}>
                    <div style={{ marginBottom: '0.5rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.2rem', fontWeight: 'bold' }}>SCANNER LOGS</div>
                    {debugLogs.map((log, i) => (
                        <div key={i} style={{ marginBottom: '0.2rem' }}>&gt; {log}</div>
                    ))}
                </div>
            )}

            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                    <p style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{status}</p>
                    {(isScanning || (autoScan && processing)) && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />}
                </div>

                {!showManual ? (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button
                            onClick={capture}
                            disabled={processing || isScanning || autoScan}
                            className="glass"
                            style={{
                                padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                color: 'white', background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
                                fontSize: '0.9rem', fontWeight: 600, borderRadius: '9999px',
                                minHeight: '48px', WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'Capture'}
                        </button>
                        <button
                            onClick={() => setAutoScan(prev => !prev)}
                            disabled={isScanning}
                            className="glass"
                            style={{
                                padding: '0.875rem', color: 'white', borderRadius: '9999px',
                                background: autoScan ? 'var(--accent-blue)' : 'transparent',
                                minWidth: '48px', minHeight: '48px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                            title={autoScan ? 'Stop auto-scan' : 'Start auto-scan'}
                        >
                            {autoScan ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button
                            onClick={() => setShowManual(true)}
                            className="glass"
                            style={{
                                padding: '0.875rem', color: 'white', borderRadius: '9999px',
                                minWidth: '48px', minHeight: '48px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                            title="Manual ISBN entry"
                        >
                            <Edit3 size={20} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '340px' }}>
                        <input
                            type="text" inputMode="numeric" placeholder="Enter ISBN..." value={manualIsbn}
                            onChange={(e) => setManualIsbn(e.target.value)}
                            className="glass" autoFocus
                            style={{
                                flex: 1, padding: '0.75rem 1rem', border: 'none', color: 'white',
                                fontSize: '1rem', minHeight: '48px',
                            }}
                        />
                        <button
                            type="submit" disabled={manualIsbn.length < 5 || isScanning}
                            className="glass" style={{
                                padding: '0.75rem', background: 'var(--accent-blue)', color: 'white',
                                borderRadius: '0.5rem', minWidth: '48px', minHeight: '48px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        </button>
                        <button type="button" onClick={() => setShowManual(false)} className="glass" style={{
                            padding: '0.75rem', color: 'var(--text-muted)',
                            minWidth: '48px', minHeight: '48px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            Close
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Scanner;
