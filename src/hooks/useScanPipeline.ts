import { useCallback } from 'react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates, tryFixChecksum, getNearMissCandidates } from '../utils/ocr.ts';
import type { OcrResult } from './useOcrEngine.ts';

/* ================================================================
 *  Types & Constants
 * ================================================================ */

export interface CropRegion {
    widthFrac: number;
    heightFrac: number;
    label: string;
}

export const CROP_NARROW: CropRegion = { widthFrac: 0.92, heightFrac: 0.28, label: 'narrow' };
export const CROP_MEDIUM: CropRegion = { widthFrac: 0.94, heightFrac: 0.50, label: 'medium' };
export const CROP_WIDE: CropRegion   = { widthFrac: 0.96, heightFrac: 0.75, label: 'wide' };
export const CROP_FULL: CropRegion   = { widthFrac: 1.00, heightFrac: 1.00, label: 'full' };
export const CROP_CENTER: CropRegion = { widthFrac: 0.70, heightFrac: 0.40, label: 'center' };

export const DARK_SCENE_THRESHOLD = 90;
export const BLUR_VARIANCE_THRESHOLD = 120;
/** Skip OCR when both blurry and dark — very unlikely to succeed. */
const SKIP_OCR_BRIGHTNESS_THRESHOLD = 70;
const OCR_TOTAL_TIMEOUT = 35000;
/** Early exit when valid ISBN found with high confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 85;
const LOW_RES_WIDTH = 640;
/** Min effective pixels (short dimension) for reliable OCR. Industry std: ≥200 DPI equivalent. */
const MIN_OCR_PIXELS = 200;

type PreprocessMode = 'clean' | 'enhanced' | 'boost' | 'invert' | 'sharpen' | 'unsharp';

const PREPROCESS_FILTERS: Record<PreprocessMode, string> = {
    clean:    'grayscale(100%) contrast(110%)',
    enhanced: 'grayscale(100%) contrast(140%) brightness(108%)',
    boost:    'grayscale(100%) contrast(180%) brightness(115%)',
    invert:   'grayscale(100%) contrast(130%) invert(100%)',
    sharpen:  'grayscale(100%) contrast(130%) brightness(105%)',
    unsharp:  'grayscale(100%) contrast(120%)',  // unsharp applied in pixel loop
};

export interface FrameQuality {
    brightness: number;
    blurVariance: number;
    isDark: boolean;
    isBlurry: boolean;
}

/** Tesseract PSM: 6=SINGLE_BLOCK, 7=SINGLE_LINE, 11=SPARSE_TEXT */
interface OcrPassConfig {
    crop: CropRegion;
    rotation: number;
    mode: PreprocessMode;
    label: string;
    psm?: string;
    /** Digit whitelist for ISBN-only regions (reduces O→0, I→1 confusion). */
    charWhitelist?: string;
}

/* ================================================================
 *  Image preprocessing (pure functions)
 * ================================================================ */

/** Industry std: >300 DPI can degrade accuracy. Cap output dimension to avoid over-sharpening. */
const MAX_OUTPUT_DIM = 2400;

const getAdaptiveScale = (imgWidth: number): number => {
    if (imgWidth >= 1920) return 1.5;
    if (imgWidth >= 1280) return 2;
    if (imgWidth >= 640) return 2.5;
    return 3.5; // Slightly higher for low-res to improve OCR accuracy
};

/** Cap scale when output would exceed MAX_OUTPUT_DIM to avoid OCR degradation. */
const getResolutionCapScale = (cropW: number, cropH: number, scale: number): number => {
    const outW = cropW * scale;
    const outH = cropH * scale;
    const maxDim = Math.max(outW, outH);
    if (maxDim <= MAX_OUTPUT_DIM) return 1;
    return MAX_OUTPUT_DIM / maxDim;
};

export const isLowResolution = (imgWidth: number): boolean => imgWidth < LOW_RES_WIDTH;

