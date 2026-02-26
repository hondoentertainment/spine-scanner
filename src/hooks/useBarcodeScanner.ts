import { useRef, useCallback, useEffect } from 'react';
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { tryFixChecksum } from '../utils/ocr.ts';

/* ================================================================
 *  Constants
 * ================================================================ */

/** Interval (ms) between native BarcodeDetector polls. ~10fps. */
const NATIVE_SCAN_INTERVAL = 100;
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

/* ================================================================
 *  Helpers
 * ================================================================ */

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

/** Extract the HTMLVideoElement from a Webcam ref. */
function getVideoFromRef(
    ref: HTMLVideoElement | { video: HTMLVideoElement | null } | null,
): HTMLVideoElement | null {
    if (!ref) return null;
    if (ref instanceof HTMLVideoElement) return ref;
    if ('video' in ref && ref.video) return ref.video as HTMLVideoElement;
    return null;
}

/* ================================================================
 *  Hook
 * ================================================================ */

/**
 * Custom hook for continuous live barcode scanning.
 *
 * P1: Uses ZXing decodeFromVideoDevice() for direct video stream scanning
 *     (eliminates canvas → toDataURL → Image round-trip and memory leak).
 * P2: Only EAN_13 + UPC_A formats (no EAN-8/UPC-E to prevent misparse).
 * P3: Raw frame first — no preprocessing for the primary ZXing path.
 * P4: Does NOT stop when isScanning is true (continues independently).
 * P6: Validates video dimensions > 0 before scanning.
 * Lower: ~10fps for native detector, logs actual resolution on first frame.
 */
