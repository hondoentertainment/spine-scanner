import { useRef, useCallback, useEffect } from 'react';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { tryFixChecksum } from '../utils/ocr.ts';

/* ================================================================
 *  Constants
 * ================================================================ */

/** Interval (ms) between continuous barcode scans. ~5fps. */
const BARCODE_SCAN_INTERVAL = 200;
/** Run ZXing fallback every N frames when native detector is also active. */
const ZXING_FALLBACK_EVERY_N_FRAMES = 1;
/** Require repeated detection to reduce one-frame false positives. */
const LIVE_DETECTION_CONFIRMATIONS = 1;
/** Prevent repeated triggers of the same live code in quick succession. */
const LIVE_SCAN_DUPLICATE_COOLDOWN_MS = 3000;

/* ================================================================
 *  Types
 * ================================================================ */

export interface LiveScanTelemetry {
    attempts: number;
    nativeHits: number;
    zxingHits: number;
    confirmed: number;
    cooldownSuppressed: number;
    busySuppressed: number;
}

const EMPTY_TELEMETRY: LiveScanTelemetry = {
    attempts: 0, nativeHits: 0, zxingHits: 0,
    confirmed: 0, cooldownSuppressed: 0, busySuppressed: 0,
};

interface UseBarcodeOptions {
    addLog: (msg: string) => void;
    onScan: (isbn: string) => void;
    isScanning: boolean;
    cameraReady: boolean;
    cameraError: string | null;
    webcamRef: React.RefObject<HTMLVideoElement | { video: HTMLVideoElement | null } | null>;
    isBusy: () => boolean;
}

/**
 * Validates and optionally repairs a raw barcode string.
 * Returns a valid ISBN or null.
 */
function validateBarcode(raw: string, addLog: (m: string) => void, source: string): string | null {
    if (isValidIsbn(raw)) {
        addLog(`${source}: ${raw} ✓`);
        return raw;
    }
    const repaired = tryFixChecksum(raw);
    if (repaired) {
        addLog(`${source}: ${raw} → repaired to ${repaired} ✓`);
        return repaired;
    }
    addLog(`${source}: ${raw} (invalid checksum, repair failed)`);
    return null;
}

/**
 * Custom hook for continuous live barcode scanning.
 * Uses native BarcodeDetector where available, falls back to ZXing.
 */