/** Check if effective OCR resolution is too low. Industry std: need enough pixels for 200 DPI equiv. */
export const hasLowOcrResolution = (imgWidth: number, imgHeight: number, crop: CropRegion): boolean => {
    const cropW = imgWidth * crop.widthFrac;
    const cropH = imgHeight * crop.heightFrac;
    const shortDim = Math.min(cropW, cropH);
    return shortDim < MIN_OCR_PIXELS;
};

export const preprocessImage = (
    img: HTMLImageElement, canvas: HTMLCanvasElement,
    rotateDeg: number, crop: CropRegion, mode: PreprocessMode = 'clean',
): string => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    let scale = getAdaptiveScale(img.width);
    const capScale = getResolutionCapScale(cropW, cropH, scale);
    if (capScale < 1) scale *= capScale; // Downscale when output would exceed MAX_OUTPUT_DIM
    const outW = cropW * scale;
    const outH = cropH * scale;

    // Compute tight bounding box for arbitrary rotation angle.
    // For 0° → outW×outH; for 90°/270° → outH×outW; for skew angles (85°/95°) the
    // bounding box is larger than a simple swap — cos(5°)≈0.996, sin(5°)≈0.087.
    const rad = (rotateDeg * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(rad));
    const sinA = Math.abs(Math.sin(rad));
    canvas.width  = Math.round(outW * cosA + outH * sinA);
    canvas.height = Math.round(outW * sinA + outH * cosA);

    ctx.save();
    if (rotateDeg !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.translate(-outW / 2, -outH / 2);
    }
    ctx.filter = PREPROCESS_FILTERS[mode];
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    if ((mode === 'sharpen' || mode === 'unsharp') && typeof ctx.getImageData === 'function') {
        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const w = canvas.width;
            const h = canvas.height;
            const src = new Uint8ClampedArray(data);

            if (mode === 'sharpen') {
                // Laplacian sharpening
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const i = (y * w + x) * 4;
                        for (let c = 0; c < 3; c++) {
                            const val = 5 * src[i + c]
                                - src[((y - 1) * w + x) * 4 + c] - src[((y + 1) * w + x) * 4 + c]
                                - src[(y * w + (x - 1)) * 4 + c] - src[(y * w + (x + 1)) * 4 + c];
                            data[i + c] = Math.min(255, Math.max(0, val));
                        }
                    }
                }
            } else {
                // Unsharp mask with 1-2-1 separable Gaussian blur (better edge preservation
                // than box blur — avoids ringing on high-contrast digit edges).
                // Two-pass: horizontal then vertical convolution.
                const amount = 1.5;
                // Horizontal pass: [1,2,1]/4
                const hBlur = new Float32Array(w * h * 3);
                for (let y = 0; y < h; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const i = (y * w + x) * 4;
                        const iL = (y * w + (x - 1)) * 4;
                        const iR = (y * w + (x + 1)) * 4;
                        const bi = (y * w + x) * 3;
                        for (let c = 0; c < 3; c++) {
                            hBlur[bi + c] = (src[iL + c] + 2 * src[i + c] + src[iR + c]) / 4;
                        }
                    }
                }
                // Vertical pass: [1,2,1]/4 on hBlur → final Gaussian approximation
                const blur = new Float32Array(w * h * 3);
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const bi  = (y * w + x) * 3;
                        const biU = ((y - 1) * w + x) * 3;
                        const biD = ((y + 1) * w + x) * 3;
                        for (let c = 0; c < 3; c++) {
                            blur[bi + c] = (hBlur[biU + c] + 2 * hBlur[bi + c] + hBlur[biD + c]) / 4;
                        }
                    }
                }
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const i = (y * w + x) * 4;
                        const bi = (y * w + x) * 3;
                        for (let c = 0; c < 3; c++) {
                            const orig = src[i + c];
                            const val = orig + amount * (orig - blur[bi + c]);
                            data[i + c] = Math.min(255, Math.max(0, Math.round(val)));
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        } catch { /* skip */ }
    }
    return canvas.toDataURL('image/png');
};

