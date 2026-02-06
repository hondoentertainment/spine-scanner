import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import Tesseract from 'tesseract.js';
import { Camera, Loader2, Edit3, Check, Terminal } from 'lucide-react';

interface ScannerProps {
    onScan: (isbn: string) => void;
    isScanning: boolean;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, isScanning }) => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<string>('Align ISBN inside viewfinder');
    const [manualIsbn, setManualIsbn] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);

    const addLog = (msg: string) => {
        console.log(`[Scanner] ${msg}`);
        setDebugLogs(prev => [msg, ...prev].slice(0, 10));
    };

    const capture = useCallback(async () => {
        if (!webcamRef.current || processing) return;

        addLog('Capturing frame...');
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
            addLog('Error: Failed to get screenshot');
            return;
        }
        if (!canvasRef.current) {
            addLog('Error: Canvas ref missing');
            return;
        }

        setProcessing(true);
        setStatus('Processing OCR...');

        try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const img = new Image();

            const imgPromise = new Promise((resolve, reject) => {
                img.onload = () => resolve(true);
                img.onerror = () => reject(new Error('Failed to load image'));
            });

            img.src = imageSrc;
            await imgPromise;

            canvas.width = img.width;
            canvas.height = img.height;

            if (ctx) {
                ctx.filter = 'grayscale(100%) contrast(150%)';
                ctx.drawImage(img, 0, 0);
                const processedImage = canvas.toDataURL('image/jpeg');

                addLog('OCR recognizing...');
                const { data: { text } } = await Tesseract.recognize(processedImage, 'eng', {
                    logger: (m) => {
                        if (m.status === 'recognizing text' && m.progress) {
                            setStatus(`Scanning... ${Math.round(m.progress * 100)}%`);
                        }
                    },
                });

                addLog(`Found text: ${text.substring(0, 30)}...`);

                // Resilient ISBN extraction
                const matches = text.match(/[0-9][- 0-9]{8,17}[0-9X]/g);
                let foundIsbn = null;

                if (matches) {
                    for (const m of matches) {
                        const clean = m.replace(/[^0-9X]/g, '');
                        if (clean.length === 10 || clean.length === 13) {
                            foundIsbn = clean;
                            break;
                        }
                    }
                }

                if (foundIsbn) {
                    addLog(`ISBN match: ${foundIsbn}`);
                    setStatus(`Found ISBN: ${foundIsbn}`);
                    onScan(foundIsbn);
                } else {
                    addLog('No ISBN match found in OCR.');
                    setStatus('No ISBN detected. Try manual input?');
                    setShowManual(true);
                }
            }
        } catch (err: unknown) {
            addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setStatus('Scan failed.');
        } finally {
            setProcessing(false);
        }
    }, [onScan, processing]);

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanIsbn = manualIsbn.replace(/[^0-9X]/g, '');
        if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
            onScan(cleanIsbn);
            setManualIsbn('');
            setShowManual(false);
        } else {
            alert('Please enter a 10 or 13 digit ISBN.');
        }
    };

    return (
        <div className="scanner-container glass" style={{ position: 'relative', overflow: 'hidden' }}>
            <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 1280, height: 720, facingMode: 'environment' }}
                style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="viewfinder"></div>

            <button
                onClick={() => setShowDebug(!showDebug)}
                style={{
                    position: 'absolute', top: '1rem', right: '1rem', padding: '0.5rem',
                    borderRadius: '50%', background: showDebug ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                    color: 'white', border: 'none', cursor: 'pointer', zIndex: 100
                }}
            >
                <Terminal size={16} />
            </button>

            {showDebug && (
                <div style={{
                    position: 'absolute', top: '3.5rem', right: '1rem', width: '240px',
                    background: 'rgba(0,0,0,0.85)', padding: '0.75rem', borderRadius: '0.5rem',
                    fontSize: '0.7rem', color: '#00ff00', fontFamily: 'monospace',
                    pointerEvents: 'none', zIndex: 100, border: '1px solid #00ff00'
                }}>
                    <div style={{ marginBottom: '0.5rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.2rem', fontWeight: 'bold' }}>SCANNER LOGS</div>
                    {debugLogs.map((log, i) => (
                        <div key={i} style={{ marginBottom: '0.2rem' }}>&gt; {log}</div>
                    ))}
                </div>
            )}

            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1.5rem',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <p style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{status}</p>
                    {isScanning && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />}
                </div>

                {!showManual ? (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={capture}
                            disabled={processing || isScanning}
                            className="glass"
                            style={{
                                padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                color: 'white', background: processing ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
                                fontSize: '1rem', fontWeight: 600, borderRadius: '9999px'
                            }}
                        >
                            {processing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                            {processing ? 'Scanning...' : 'Capture ISBN'}
                        </button>
                        <button
                            onClick={() => setShowManual(true)}
                            className="glass"
                            style={{ padding: '1rem', color: 'white', borderRadius: '9999px' }}
                        >
                            <Edit3 size={20} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '320px' }}>
                        <input
                            type="text" placeholder="Enter ISBN-10 or 13..." value={manualIsbn}
                            onChange={(e) => setManualIsbn(e.target.value)}
                            className="glass" autoFocus
                            style={{ flex: 1, padding: '0.75rem 1rem', border: 'none', color: 'white', fontSize: '0.875rem' }}
                        />
                        <button
                            type="submit" disabled={manualIsbn.length < 5 || isScanning}
                            className="glass" style={{ padding: '0.75rem', background: 'var(--accent-blue)', color: 'white', borderRadius: '0.5rem' }}
                        >
                            {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        </button>
                        <button type="button" onClick={() => setShowManual(false)} className="glass" style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>
                            Close
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Scanner;