export function useBarcodeScanner({
    addLog, onScan, isScanning, cameraReady, cameraError, webcamRef, isBusy,
}: UseBarcodeOptions) {
    const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const barcodeDetectorRef = useRef<any | null>(null);
    const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const liveZxingImageRef = useRef<HTMLImageElement | null>(null);
    const liveDetectedCandidateRef = useRef<string | null>(null);
    const liveDetectedStreakRef = useRef(0);
    const lastLiveAcceptedRef = useRef<{ isbn: string; at: number } | null>(null);
    const telemetryRef = useRef<LiveScanTelemetry>({ ...EMPTY_TELEMETRY });
    const telemetryStateRef = useRef<(t: LiveScanTelemetry) => void>(() => {});
    const continuousActiveRef = useRef(false);

    // Create offscreen canvas & reusable image on mount
    useEffect(() => {
        barcodeCanvasRef.current = document.createElement('canvas');
        liveZxingImageRef.current = new Image();
        return () => {
            barcodeCanvasRef.current = null;
            liveZxingImageRef.current = null;
        };
    }, []);

    const bumpTelemetry = useCallback((field: keyof LiveScanTelemetry, amount = 1, flush = false) => {
        telemetryRef.current[field] += amount;
        if (flush || field !== 'attempts' || telemetryRef.current.attempts % 20 === 0) {
            telemetryStateRef.current({ ...telemetryRef.current });
        }
    }, []);

    const getBarcodeReader = useCallback(async () => {
        if (barcodeReaderRef.current) return barcodeReaderRef.current;
        const [browserMod, libraryMod] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(libraryMod.DecodeHintType.POSSIBLE_FORMATS, [
            libraryMod.BarcodeFormat.EAN_13, libraryMod.BarcodeFormat.EAN_8,
            libraryMod.BarcodeFormat.UPC_A, libraryMod.BarcodeFormat.UPC_E,
        ]);
        hints.set(libraryMod.DecodeHintType.TRY_HARDER, true);
        const reader = new browserMod.BrowserMultiFormatReader(hints);
        barcodeReaderRef.current = reader;
        addLog('ZXing reader initialized (EAN-13/EAN-8/UPC-A/UPC-E, TRY_HARDER)');
        return reader;
    }, [addLog]);

    const getBarcodeDetector = useCallback(() => {
        if (!('BarcodeDetector' in window)) return null;
        if (barcodeDetectorRef.current) return barcodeDetectorRef.current;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            barcodeDetectorRef.current = new (window as any).BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
            });
            return barcodeDetectorRef.current;
        } catch { return null; }
    }, []);

    /** Decode barcode from an image source (for capture/upload pipeline). */
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
            if (text.length === 13 || text.length === 10) {
                addLog(`Barcode [${label}]: ${text}${isValidIsbn(text) ? ' ✓' : ' (bad checksum)'}`);
                return text;
            }
        } catch { /* No barcode — normal */ }
        return null;
    }, [getBarcodeReader, addLog]);

    /** Run the continuous barcode scanning loop. */
    useEffect(() => {
        if (!cameraReady || cameraError || isScanning) return;

        let active = true;
        let scanCount = 0;
        telemetryRef.current = { ...EMPTY_TELEMETRY };
        telemetryStateRef.current({ ...EMPTY_TELEMETRY });
        continuousActiveRef.current = true;

        const hasNative = 'BarcodeDetector' in window;
        addLog(`Continuous barcode scanning started (native: ${hasNative ? 'yes' : 'no'}, ZXing: yes)`);

        const getVideo = (): HTMLVideoElement | null => {
            const ref = webcamRef.current;
            if (!ref) return null;
            if ('video' in ref && ref.video) return ref.video as HTMLVideoElement;
            if (ref instanceof HTMLVideoElement) return ref;
            return null;
        };

        const scan = async () => {
            if (!active) return;

            const video = getVideo();
            if (!video || video.readyState < 2) {
                if (active) setTimeout(scan, 500);
                return;
            }
            bumpTelemetry('attempts');

            try {
                let isbn: string | null = null;

                // Native BarcodeDetector
                const detector = getBarcodeDetector();
                if (detector) {
                    try {
                        const barcodes = await detector.detect(video);
                        for (const bc of barcodes) {
                            const raw = (bc.rawValue || '').replace(/[^0-9X]/g, '');
                            if (raw.length === 13 || raw.length === 10) {
                                isbn = validateBarcode(raw, addLog, 'Native detector');
                                if (isbn) { bumpTelemetry('nativeHits', 1, true); break; }
                            }
                        }
                    } catch (err) {
                        if (scanCount === 0) addLog(`Native detector error: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                // ZXing fallback
                if (!isbn && (!detector || scanCount % ZXING_FALLBACK_EVERY_N_FRAMES === 0)) {
                    const bCanvas = barcodeCanvasRef.current;
                    if (bCanvas) {
                        const ctx = bCanvas.getContext('2d');
                        if (ctx) {
                            bCanvas.width = video.videoWidth;
                            bCanvas.height = video.videoHeight;

                            // Attempt 1: preprocessed
                            ctx.filter = 'grayscale(1) contrast(1.8)';
                            ctx.drawImage(video, 0, 0);
                            ctx.filter = 'none';

                            try {
                                const reader = await getBarcodeReader();
                                const tmpImg = liveZxingImageRef.current ?? new Image();
                                liveZxingImageRef.current = tmpImg;

                                const loadImg = (url: string) => new Promise<void>((resolve, reject) => {
                                    tmpImg.onload = () => resolve();
                                    tmpImg.onerror = () => reject(new Error('fail'));
                                    tmpImg.src = url;
                                });

                                const tryDecode = async (): Promise<string | null> => {
                                    try {
                                        const result = await reader.decodeFromImageElement(tmpImg);
                                        return result.getText().replace(/[^0-9X]/g, '');
                                    } catch { return null; }
                                };

                                await loadImg(bCanvas.toDataURL('image/png'));
                                let raw = await tryDecode();
                                if (raw && (raw.length === 13 || raw.length === 10)) {
                                    isbn = validateBarcode(raw, addLog, 'ZXing');
                                    if (isbn) bumpTelemetry('zxingHits', 1, true);
                                }

                                if (!isbn) {
                                    // Attempt 2: raw frame
                                    ctx.drawImage(video, 0, 0);
                                    await loadImg(bCanvas.toDataURL('image/png'));
                                    raw = await tryDecode();
                                    if (raw && (raw.length === 13 || raw.length === 10)) {
                                        isbn = validateBarcode(raw, addLog, 'ZXing');
                                        if (isbn) bumpTelemetry('zxingHits', 1, true);
                                    }
                                }
                            } catch { /* No barcode */ }
                        }
                    }
                }

                // Streak confirmation & acceptance
                if (isbn) {
                    if (liveDetectedCandidateRef.current === isbn) liveDetectedStreakRef.current += 1;
                    else { liveDetectedCandidateRef.current = isbn; liveDetectedStreakRef.current = 1; }

                    const accepted = lastLiveAcceptedRef.current;
                    const isDup = !!accepted && accepted.isbn === isbn && Date.now() - accepted.at < LIVE_SCAN_DUPLICATE_COOLDOWN_MS;

                    if (!isDup && liveDetectedStreakRef.current >= LIVE_DETECTION_CONFIRMATIONS) {
                        if (isBusy()) { bumpTelemetry('busySuppressed', 1, true); }
                        else {
                            bumpTelemetry('confirmed', 1, true);
                            addLog(`Barcode (live): ${isbn} ✓`);
                            lastLiveAcceptedRef.current = { isbn, at: Date.now() };
                            continuousActiveRef.current = false;
                            active = false;
                            onScan(isbn);
                            return;
                        }
                    } else if (isDup && liveDetectedStreakRef.current >= LIVE_DETECTION_CONFIRMATIONS) {
                        bumpTelemetry('cooldownSuppressed', 1, true);
                    }
                } else {
                    liveDetectedCandidateRef.current = null;
                    liveDetectedStreakRef.current = 0;
                }
            } catch { /* Scan error — continue */ }

            scanCount++;
            if (scanCount === 1) addLog(`Scanning for barcodes... (${getVideo()?.videoWidth}x${getVideo()?.videoHeight})`);
            else if (scanCount % 30 === 0) {
                const t = telemetryRef.current;
                addLog(`Scan #${scanCount}: native=${t.nativeHits}, zxing=${t.zxingHits}, confirmed=${t.confirmed}`);
            }

            if (active) setTimeout(scan, document.hidden ? 600 : BARCODE_SCAN_INTERVAL);
        };

        setTimeout(scan, 500);

        return () => {
            active = false;
            continuousActiveRef.current = false;
            liveDetectedCandidateRef.current = null;
            liveDetectedStreakRef.current = 0;
            addLog('Continuous barcode scanning stopped');
        };
    }, [cameraReady, cameraError, isScanning, onScan, getBarcodeReader, getBarcodeDetector, addLog, bumpTelemetry, webcamRef, isBusy]);

    return {
        tryBarcodeDecode,
        getBarcodeReader,
        telemetryRef,
        setTelemetryCallback: (cb: (t: LiveScanTelemetry) => void) => { telemetryStateRef.current = cb; },
        continuousActiveRef,
    };
}