export const cropForBarcode = (
    img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion,
): string => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    canvas.width = cropW; canvas.height = cropH;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return canvas.toDataURL('image/png');
};

type FrameSource = HTMLImageElement | HTMLVideoElement | { videoWidth?: number; videoHeight?: number; width?: number; height?: number };

function getFrameDimensions(src: FrameSource): { w: number; h: number } {
    if (src instanceof HTMLVideoElement) return { w: src.videoWidth || 0, h: src.videoHeight || 0 };
    if (src instanceof HTMLImageElement) return { w: src.naturalWidth || src.width || 0, h: src.naturalHeight || src.height || 0 };
    const v = src as { videoWidth?: number; videoHeight?: number; width?: number; height?: number };
    return { w: v.videoWidth ?? v.width ?? 0, h: v.videoHeight ?? v.height ?? 0 };
}

export const assessFrameQuality = (
    img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion = CROP_MEDIUM,
): FrameQuality => {
    const brightness = detectBrightness(img, canvas, crop);
    const blurVariance = detectBlurVariance(img, canvas, crop);
    return { brightness, blurVariance, isDark: brightness < DARK_SCENE_THRESHOLD, isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD };
};

/** Live pre-capture quality check for video stream. Industry std: prompt user to hold steady when blur detected. */
export const assessVideoFrameQuality = (
    video: HTMLVideoElement | { readyState?: number; videoWidth?: number; videoHeight?: number },
    canvas: HTMLCanvasElement, crop: CropRegion = CROP_NARROW,
): FrameQuality => {
    const readyState = 'readyState' in video ? (video.readyState ?? 0) : 0;
    if (readyState < 2) return { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false };
    const { w, h } = getFrameDimensions(video as FrameSource);
    if (!w || !h) return { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false };
    const brightness = detectBrightness(video as FrameSource, canvas, crop);
    const blurVariance = detectBlurVariance(video as FrameSource, canvas, crop);
    return { brightness, blurVariance, isDark: brightness < DARK_SCENE_THRESHOLD, isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD };
};

const detectBrightness = (src: FrameSource, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || typeof ctx.getImageData !== 'function') return 128;
        const { w, h } = getFrameDimensions(src);
        const cropX = w * (1 - crop.widthFrac) / 2;
        const cropY = h * (1 - crop.heightFrac) / 2;
        const cropW = w * crop.widthFrac;
        const cropH = h * crop.heightFrac;
        const sampleW = Math.min(cropW, 200);
        const sampleH = Math.min(cropH, 150);
        canvas.width = sampleW; canvas.height = sampleH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(src as CanvasImageSource, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        let total = 0;
        for (let i = 0; i < imgData.data.length; i += 4) total += imgData.data[i];
        return total / (imgData.data.length / 4);
    } catch { return 128; }
};

const detectBlurVariance = (src: FrameSource, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || typeof ctx.getImageData !== 'function') return BLUR_VARIANCE_THRESHOLD;
        const { w, h } = getFrameDimensions(src);
        const cropX = w * (1 - crop.widthFrac) / 2;
        const cropY = h * (1 - crop.heightFrac) / 2;
        const cropW = w * crop.widthFrac;
        const cropH = h * crop.heightFrac;
        const sW = Math.min(Math.floor(cropW), 320);
        const sH = Math.min(Math.floor(cropH), 220);
        if (sW < 3 || sH < 3) return BLUR_VARIANCE_THRESHOLD;
        canvas.width = sW; canvas.height = sH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(src as CanvasImageSource, cropX, cropY, cropW, cropH, 0, 0, sW, sH);
        const data = ctx.getImageData(0, 0, sW, sH).data;
        const gray = new Float32Array(sW * sH);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = data[i];
        let sum = 0, sumSq = 0, count = 0;
        for (let y = 1; y < sH - 1; y++) {
            const row = y * sW;
            for (let x = 1; x < sW - 1; x++) {
                const idx = row + x;
                const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - sW] - gray[idx + sW];
                sum += lap; sumSq += lap * lap; count++;
            }
        }
        if (count === 0) return BLUR_VARIANCE_THRESHOLD;
        const mean = sum / count;
        return sumSq / count - mean * mean;
    } catch { return BLUR_VARIANCE_THRESHOLD; }
};