export function useBarcodeScanner({
    addLog, onScan, isScanning, cameraReady, cameraError, webcamRef, isBusy,
}: UseBarcodeOptions) {
    const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const barcodeDetectorRef = useRef<any | null>(null);
    const zxingControlsRef = useRef<IScannerControls | null>(null);
    const lastLiveAcceptedRef = useRef<{ isbn: string; at: number } | null>(null);
    const telemetryRef = useRef<LiveScanTelemetry>({ ...EMPTY_TELEMETRY });
    const telemetryStateRef = useRef<(t: LiveScanTelemetry) => void>(() => {});
    const continuousActiveRef = useRef(false);

    const bumpTelemetry = useCallback((field: keyof LiveScanTelemetry, amount = 1, flush = false) => {
        telemetryRef.current[field] += amount;
        if (flush || field !== 'attempts' || telemetryRef.current.attempts % 20 === 0) {
            telemetryStateRef.current({ ...telemetryRef.current });
        }
    }, []);

    /* ── ZXing reader (for capture/upload pipeline only) ──────── */
    const getBarcodeReader = useCallback(async () => {
        if (barcodeReaderRef.current) return barcodeReaderRef.current;
        const [browserMod, libraryMod] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
        ]);
        const hints = new Map();
        // P2: Only EAN-13 + UPC-A — no EAN-8/UPC-E to prevent misparse
        hints.set(libraryMod.DecodeHintType.POSSIBLE_FORMATS, [
            libraryMod.BarcodeFormat.EAN_13,
            libraryMod.BarcodeFormat.UPC_A,
        ]);
        hints.set(libraryMod.DecodeHintType.TRY_HARDER, true);
        const reader = new browserMod.BrowserMultiFormatReader(hints);
        barcodeReaderRef.current = reader;
        addLog('ZXing reader initialized (EAN-13/UPC-A, TRY_HARDER)');
        return reader;
    }, [addLog]);

    /* ── Native BarcodeDetector ───────────────────────────────── */
    const getBarcodeDetector = useCallback(() => {
        if (!('BarcodeDetector' in window)) return null;
        if (barcodeDetectorRef.current) return barcodeDetectorRef.current;
        try {
            // P2: Only EAN-13 + UPC-A
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            barcodeDetectorRef.current = new (window as any).BarcodeDetector({
                formats: ['ean_13', 'upc_a'],
            });
            return barcodeDetectorRef.current;
        } catch { return null; }
    }, []);

    /* ── Barcode decode for capture/upload pipeline ────────────── */
    /* Industry std: prefer Native BarcodeDetector when available (faster, GPU-accelerated). */
    const tryBarcodeDecode = useCallback(async (
        imageSource: HTMLImageElement | string,
        label: string,
    ): Promise<string | null> => {
        const getImg = async (): Promise<HTMLImageElement> => {
            if (typeof imageSource === 'string') {
                const tempImg = new Image();
                await new Promise<void>((resolve, reject) => {
                    tempImg.onload = () => resolve();
                    tempImg.onerror = () => reject(new Error('img load fail'));
                    tempImg.src = imageSource;
                });
                return tempImg;
            }
            return imageSource;
        };
        const img = await getImg();

        const detector = getBarcodeDetector();
        if (detector) {
            try {
                const barcodes = await detector.detect(img);
                const raw = barcodes[0]?.rawValue?.replace(/[^0-9X]/g, '');
                if (raw && (raw.length === 13 || raw.length === 10)) {
                    addLog(`Barcode [${label}] native: ${raw}${isValidIsbn(raw) ? ' ✓' : ' (bad checksum)'}`);
                    return raw;
                }
            } catch { /* fall through to ZXing */ }
        }

        try {
            const reader = await getBarcodeReader();
            const result = await reader.decodeFromImageElement(img);
            const text = result.getText().replace(/[^0-9X]/g, '');
            if (text.length === 13 || text.length === 10) {
                addLog(`Barcode [${label}]: ${text}${isValidIsbn(text) ? ' ✓' : ' (bad checksum)'}`);
                return text;
            }
        } catch { /* No barcode — normal */ }
        return null;
    }, [getBarcodeReader, getBarcodeDetector, addLog]);

    /* ── Accept a detected ISBN (shared logic) ────────────────── */
    const acceptIsbn = useCallback((isbn: string, source: string) => {
        const accepted = lastLiveAcceptedRef.current;
        const isDup = !!accepted && accepted.isbn === isbn
            && Date.now() - accepted.at < LIVE_SCAN_DUPLICATE_COOLDOWN_MS;

        if (isDup) {
            bumpTelemetry('cooldownSuppressed', 1, true);
            return;
        }
        if (isBusy()) {
            bumpTelemetry('busySuppressed', 1, true);
            return;
        }

        bumpTelemetry('confirmed', 1, true);
        addLog(`Barcode (live ${source}): ${isbn} ✓`);
        lastLiveAcceptedRef.current = { isbn, at: Date.now() };
        onScan(isbn);
    }, [addLog, onScan, bumpTelemetry, isBusy]);

    /* ================================================================
     *  P1: ZXing continuous video decoding via decodeFromVideoDevice()
     *
     *  This feeds frames directly from the video element — no canvas
     *  round-trip, no toDataURL, no Image() allocation per frame.
     * ================================================================ */
    useEffect(() => {
        // P4: Only gate on cameraReady + no error. Do NOT gate on isScanning.
        if (!cameraReady || cameraError) return;

        let cancelled = false;

        const startZxing = async () => {
            const video = getVideoFromRef(webcamRef.current);
            // P6: Validate video dimensions
            if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
                if (!cancelled) setTimeout(startZxing, 500);
                return;
            }

            try {
                const [browserMod, libraryMod] = await Promise.all([
                    import('@zxing/browser'),
                    import('@zxing/library'),
                ]);

                const hints = new Map();
                // P2: Only ISBN-relevant formats
                hints.set(libraryMod.DecodeHintType.POSSIBLE_FORMATS, [
                    libraryMod.BarcodeFormat.EAN_13,
                    libraryMod.BarcodeFormat.UPC_A,
                ]);
                hints.set(libraryMod.DecodeHintType.TRY_HARDER, true);

                const reader = new browserMod.BrowserMultiFormatReader(hints);
                // Cache for capture/upload pipeline too
                barcodeReaderRef.current = reader;

                // Lower: Log resolution on first successful init
                addLog(`ZXing continuous: starting on ${video.videoWidth}x${video.videoHeight} video`);

                // P1: Use decodeFromVideoElement — feeds directly from <video>
                // P3: No preprocessing — raw frame for best fidelity
                const controls = await reader.decodeFromVideoElement(
                    video,
                    (result, err) => {
                        if (cancelled) return;
                        if (result) {
                            const raw = result.getText().replace(/[^0-9X]/g, '');
                            if (raw.length === 13 || raw.length === 10) {
                                const isbn = validateBarcode(raw, addLog, 'ZXing-live');
                                if (isbn) {
                                    bumpTelemetry('zxingHits', 1, true);
                                    acceptIsbn(isbn, 'ZXing');
                                }
                            }
                        }
                        if (err && !(err instanceof libraryMod.NotFoundException)) {
                            // Only log non-"not found" errors once
                            if (!cancelled) addLog(`ZXing error: ${err.message}`);
                        }
                        bumpTelemetry('attempts');
                    }
                );

                if (!cancelled) {
                    zxingControlsRef.current = controls;
                    addLog('ZXing continuous decoding active');
                } else {
                    controls.stop();
                }
            } catch (err) {
                if (!cancelled) {
                    addLog(`ZXing continuous init failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        };

        startZxing();

        return () => {
            cancelled = true;
            zxingControlsRef.current?.stop();
            zxingControlsRef.current = null;
            // Release ZXing internal resources (streams, timers) per ZXING_BARCODE_DETECTION_REPORT
            try { (barcodeReaderRef.current as unknown as { reset?: () => void })?.reset?.(); } catch { /* no-op */ }
        };
    }, [cameraReady, cameraError, webcamRef, addLog, bumpTelemetry, acceptIsbn]);

    /* ================================================================
     *  Native BarcodeDetector polling loop (faster, GPU-accelerated)
     *  P4: Does NOT gate on isScanning — runs independently.
     *  P6: Validates video dimensions before detection.
     *  Lower: 100ms interval (~10fps).
     * ================================================================ */
    useEffect(() => {
        if (!cameraReady || cameraError) return;

        let active = true;
        let scanCount = 0;
        telemetryRef.current = { ...EMPTY_TELEMETRY };
        telemetryStateRef.current({ ...EMPTY_TELEMETRY });
        continuousActiveRef.current = true;

        const hasNative = 'BarcodeDetector' in window;
        addLog(`Continuous scanning started (native: ${hasNative ? 'yes' : 'no'}, ZXing-continuous: yes)`);

        const scan = async () => {
            if (!active) return;

            const video = getVideoFromRef(webcamRef.current);
            // P6: Validate dimensions
            if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
                if (active) setTimeout(scan, 500);
                return;
            }

            // Lower: Log actual resolution on first scan
            if (scanCount === 0) {
                addLog(`Scanning at ${video.videoWidth}x${video.videoHeight}`);
            }

            const detector = getBarcodeDetector();
            if (detector) {
                try {
                    const barcodes = await detector.detect(video);
                    for (const bc of barcodes) {
                        const raw = (bc.rawValue || '').replace(/[^0-9X]/g, '');
                        if (raw.length === 13 || raw.length === 10) {
                            const isbn = validateBarcode(raw, addLog, 'Native');
                            if (isbn) {
                                bumpTelemetry('nativeHits', 1, true);
                                acceptIsbn(isbn, 'native');
                                break;
                            }
                        }
                    }
                } catch (err) {
                    if (scanCount === 0) addLog(`Native error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            scanCount++;
            if (scanCount % 50 === 0) {
                const t = telemetryRef.current;
                addLog(`Scan #${scanCount}: native=${t.nativeHits}, zxing=${t.zxingHits}, confirmed=${t.confirmed}`);
            }

            // Lower: 100ms (~10fps), 600ms when hidden
            if (active) setTimeout(scan, document.hidden ? 600 : NATIVE_SCAN_INTERVAL);
        };

        setTimeout(scan, 300);

        return () => {
            active = false;
            continuousActiveRef.current = false;
            addLog('Continuous scanning stopped');
        };
    }, [cameraReady, cameraError, webcamRef, getBarcodeDetector, addLog, bumpTelemetry, acceptIsbn]);

    /* ── Refocus helper ───────────────────────────────────────── */
    const refocus = useCallback(() => {
        const video = getVideoFromRef(webcamRef.current);
        if (!video) return;
        const stream = video.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        if (!track) return;

        try {
            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
            if (caps?.focusMode) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any)
                    .then(() => addLog('Refocus triggered'))
                    .catch(() => addLog('Refocus not supported'));
            } else {
                addLog('Focus control not available on this camera');
            }
        } catch {
            addLog('Refocus failed');
        }
    }, [webcamRef, addLog]);

    /* ── Cleanup ZXing on unmount ─────────────────────────────── */
    useEffect(() => {
        return () => {
            zxingControlsRef.current?.stop();
            zxingControlsRef.current = null;
            try { (barcodeReaderRef.current as unknown as { reset?: () => void })?.reset?.(); } catch { /* no-op */ }
        };
    }, []);

    return {
        tryBarcodeDecode,
        getBarcodeReader,
        telemetryRef,
        setTelemetryCallback: (cb: (t: LiveScanTelemetry) => void) => { telemetryStateRef.current = cb; },
        continuousActiveRef,
        refocus,
        // Expose for isScanning check removal — no longer gates on isScanning
        isScanning,
    };
}
