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

const VIEWFINDER_WIDTH = 0.90;
const VIEWFINDER_HEIGHT = 0.25;

const getVideoConstraints = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return {
        facingMode: 'environment',
        width: isMobile ? { ideal: 1280 } : { ideal: 1280 },
        height: isMobile ? { ideal: 720 } : { ideal: 720 },
    };
};

const preprocessImage = (img: HTMLImageElement, canvas: HTMLCanvasElement, rotateDeg: number = 0): string => {
    const ctx = canvas.getContext('2d')!;
    const cropX = img.width * (1 - VIEWFINDER_WIDTH) / 2;
    const cropY = img.height * (1 - VIEWFINDER_HEIGHT) / 2;
    const cropW = img.width * VIEWFINDER_WIDTH;
    const cropH = img.height * VIEWFINDER_HEIGHT;
    const scale = 2;
    const outW = cropW * scale;
    const outH = cropH * scale;

    if (rotateDeg === 90 || rotateDeg === 270) {
        canvas.width = outH; canvas.height = outW;
    } else {
        canvas.width = outW; canvas.height = outH;
    }

    ctx.save();
    if (rotateDeg !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotateDeg * Math.PI) / 180);
        ctx.translate(-outW / 2, -outH / 2);
    }

    ctx.filter = 'grayscale(100%) contrast(200%) brightness(110%)';
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = avg > 128 ? 255 : 0;
        data[i] = val; data[i + 1] = val; data[i + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
};

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
    const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const tesseractRef = useRef<Promise<typeof import('tesseract.js')> | null>(null);
    const { toast } = useToast();
    const getBarcodeReader = useCallback(async () => {
        if (barcodeReaderRef.current) return barcodeReaderRef.current;
        const mod = await import('@zxing/browser');
        const reader = new mod.BrowserMultiFormatReader();
        barcodeReaderRef.current = reader;
        return reader;
    }, []);

    const getRecognize = useCallback(async () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H2',location:'Scanner.tsx:getRecognize:134',message:'getRecognize enter',data:{hasCached:!!tesseractRef.current},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!tesseractRef.current) {
            tesseractRef.current = import('tesseract.js');
        }
        const mod = (await tesseractRef.current) as unknown as {
            recognize?: (image: unknown, lang: string, options?: unknown) => Promise<{ data: { text: string } }>;
            default?: { recognize?: (image: unknown, lang: string, options?: unknown) => Promise<{ data: { text: string } }> };
        };
        const recognize = mod.recognize ?? mod.default?.recognize;
        if (!recognize) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H2',location:'Scanner.tsx:getRecognize:146',message:'recognize missing',data:{hasModRecognize:!!mod.recognize,hasDefaultRecognize:!!mod.default?.recognize},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            throw new Error('Tesseract recognize() not available');
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H2',location:'Scanner.tsx:getRecognize:151',message:'getRecognize ok',data:{hasRecognize:true},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return recognize;
    }, []);


    useEffect(() => { autoScanRef.current = autoScan; }, [autoScan]);
    useEffect(() => { processingRef.current = processing; }, [processing]);

    const addLog = (msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 15));
    };

    const runOcrOnImage = useCallback(async (processedImage: string, label: string): Promise<string | null> => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H1',location:'Scanner.tsx:runOcrOnImage:164',message:'ocr start',data:{label,imageSize:processedImage?.length||0},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const recognize = await getRecognize();
        const { data: { text } } = await recognize(processedImage, 'eng', {
            logger: (m: { status: string; progress?: number }) => {
                if (m.status === 'recognizing text' && m.progress) {
                    setStatus(`Scanning (${label})... ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        addLog(`[${label}] text: "${text.trim().substring(0, 50)}"`);
        const candidates = extractIsbnCandidates(text);
        if (candidates.length > 0) {
            setIsbnSuggestions(candidates.slice(0, 5));
            if (!showManual) {
                setShowManual(true);
            }
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H1',location:'Scanner.tsx:runOcrOnImage:182',message:'ocr result',data:{label,textSample:text.trim().slice(0,80),candidateCount:candidates.length,firstCandidate:candidates[0]||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return candidates.length > 0 ? candidates[0] : null;
    }, [getRecognize, showManual]);

    const capture = useCallback(async () => {
        if (!webcamRef.current || processingRef.current || isScanning) return;
        const video = webcamRef.current.video as HTMLVideoElement | undefined;
        const canvas = canvasRef.current;
        if (!canvas) { addLog('Error: Missing canvas'); return; }

        // Ensure video is ready
        if (!video || video.readyState < 2) {
            addLog('Error: Video not ready');
            setStatus('Camera is not ready yet. Please wait...');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H3',location:'Scanner.tsx:capture:202',message:'video not ready',data:{hasVideo:!!video,readyState:video?.readyState||null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            return;
        }

        let imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            // Fallback: draw the current video frame manually
            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { addLog('Error: No canvas context'); return; }
            ctx.drawImage(video, 0, 0, width, height);
            imageSrc = canvas.toDataURL('image/jpeg');
        }

        if (!imageSrc) { addLog('Error: Failed to capture frame'); return; }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H3',location:'Scanner.tsx:capture:224',message:'captured image',data:{imageSize:imageSrc.length,usedFallback:!webcamRef.current.getScreenshot || !webcamRef.current.getScreenshot()},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        processingRef.current = true;
        setProcessing(true);
        setStatus('Processing...');
        setIsbnSuggestions([]);

        try {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = imageSrc;
            });

            addLog('Trying barcode scan...');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H4',location:'Scanner.tsx:capture:241',message:'barcode scan start',data:{},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            let isbn: string | null = null;
            try {
                const reader = await getBarcodeReader();
                const result = await reader.decodeFromImageElement(img);
                const text = result.getText().replace(/[^0-9X]/g, '');
                if (text.length === 13 || text.length === 10) { addLog(`Barcode detected: ${text}`); isbn = text; }
            } catch { addLog('No barcode found, falling back to OCR'); }

            if (!isbn) { addLog('Trying horizontal scan...'); isbn = await runOcrOnImage(preprocessImage(img, canvas, 0), 'horiz'); }
            if (!isbn) { addLog('Trying 90° rotation...'); isbn = await runOcrOnImage(preprocessImage(img, canvas, 90), 'rot90'); }
            if (!isbn) { addLog('Trying 270° rotation...'); isbn = await runOcrOnImage(preprocessImage(img, canvas, 270), 'rot270'); }

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
            toast('OCR failed. Please try again or use manual entry.', 'error');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5caae87c-2958-4c76-b634-193d7251694a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H5',location:'Scanner.tsx:capture:270',message:'scan error',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [onScan, isScanning, runOcrOnImage, getBarcodeReader]);

    useEffect(() => {
        if (!autoScan) return;
        addLog('Auto-scan started');
        setStatus('Auto-scanning... align ISBN in viewfinder');
        const interval = setInterval(() => {
            if (!processingRef.current && autoScanRef.current) capture();
        }, 2000);
        return () => { clearInterval(interval); addLog('Auto-scan stopped'); };
    }, [autoScan, capture]);

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

            <button onClick={() => setShowDebug(!showDebug)}
                aria-label={showDebug ? 'Hide debug logs' : 'Show debug logs'}
                className={s.debugBtn}
                style={{ background: showDebug ? 'var(--primary)' : 'rgba(0,0,0,0.5)' }}>
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
                    {(isScanning || (autoScan && processing)) && (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    )}
                </div>
                {cameraError && (
                    <div className={s.cameraError}>
                        {cameraError}
                    </div>
                )}

                {!showManual ? (
                    <div className={s.btnRow}>
                        <button onClick={capture} disabled={processing || isScanning || autoScan || !!cameraError || !cameraReady}
                            aria-label={processing ? 'Scanning in progress' : 'Capture and scan'}
                            className={`glass ${s.captureBtn}`}
                            style={{ background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)' }}>
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'Capture'}
                        </button>
                        <button onClick={() => setAutoScan(prev => !prev)} disabled={isScanning}
                            aria-label={autoScan ? 'Stop auto-scan' : 'Start auto-scan'}
                            className={`glass ${s.roundBtn}`}
                            style={{ background: autoScan ? 'var(--accent-blue)' : 'transparent' }}
                            title={autoScan ? 'Stop auto-scan' : 'Start auto-scan'}>
                            {autoScan ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button onClick={() => setShowManual(true)} aria-label="Manual ISBN entry"
                            className={`glass ${s.roundBtn}`} title="Manual ISBN entry">
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
                        <button type="button" onClick={() => setShowManual(false)}
                            className={`glass ${s.closeBtn}`}>Close</button>
                    </form>
                )}
                {isbnSuggestions.length > 0 && (
                    <div className={s.suggestionRow}>
                        {isbnSuggestions.map((candidate) => (
                            <button
                                key={candidate}
                                type="button"
                                onClick={() => {
                                    setManualIsbn(candidate);
                                    setShowManual(true);
                                }}
                                className={`glass ${s.suggestionBtn}`}
                                title={isValidIsbn(candidate) ? 'Valid ISBN' : 'Checksum may be invalid'}
                            >
                                {candidate}
                                {!isValidIsbn(candidate) && (
                                    <span className={s.suggestionNote}>?</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scanner;