/** Digit whitelist for ISBN-only crops — reduces O→0, I→1 confusion. */
const ISBN_CHAR_WHITELIST = '0123456789X -';

/* ================================================================
 *  Build OCR pass configurations (adaptive to quality)
 * ================================================================ */

function buildOcrPasses(quality: FrameQuality, prefix: string): OcrPassConfig[] {
    const { isDark, isBlurry } = quality;

    const base: OcrPassConfig[] = [
        { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: `${prefix}narrow-0`,      psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        // PSM 13 (Raw line) bypasses Tesseract layout analysis — faster, often more accurate
        // for tightly-cropped ISBN strips where segmentation adds noise.
        { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: `${prefix}narrow-psm13`,   psm: '13', charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_NARROW, rotation: 0,   mode: 'enhanced', label: `${prefix}narrow-0-enh`,   psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_CENTER, rotation: 0,   mode: 'clean',    label: `${prefix}center-0`,        psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_MEDIUM, rotation: 0,   mode: 'clean',    label: `${prefix}medium-0` },
        { crop: CROP_MEDIUM, rotation: 0,   mode: 'enhanced', label: `${prefix}medium-0-enh` },
        { crop: CROP_NARROW, rotation: 90,  mode: 'clean',    label: `${prefix}narrow-90`,       psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_NARROW, rotation: 270, mode: 'clean',    label: `${prefix}narrow-270`,      psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        /* Skew correction for tilted spines */
        { crop: CROP_NARROW, rotation: 85,  mode: 'clean',    label: `${prefix}narrow-85`,       psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_NARROW, rotation: 95,  mode: 'clean',    label: `${prefix}narrow-95`,       psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        { crop: CROP_NARROW, rotation: 0,   mode: 'boost',    label: `${prefix}narrow-boost`,    psm: '7',  charWhitelist: ISBN_CHAR_WHITELIST },
        ...(isDark ? [{ crop: CROP_NARROW, rotation: 0, mode: 'invert' as PreprocessMode, label: `${prefix}narrow-inv`, psm: '7', charWhitelist: ISBN_CHAR_WHITELIST }] as OcrPassConfig[] : []),
        { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: `${prefix}wide-sparse`,    psm: '11' },
        { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: `${prefix}wide-0` },
        { crop: CROP_FULL,   rotation: 0,   mode: 'clean',    label: `${prefix}full-0` },
    ];

    // Adaptive: unsharp mask first if blurry (industry std), then sharpen; invert/boost earlier if dark
    if (isBlurry) {
        const unsharp: OcrPassConfig = { crop: CROP_NARROW, rotation: 0, mode: 'unsharp', label: `${prefix}narrow-unsharp`, psm: '7', charWhitelist: ISBN_CHAR_WHITELIST };
        const sharpen: OcrPassConfig = { crop: CROP_NARROW, rotation: 0, mode: 'sharpen', label: `${prefix}narrow-sharpen`, psm: '7', charWhitelist: ISBN_CHAR_WHITELIST };
        return [unsharp, sharpen, ...base.filter(p => p.mode !== 'sharpen' && p.mode !== 'unsharp')];
    }
    return base;
}

/* ================================================================
 *  Shared scan pipeline result
 * ================================================================ */

/** Progress info for OCR UX (progress bar, "Pass X of Y"). */
export interface ScanProgress {
    phase: 'barcode' | 'ocr' | 'ocr-multilang' | 'suggestions' | 'done';
    currentPass?: number;
    totalPasses?: number;
}

/** Diagnostics for troubleshooting when scan fails or finds no ISBN. */
export interface ScanDiagnostics {
    quality: FrameQuality;
    /** Last phase completed: barcode scan, OCR, or suggestions. */
    phase: 'barcode' | 'ocr' | 'suggestions';
    barcodeAttempted: boolean;
    ocrPassesAttempted: number;
    /** e.g. "Image too blurry and dark" when OCR was skipped. */
    skipReason?: string;
    /** When effective resolution is below 200 DPI equivalent. */
    lowResolution?: boolean;
    /** Last error message if pipeline threw. */
    lastError?: string;
}

export interface ScanPipelineResult {
    isbn: string | null;
    suggestions: string[];
    /** Map of repaired ISBN → original invalid candidate, for "Try repaired" action. */
    repairedMap?: Record<string, string>;
    /** Populated when no ISBN found, for diagnostic toasts. */
    diagnostics?: ScanDiagnostics;
}

/** OCR language preference: en=English only, de=German fallback, both=English+German. */
export type OcrLanguage = 'en' | 'de' | 'both';

interface UseScanPipelineOptions {
    addLog: (msg: string) => void;
    setStatus: (msg: string) => void;
    runOcr: (image: string, label: string, extract: typeof extractIsbnCandidates, validate: typeof isValidIsbn, opts?: { psm?: string; charWhitelist?: string }) => Promise<OcrResult>;
    runOcrWithLang?: (image: string, label: string, lang: string, extract: typeof extractIsbnCandidates, validate: typeof isValidIsbn) => Promise<OcrResult>;
    tryBarcodeDecode: (source: HTMLImageElement | string, label: string) => Promise<string | null>;
    /** Optional progress callback for progress bar UX. */
    onProgress?: (progress: ScanProgress) => void;
    /** Language for multi-language OCR fallback. 'en' skips; 'de' uses deu; 'both' uses eng+deu. */
    ocrLanguage?: OcrLanguage;
}

/**
 * Hook that provides a unified scan pipeline for both camera capture and photo upload.
 * Eliminates the duplicated barcode + OCR logic.
 */
export function useScanPipeline({ addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode, onProgress, ocrLanguage = 'both' }: UseScanPipelineOptions) {

    /**
     * Run the full barcode + OCR scan pipeline on an image.
     * Used by both camera capture and file upload handlers.
     */
    const runPipeline = useCallback(async (
        img: HTMLImageElement,
        canvas: HTMLCanvasElement,
        prefix: string,
    ): Promise<ScanPipelineResult> => {
        const allCandidates = new Set<string>();
        const ocrStartTime = Date.now();
        let ocrPassesAttempted = 0;
        const reportProgress = (p: ScanProgress) => onProgress?.(p);

        /* ── Phase 1: Barcode scan (fast, multiple crops) ──── */
        addLog(`Phase 1: Barcode scan (${prefix})...`);
        setStatus('Scanning barcode...');
        reportProgress({ phase: 'barcode' });

        let isbn: string | null = null;
        try {
            isbn = await tryBarcodeDecode(img, `${prefix}full`);
            if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_CENTER), `${prefix}center`);
            if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_NARROW), `${prefix}narrow`);
            if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_MEDIUM), `${prefix}medium`);
            if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_WIDE), `${prefix}wide`);
        } catch (err) {
            addLog(`Barcode phase error: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (isbn && isValidIsbn(isbn)) {
            addLog(`ISBN via barcode: ${isbn}`);
            setStatus(`Found ISBN: ${isbn}`);
            reportProgress({ phase: 'done' });
            return { isbn, suggestions: [] };
        }
        if (isbn) {
            allCandidates.add(isbn);
            const repaired = tryFixChecksum(isbn);
            if (repaired) {
                addLog(`ISBN via barcode (repaired): ${isbn} → ${repaired}`);
                setStatus(`Found ISBN: ${repaired}`);
                reportProgress({ phase: 'done' });
                return { isbn: repaired, suggestions: [] };
            }
        }

        /* ── Phase 2: OCR scan ──── */
        addLog(`Phase 2: OCR scan (${prefix})...`);

        const quality = assessFrameQuality(img, canvas, CROP_NARROW);
        const lowRes = hasLowOcrResolution(img.width, img.height, CROP_NARROW);
        addLog(`Quality: brightness=${quality.brightness.toFixed(0)} (${quality.isDark ? 'dark' : 'normal'}), blur=${quality.blurVariance.toFixed(0)} (${quality.isBlurry ? 'blurry' : 'sharp'}), lowRes=${lowRes}`);

        const likelyShouldSkip = quality.isBlurry && quality.brightness < SKIP_OCR_BRIGHTNESS_THRESHOLD;
        if (likelyShouldSkip) {
            // Attempt targeted recovery passes (boost + invert) before giving up.
            // Dark+blurry images sometimes yield text with aggressive contrast enhancement.
            addLog('Dark and blurry — attempting recovery passes (boost, invert) before skipping...');
            setStatus('Low light and blurry — attempting recovery...');
            const recoveryPasses: OcrPassConfig[] = [
                { crop: CROP_NARROW, rotation: 0, mode: 'boost',  label: `${prefix}recovery-boost`,  psm: '7', charWhitelist: ISBN_CHAR_WHITELIST },
                { crop: CROP_NARROW, rotation: 0, mode: 'invert', label: `${prefix}recovery-invert`, psm: '7', charWhitelist: ISBN_CHAR_WHITELIST },
            ];
            for (const pass of recoveryPasses) {
                if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) break;
                try {
                    const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                    const result = await runOcr(processed, pass.label, extractIsbnCandidates, isValidIsbn, { psm: pass.psm, charWhitelist: pass.charWhitelist });
                    ocrPassesAttempted += 1;
                    result.allCandidates.forEach(c => allCandidates.add(c));
                    if (result.isbn) {
                        addLog(`ISBN via recovery pass [${pass.label}]: ${result.isbn}`);
                        setStatus(`Found ISBN: ${result.isbn}`);
                        return { isbn: result.isbn, suggestions: [] };
                    }
                } catch (err) {
                    addLog(`Recovery pass [${pass.label}] error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            // Recovery failed — now actually skip remaining passes
            addLog('Recovery passes found nothing. Skipping full OCR scan.');
            setStatus('Image too blurry and dark. Hold steady, improve lighting, and try again.');
            reportProgress({ phase: 'done' });
            return {
                isbn: null,
                suggestions: allCandidates.size > 0 ? Array.from(allCandidates).slice(0, 6) : [],
                diagnostics: {
                    quality,
                    phase: 'ocr',
                    barcodeAttempted: true,
                    ocrPassesAttempted,
                    skipReason: 'Image too blurry and dark (recovery passes failed)',
                    lowResolution: lowRes,
                },
            };
        }

        if (quality.isBlurry) setStatus('Image looks blurry. Hold steady and move closer.');
        else if (quality.isDark) setStatus('Low light. Improve lighting for better OCR.');
        else if (lowRes) setStatus('Move closer so ISBN fills the frame for better OCR.');

        const ocrPasses = buildOcrPasses(quality, `${prefix}`);
        const useMultilang = runOcrWithLang && (ocrLanguage === 'de' || ocrLanguage === 'both');
        const totalPasses = ocrPasses.length + (useMultilang ? 1 : 0);

        reportProgress({ phase: 'ocr', currentPass: 0, totalPasses });

        for (let i = 0; i < ocrPasses.length; i++) {
            const pass = ocrPasses[i];
            if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) {
                addLog(`OCR total timeout reached.`);
                break;
            }
            try {
                setStatus(`OCR: pass ${i + 1} of ${totalPasses}...`);
                reportProgress({ phase: 'ocr', currentPass: i + 1, totalPasses });
                const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                const result = await runOcr(processed, pass.label, extractIsbnCandidates, isValidIsbn, {
                    psm: pass.psm,
                    charWhitelist: pass.charWhitelist,
                });
                ocrPassesAttempted += 1;
                result.allCandidates.forEach(c => allCandidates.add(c));
                if (result.isbn) {
                    addLog(`ISBN via OCR [${pass.label}]: ${result.isbn}${result.confidence != null ? ` conf=${result.confidence}` : ''}`);
                    if (result.confidence != null) {
                        addLog(`[OCR-ANALYTICS] pass=${pass.label} confidence=${result.confidence} imgWidth=${img.width} brightness=${quality.brightness.toFixed(0)} blur=${quality.blurVariance.toFixed(0)}`);
                    }
                    setStatus(`Found ISBN: ${result.isbn}`);
                    addLog(`Early exit: valid ISBN found${result.confidence != null ? ` (conf=${result.confidence}, threshold=${HIGH_CONFIDENCE_THRESHOLD})` : ''}`);
                    return { isbn: result.isbn, suggestions: [] };
                }
            } catch (err) {
                addLog(`OCR pass [${pass.label}] error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        /* ── Phase 2b: Multi-language fallback (German/non-English books) ──── */
        // Guarded by useMultilang so ocrLanguage='en' correctly skips this phase.
        // 'de' uses Tesseract's German-only model; 'both' combines eng+deu for mixed spines.
        if (useMultilang && Date.now() - ocrStartTime < OCR_TOTAL_TIMEOUT) {
            const multilangStr = ocrLanguage === 'de' ? 'deu' : 'eng+deu';
            try {
                setStatus(`OCR: retrying with multi-language (${multilangStr})...`);
                const processed = preprocessImage(img, canvas, 0, CROP_FULL, 'clean');
                const result = await runOcrWithLang(processed, `${prefix}full-${multilangStr}`, multilangStr, extractIsbnCandidates, isValidIsbn);
                ocrPassesAttempted += 1;
                result.allCandidates.forEach(c => allCandidates.add(c));
                if (result.isbn) {
                    addLog(`ISBN via OCR [multi-lang ${multilangStr}]: ${result.isbn}`);
                    setStatus(`Found ISBN: ${result.isbn}`);
                    reportProgress({ phase: 'done' });
                    return { isbn: result.isbn, suggestions: [] };
                }
            } catch (err) {
                addLog(`Multi-lang OCR fallback error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        /* ── Phase 3: Build suggestions (include near-miss candidates) ──── */
        reportProgress({ phase: 'suggestions' });
        const candidateList = Array.from(allCandidates);
        const repaired: string[] = [];
        const repairedMap: Record<string, string> = {}; // repaired → original
        const nearMisses: string[] = [];
        for (const c of candidateList) {
            if (!isValidIsbn(c)) {
                const fix = tryFixChecksum(c);
                if (fix && !candidateList.includes(fix) && !repaired.includes(fix)) {
                    repaired.push(fix);
                    repairedMap[fix] = c;
                    addLog(`Checksum repair: ${c} → ${fix} (suggested)`);
                }
                const misses = getNearMissCandidates(c);
                for (const m of misses) {
                    if (!candidateList.includes(m) && !repaired.includes(m) && !nearMisses.includes(m)) {
                        nearMisses.push(m);
                    }
                }
            }
        }

        const suggestions = [...candidateList, ...repaired, ...nearMisses].slice(0, 8);
        return {
            isbn: null,
            suggestions,
            repairedMap: Object.keys(repairedMap).length > 0 ? repairedMap : undefined,
            diagnostics: {
                quality,
                phase: 'suggestions',
                barcodeAttempted: true,
                ocrPassesAttempted,
                lowResolution: lowRes,
            },
        };
    }, [addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode, onProgress, ocrLanguage]);

    return { runPipeline };
}
