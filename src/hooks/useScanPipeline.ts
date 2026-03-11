import { useCallback, useRef } from 'react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates, tryFixChecksum, tryFixChecksumDouble, tryFixChecksumTriple, getNearMissCandidates, getCharConfidenceWeights } from '../utils/ocr.ts';
import type { OcrResult } from './useOcrEngine.ts';
import { PSM } from './useOcrEngine.ts';
import { applyOtsuBinarization, applyAdaptiveThreshold, applyMedianFilter, applyMorphClose, applyCLAHE, detectSkewAngle, measureContrast } from '../utils/imageProcessing.ts';

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
/** Target 200–300 DPI equivalent; >300 DPI can degrade accuracy per OCR best practices. */
const TARGET_DPI_MIN = 200;
const TARGET_DPI_MAX = 300;
/** Assumed physical size of spine in frame (inches) for DPI estimation. */
const ASSUMED_SPINE_INCHES = 2.5;

type PreprocessMode = 'clean' | 'enhanced' | 'boost' | 'invert' | 'invertBoost' | 'sharpen' | 'unsharp' | 'otsu' | 'adaptive' | 'denoise' | 'clahe';

/** Enhancement filters: grayscale, contrast (110–180%), brightness; optional invert for dark-on-light. */
const PREPROCESS_FILTERS: Record<PreprocessMode, string> = {
    clean:      'grayscale(100%) contrast(110%)',
    enhanced:   'grayscale(100%) contrast(140%) brightness(108%)',
    boost:      'grayscale(100%) contrast(180%) brightness(115%)',
    invert:     'grayscale(100%) contrast(130%) invert(100%)',
    invertBoost: 'grayscale(100%) contrast(180%) brightness(120%) invert(100%)',
    sharpen:    'grayscale(100%) contrast(130%) brightness(105%)',
    unsharp:    'grayscale(100%) contrast(120%)',  // unsharp applied in pixel loop
    otsu:       'grayscale(100%) contrast(130%)',
    adaptive:   'grayscale(100%) contrast(120%)',
    denoise:    'grayscale(100%) contrast(115%)',
    clahe:      'grayscale(100%)',
};

export interface FrameQuality {
    brightness: number;
    blurVariance: number;
    isDark: boolean;
    isBlurry: boolean;
    /** Effective short dimension (px) after preprocessing scale for OCR. Used for resolution hints. */
    effectiveShortDimPixels?: number;
    /** DPI-equivalent label for user feedback: 'low' (<200), 'ok' (200-300), 'high' (>300). */
    dpiLabel?: 'low' | 'ok' | 'high';
    /** Pixel-value standard deviation. Low contrast (<30) benefits from CLAHE. */
    contrast?: number;
    /** Whether contrast is too low for reliable OCR. */
    isLowContrast?: boolean;
}

/** Resolution/quality hints for user feedback (blur, brightness, resolution). */
export type QualityHint = 'hold_steady' | 'improve_lighting' | 'move_closer' | 'low_resolution' | 'low_contrast' | 'ok';

/** Tesseract PSM: 6=SINGLE_BLOCK (standard text), 7=SINGLE_LINE (ISBN/spine), 11=SPARSE_TEXT (scattered). */
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

/**
 * Compute scale to target 200–300 DPI equivalent.
 * Assumes spine occupies ~2.5" in frame; scales so short dimension maps to 200–300 px per inch.
 */
const getScaleForTargetDpi = (cropW: number, cropH: number): number => {
    const shortDim = Math.min(cropW, cropH);
    const targetPxAt200 = TARGET_DPI_MIN * ASSUMED_SPINE_INCHES;
    const targetPxAt300 = TARGET_DPI_MAX * ASSUMED_SPINE_INCHES;
    if (shortDim >= targetPxAt300) return 1; // Already at or above 300 DPI equiv
    if (shortDim >= targetPxAt200) return targetPxAt300 / shortDim; // Scale into 200–300 range
    return targetPxAt200 / shortDim; // Scale up to minimum 200 DPI equiv
};

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

/**
 * Get quality hints for user feedback based on frame quality and resolution.
 * Feeds into status messages (e.g. "Hold steady", "Improve lighting").
 * Uses quality.dpiLabel when available for resolution hints.
 */
export const getQualityHints = (
    quality: FrameQuality,
    lowRes: boolean,
): QualityHint[] => {
    const hints: QualityHint[] = [];
    if (quality.isBlurry) hints.push('hold_steady');
    if (quality.isDark) hints.push('improve_lighting');
    const resolutionLow = lowRes || quality.dpiLabel === 'low';
    if (resolutionLow || quality.isBlurry) hints.push('move_closer');
    if (resolutionLow) hints.push('low_resolution');
    if (quality.isLowContrast) hints.push('low_contrast');
    if (hints.length === 0) hints.push('ok');
    return hints;
};

/** Check if effective OCR resolution is too low. Industry std: need enough pixels for 200 DPI equiv. */
export const hasLowOcrResolution = (imgWidth: number, imgHeight: number, crop: CropRegion): boolean => {
    const cropW = imgWidth * crop.widthFrac;
    const cropH = imgHeight * crop.heightFrac;
    const shortDim = Math.min(cropW, cropH);
    return shortDim < MIN_OCR_PIXELS;
};

/**
 * Preprocess image for OCR. Pipeline order per OCR best practices:
 * 1. Rotation/skew correction — fix tilted documents (0°, 90°, 270°)
 * 2. Region detection — crop to area of interest (narrow, center, full-frame)
 * 3. Enhancement — grayscale, contrast (110–180%), brightness; optional invert for dark-on-light
 * 4. Optional sharpen — unsharp mask for blurry captures
 *
 * Target 200–300 DPI equivalent; >300 DPI can degrade OCR accuracy.
 */
export const preprocessImage = (
    img: HTMLImageElement, canvas: HTMLCanvasElement,
    rotateDeg: number, crop: CropRegion, mode: PreprocessMode = 'clean',
): string => {
    const ctx = canvas.getContext('2d')!;
    // Stage 1 & 2: Region detection (crop) + rotation/skew correction
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    // Target 200–300 DPI equivalent; resolution hints per OCR best practices
    let scale = Math.max(getAdaptiveScale(img.width), getScaleForTargetDpi(cropW, cropH));
    const capScale = getResolutionCapScale(cropW, cropH, scale);
    if (capScale < 1) scale *= capScale;
    const outW = cropW * scale;
    const outH = cropH * scale;

    // Output bounds for rotation (0°, 90°, 270°, or skew angles)
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
    // Stage 3: Enhancement — grayscale, contrast (110–180%), brightness; invert for dark-on-light
    ctx.filter = PREPROCESS_FILTERS[mode];
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    // Stage 4: Optional sharpen — unsharp mask for blurry captures
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
                // Unsharp mask (industry std for blurry captures): original + amount * (original - blurred)
                const radius = 1;
                const amount = 1.5;
                const blur = new Float32Array(w * h * 3);
                for (let y = radius; y < h - radius; y++) {
                    for (let x = radius; x < w - radius; x++) {
                        let r = 0, g = 0, b = 0, n = 0;
                        for (let dy = -radius; dy <= radius; dy++) {
                            for (let dx = -radius; dx <= radius; dx++) {
                                const idx = ((y + dy) * w + (x + dx)) * 4;
                                r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; n++;
                            }
                        }
                        const bi = (y * w + x) * 3;
                        blur[bi] = r / n; blur[bi + 1] = g / n; blur[bi + 2] = b / n;
                    }
                }
                for (let y = radius; y < h - radius; y++) {
                    for (let x = radius; x < w - radius; x++) {
                        const i = (y * w + x) * 4;
                        const bi = (y * w + x) * 3;
                        for (let c = 0; c < 3; c++) {
                            const orig = src[i + c];
                            const blr = blur[bi + c];
                            const val = orig + amount * (orig - blr);
                            data[i + c] = Math.min(255, Math.max(0, Math.round(val)));
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        } catch { /* skip */ }
    }

    // Stage 5: Advanced preprocessing — binarization, denoising, CLAHE, morphological ops
    if (['otsu', 'adaptive', 'denoise', 'clahe'].includes(mode) && typeof ctx.getImageData === 'function') {
        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (mode === 'denoise') {
                applyMedianFilter(imgData);
                applyOtsuBinarization(imgData);
            } else if (mode === 'otsu') {
                applyOtsuBinarization(imgData);
                applyMorphClose(imgData);
            } else if (mode === 'adaptive') {
                applyMedianFilter(imgData);
                applyAdaptiveThreshold(imgData);
                applyMorphClose(imgData);
            } else if (mode === 'clahe') {
                applyCLAHE(imgData);
                applyOtsuBinarization(imgData);
            }
            ctx.putImageData(imgData, 0, 0);
        } catch { /* skip advanced preprocessing on error */ }
    }

    return canvas.toDataURL('image/png');
};

export const cropForBarcode = (
    img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion,
): string => {
    const ctx = canvas.getContext('2d')!;
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

/** Compute effective short-dimension pixels and DPI label for resolution hints. */
function getResolutionInfo(imgWidth: number, imgHeight: number, crop: CropRegion): { effectiveShortDimPixels: number; dpiLabel: 'low' | 'ok' | 'high' } {
    const cropW = imgWidth * crop.widthFrac;
    const cropH = imgHeight * crop.heightFrac;
    const shortDim = Math.min(cropW, cropH);
    const scale = Math.max(getAdaptiveScale(imgWidth), getScaleForTargetDpi(cropW, cropH));
    const capScale = getResolutionCapScale(cropW, cropH, scale);
    const finalScale = capScale < 1 ? scale * capScale : scale;
    const effectiveShortDimPixels = shortDim * finalScale;
    const dpiEquivalent = effectiveShortDimPixels / ASSUMED_SPINE_INCHES;
    const dpiLabel = dpiEquivalent < TARGET_DPI_MIN ? 'low' : dpiEquivalent > TARGET_DPI_MAX ? 'high' : 'ok';
    return { effectiveShortDimPixels: Math.round(effectiveShortDimPixels), dpiLabel };
}

export const assessFrameQuality = (
    img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion = CROP_MEDIUM,
): FrameQuality => {
    const brightness = detectBrightness(img, canvas, crop);
    const blurVariance = detectBlurVariance(img, canvas, crop);
    const { effectiveShortDimPixels, dpiLabel } = getResolutionInfo(img.width, img.height, crop);
    const contrast = detectContrast(img, canvas, crop);
    return {
        brightness,
        blurVariance,
        isDark: brightness < DARK_SCENE_THRESHOLD,
        isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD,
        effectiveShortDimPixels,
        dpiLabel,
        contrast,
        isLowContrast: contrast < LOW_CONTRAST_THRESHOLD,
    };
};

/** Live pre-capture quality check for video stream. Industry std: prompt user to hold steady when blur detected. */
export const assessVideoFrameQuality = (
    video: HTMLVideoElement | { readyState?: number; videoWidth?: number; videoHeight?: number },
    canvas: HTMLCanvasElement, crop: CropRegion = CROP_MEDIUM,
): FrameQuality => {
    const readyState = 'readyState' in video ? (video.readyState ?? 0) : 0;
    if (readyState < 2) return { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false };
    const { w, h } = getFrameDimensions(video as FrameSource);
    if (!w || !h) return { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false };
    const brightness = detectBrightness(video as FrameSource, canvas, crop);
    const blurVariance = detectBlurVariance(video as FrameSource, canvas, crop);
    const { effectiveShortDimPixels, dpiLabel } = getResolutionInfo(w, h, crop);
    return {
        brightness,
        blurVariance,
        isDark: brightness < DARK_SCENE_THRESHOLD,
        isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD,
        effectiveShortDimPixels,
        dpiLabel,
    };
};

const detectBrightness = (src: FrameSource, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d');
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
        const ctx = canvas.getContext('2d');
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

const detectContrast = (src: FrameSource, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.getImageData !== 'function') return 50;
        const { w, h } = getFrameDimensions(src);
        const cropX = w * (1 - crop.widthFrac) / 2;
        const cropY = h * (1 - crop.heightFrac) / 2;
        const cropW = w * crop.widthFrac;
        const cropH = h * crop.heightFrac;
        const sW = Math.min(Math.floor(cropW), 200);
        const sH = Math.min(Math.floor(cropH), 150);
        if (sW < 3 || sH < 3) return 50;
        canvas.width = sW; canvas.height = sH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(src as CanvasImageSource, cropX, cropY, cropW, cropH, 0, 0, sW, sH);
        const imgData = ctx.getImageData(0, 0, sW, sH);
        return measureContrast(imgData);
    } catch { return 50; }
};

/** Digit whitelist for ISBN-only crops — reduces O→0, I→1 confusion. */
const ISBN_CHAR_WHITELIST = '0123456789X -';

/** Very dark threshold: prioritize invert+boost passes (quality assessment → preprocessing). */
const VERY_DARK_THRESHOLD = 60;
const LOW_CONTRAST_THRESHOLD = 30;

/* ================================================================
 *  Build OCR pass configurations (adaptive to quality)
 *  Multiple passes with varied settings per OCR best practices:
 *  - Crops: narrow, center, full-frame
 *  - Rotations: 0°, 90°, 270° (spine often vertical)
 *  - Quality-driven: blur → sharpen/unsharp first; dark → invert; very dark → invertBoost
 * ================================================================ */

function pass(crop: CropRegion, rotation: number, mode: PreprocessMode, label: string, psm: string = PSM.SINGLE_LINE, charWhitelist?: string): OcrPassConfig {
    return { crop, rotation, mode, label, psm, charWhitelist: charWhitelist ?? undefined };
}

export function buildOcrPasses(quality: FrameQuality, prefix: string): OcrPassConfig[] {
    const { isDark, isBlurry, brightness } = quality;
    const isBorderlineDark = brightness >= DARK_SCENE_THRESHOLD && brightness < DARK_SCENE_THRESHOLD + 25;
    const isVeryDark = brightness < VERY_DARK_THRESHOLD;

    // Core matrix: narrow, center = SINGLE_LINE (ISBN on spine); full, medium = SINGLE_BLOCK (standard text)
    const narrow0   = pass(CROP_NARROW,   0,   'clean', `${prefix}narrow-0`,    PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const narrow90  = pass(CROP_NARROW,  90,  'clean', `${prefix}narrow-90`,   PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const narrow270 = pass(CROP_NARROW,  270, 'clean', `${prefix}narrow-270`,  PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const center0   = pass(CROP_CENTER,  0,   'clean', `${prefix}center-0`,    PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const center90  = pass(CROP_CENTER,  90,  'clean', `${prefix}center-90`,   PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const center270 = pass(CROP_CENTER,  270, 'clean', `${prefix}center-270`,  PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const full0     = pass(CROP_FULL,    0,   'clean', `${prefix}full-0`,      PSM.SINGLE_BLOCK);
    const full90    = pass(CROP_FULL,   90,  'clean', `${prefix}full-90`,     PSM.SINGLE_BLOCK);
    const full270   = pass(CROP_FULL,    270, 'clean', `${prefix}full-270`,   PSM.SINGLE_BLOCK);

    // Enhancement passes: varied contrast (110–180%), brightness
    const narrowEnhanced = pass(CROP_NARROW,  0, 'enhanced', `${prefix}narrow-0-enh`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const narrowBoost   = pass(CROP_NARROW,  0, 'boost',    `${prefix}narrow-boost`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const centerEnhanced = pass(CROP_CENTER, 0, 'enhanced', `${prefix}center-0-enh`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const medium0       = pass(CROP_MEDIUM,  0, 'clean',    `${prefix}medium-0`,    PSM.SINGLE_BLOCK);
    const mediumEnhanced = pass(CROP_MEDIUM,  0, 'enhanced', `${prefix}medium-0-enh`, PSM.SINGLE_BLOCK);

    // Skew correction for tilted spines
    const narrow85 = pass(CROP_NARROW, 85, 'clean', `${prefix}narrow-85`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const narrow95 = pass(CROP_NARROW, 95, 'clean', `${prefix}narrow-95`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);

    // Dark-on-light: invert when dark or borderline; invertBoost for very dark (high contrast + invert)
    const invertPass = pass(CROP_NARROW, 0, 'invert', `${prefix}narrow-inv`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const invertBoostPass = pass(CROP_NARROW, 0, 'invertBoost', `${prefix}narrow-invBoost`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);

    // Optional sharpen for blurry captures (industry std: unsharp mask first)
    const unsharpPass = pass(CROP_NARROW, 0, 'unsharp', `${prefix}narrow-unsharp`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const sharpenPass = pass(CROP_NARROW, 0, 'sharpen', `${prefix}narrow-sharpen`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);

    // Advanced preprocessing: binarization for cleaner input
    const otsuPass = pass(CROP_NARROW, 0, 'otsu', `${prefix}narrow-otsu`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const adaptivePass = pass(CROP_NARROW, 0, 'adaptive', `${prefix}narrow-adaptive`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const denoisePass = pass(CROP_NARROW, 0, 'denoise', `${prefix}narrow-denoise`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);
    const clahePass = pass(CROP_CENTER, 0, 'clahe', `${prefix}center-clahe`, PSM.SINGLE_LINE, ISBN_CHAR_WHITELIST);

    // Sparse text for wide crops (PSM 11 = scattered text)
    const wideSparse = pass(CROP_WIDE, 0, 'clean', `${prefix}wide-sparse`, PSM.SPARSE_TEXT);
    const wide0      = pass(CROP_WIDE, 0, 'clean', `${prefix}wide-0`, PSM.SINGLE_BLOCK);

    const darkPasses = (isDark || isBorderlineDark)
        ? (isVeryDark ? [invertBoostPass, invertPass] : [invertPass])
        : [];

    let base: OcrPassConfig[] = [
        narrow0, narrowEnhanced, narrow90, narrow270,
        center0, centerEnhanced, center90, center270,
        full0, full90, full270,
        medium0, mediumEnhanced,
        narrow85, narrow95,
        narrowBoost,
        ...darkPasses,
        wideSparse, wide0,
        otsuPass, adaptivePass, denoisePass,
    ];

    // Quality-driven: blurry → unsharp and sharpen first (blur feeds into preprocessing)
    if (isBlurry) {
        base = [unsharpPass, sharpenPass, ...base];
    }

    // Quality-driven: very dark → invertBoost at front for best chance on dark spines
    if (isVeryDark) {
        base = [invertBoostPass, ...base.filter(p => p.label !== `${prefix}narrow-invBoost`)];
    }

    // Quality-driven: low contrast → CLAHE pass at front
    if (quality.isLowContrast) {
        base = [clahePass, ...base];
    }

    return base;
}

/* ================================================================
 *  Shared scan pipeline result
 * ================================================================ */

/** Progress info for OCR UX (progress bar, "Pass X of Y — Z%"). */
export interface ScanProgress {
    phase: 'barcode' | 'ocr' | 'ocr-multilang' | 'suggestions' | 'done';
    currentPass?: number;
    totalPasses?: number;
    /** Within-pass recognition progress 0–100 (from Tesseract). */
    passProgress?: number;
    /** Human-readable pass label (e.g. "narrow-0", "narrow-90") for progress display. */
    passLabel?: string;
    /** Near-valid candidates found so far (for "Possible: X" during scan). */
    possibleCandidates?: string[];
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

export type ScanDetectionMethod = 'barcode' | 'ocr' | 'ocr-multilang';
export type ScanConfidenceBand = 'low' | 'medium' | 'high';

export interface ScanPipelineResult {
    isbn: string | null;
    suggestions: string[];
    /** Scan engine that produced the winning result. */
    detectionMethod?: ScanDetectionMethod;
    /** OCR confidence 0-100 when available. */
    confidence?: number;
    /** UI-friendly confidence grouping for scan feedback. */
    confidenceBand?: ScanConfidenceBand;
    /** Map of repaired ISBN to original invalid candidate, for "Try repaired" action. */
    repairedMap?: Record<string, string>;
    /** Populated when no ISBN found, for diagnostic toasts. */
    diagnostics?: ScanDiagnostics;
}

const getConfidenceBand = (confidence?: number): ScanConfidenceBand | undefined => {
    if (confidence == null) return undefined;
    if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
};

/** OCR language preference: en=English only, de=German fallback, both=English+German. */
export type OcrLanguage = 'en' | 'de' | 'both';

export interface RunPipelineOptions {
    /** When aborted, pipeline exits early and avoids callbacks after unmount. */
    signal?: AbortSignal;
}

interface UseScanPipelineOptions {
    addLog: (msg: string) => void;
    setStatus: (msg: string) => void;
    runOcr: (image: string, label: string, extract: typeof extractIsbnCandidates, validate: typeof isValidIsbn, opts?: { psm?: string; charWhitelist?: string; onRecognizeProgress?: (pct: number) => void }) => Promise<OcrResult>;
    runOcrWithLang?: (image: string, label: string, lang: string, extract: typeof extractIsbnCandidates, validate: typeof isValidIsbn) => Promise<OcrResult>;
    tryBarcodeDecode: (source: HTMLImageElement | string, label: string) => Promise<string | null>;
    /** Optional progress callback for progress bar UX. */
    onProgress?: (progress: ScanProgress) => void;
    /** Language for multi-language OCR fallback. 'en' skips; 'de' uses deu; 'both' uses eng+deu. */
    ocrLanguage?: OcrLanguage;
    /** Selected scanner mode controls which engines run. */
    scanMode?: 'auto' | 'barcode' | 'ocr';
}

/**
 * Hook that provides a unified scan pipeline for both camera capture and photo upload.
 * Eliminates the duplicated barcode + OCR logic.
 */
export function useScanPipeline({ addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode, onProgress, ocrLanguage = 'both', scanMode = 'auto' }: UseScanPipelineOptions) {

    /**
     * Run the full barcode + OCR scan pipeline on an image.
     * Used by both camera capture and file upload handlers.
     */
    const pipelineBusyRef = useRef(false);

    const runPipeline = useCallback(async (
        img: HTMLImageElement,
        canvas: HTMLCanvasElement,
        prefix: string,
        options?: RunPipelineOptions,
    ): Promise<ScanPipelineResult> => {
        const signal = options?.signal;

        if (pipelineBusyRef.current) {
            addLog('Pipeline already running, skipping concurrent scan');
            return { isbn: null, suggestions: [], diagnostics: { quality: { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false }, phase: 'barcode', barcodeAttempted: false, ocrPassesAttempted: 0, lastError: 'Concurrent scan suppressed' } };
        }
        pipelineBusyRef.current = true;

        const safeReportProgress = (p: ScanProgress) => { if (!signal?.aborted) onProgress?.(p); };
        const safeSetStatus = (msg: string) => { if (!signal?.aborted) setStatus(msg); };

        try {
        const allCandidates = new Set<string>();
        const ocrStartTime = Date.now();
        let ocrPassesAttempted = 0;
        const reportProgress = safeReportProgress;

        /* ── Zero-dimension guard ──── */
        if (!img.width || !img.height) {
            addLog('Image has zero dimensions, skipping OCR');
            return { isbn: null, suggestions: [], diagnostics: { quality: { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false }, phase: 'ocr', barcodeAttempted: true, ocrPassesAttempted: 0, lastError: 'Image has zero width or height' } };
        }

        const allowBarcode = scanMode !== 'ocr';
        const allowOcr = scanMode !== 'barcode';

        /* ── Phase 1: Barcode scan (fast, multiple crops) ──── */
        let isbn: string | null = null;
        if (allowBarcode) {
            addLog(`Phase 1: Barcode scan (${prefix})...`);
            safeSetStatus('Scanning barcode...');
            reportProgress({ phase: 'barcode' });

            try {
                isbn = await tryBarcodeDecode(img, `${prefix}full`);
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_CENTER), `${prefix}center`);
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_NARROW), `${prefix}narrow`);
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_MEDIUM), `${prefix}medium`);
                if (!isbn) isbn = await tryBarcodeDecode(cropForBarcode(img, canvas, CROP_WIDE), `${prefix}wide`);
            } catch (err) {
                addLog(`Barcode phase error: ${err instanceof Error ? err.message : String(err)}`);
            }
        } else {
            addLog(`Phase 1 skipped: barcode disabled for ${scanMode} mode`);
        }

        if (isbn && isValidIsbn(isbn)) {
            addLog(`ISBN via barcode: ${isbn}`);
            safeSetStatus(`Found ISBN: ${isbn}`);
            reportProgress({ phase: 'done' });
            return { isbn, suggestions: [], detectionMethod: 'barcode' };
        }
        if (isbn) {
            allCandidates.add(isbn);
            const repaired = tryFixChecksum(isbn);
            if (repaired) {
                addLog(`ISBN via barcode (repaired): ${isbn} → ${repaired}`);
                safeSetStatus(`Found ISBN: ${repaired}`);
                reportProgress({ phase: 'done' });
                return { isbn: repaired, suggestions: [], detectionMethod: 'barcode' };
            }
        }

        if (!allowOcr) {
            addLog(`Phase 2 skipped: OCR disabled for ${scanMode} mode`);
            safeSetStatus('No barcode found. Try another angle or switch to OCR.');
            reportProgress({ phase: 'suggestions' });

            const quality: FrameQuality = { brightness: 128, blurVariance: BLUR_VARIANCE_THRESHOLD, isDark: false, isBlurry: false };
            const candidateList = Array.from(allCandidates);
            const repaired: string[] = [];
            const repairedMap: Record<string, string> = {};
            const nearMisses: string[] = [];
            for (const c of candidateList) {
                if (!isValidIsbn(c)) {
                    const fix = tryFixChecksum(c);
                    if (fix && !candidateList.includes(fix) && !repaired.includes(fix)) {
                        repaired.push(fix);
                        repairedMap[fix] = c;
                    }
                    const misses = getNearMissCandidates(c);
                    for (const m of misses) {
                        if (!candidateList.includes(m) && !repaired.includes(m) && !nearMisses.includes(m)) nearMisses.push(m);
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
                    phase: 'barcode',
                    barcodeAttempted: allowBarcode,
                    ocrPassesAttempted: 0,
                    lowResolution: false,
                },
            };
        }

        /* ── Phase 2: OCR scan ──── */
        addLog(`Phase 2: OCR scan (${prefix})...`);

        const quality = assessFrameQuality(img, canvas, CROP_NARROW);
        const lowRes = hasLowOcrResolution(img.width, img.height, CROP_NARROW);
        addLog(`Quality: brightness=${quality.brightness.toFixed(0)} (${quality.isDark ? 'dark' : 'normal'}), blur=${quality.blurVariance.toFixed(0)} (${quality.isBlurry ? 'blurry' : 'sharp'}), lowRes=${lowRes}`);

        // Detect fine-grained skew angle for more precise rotation
        let detectedSkew = 0;
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const sW = Math.min(img.width, 400);
                const sH = Math.min(img.height, 300);
                canvas.width = sW; canvas.height = sH;
                ctx.filter = 'grayscale(100%)';
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, sW, sH);
                const skewData = ctx.getImageData(0, 0, sW, sH);
                detectedSkew = detectSkewAngle(skewData);
                if (Math.abs(detectedSkew) > 1) {
                    addLog(`Detected skew angle: ${detectedSkew.toFixed(1)}°`);
                }
            }
        } catch { /* skip skew detection on error */ }

        const skipOcr = quality.isBlurry && quality.brightness < SKIP_OCR_BRIGHTNESS_THRESHOLD;
        if (skipOcr) {
            addLog('Skipping OCR: image too blurry and dark. Unlikely to succeed.');
            safeSetStatus('Image too blurry and dark. Hold steady, improve lighting, and try again.');
            reportProgress({ phase: 'done' });
            return {
                isbn: null,
                suggestions: allCandidates.size > 0 ? Array.from(allCandidates).slice(0, 6) : [],
                diagnostics: {
                    quality,
                    phase: 'ocr',
                    barcodeAttempted: true,
                    ocrPassesAttempted: 0,
                    skipReason: 'Image too blurry and dark',
                    lowResolution: lowRes,
                },
            };
        }

        if (quality.isBlurry) safeSetStatus('Image looks blurry. Hold steady and move closer.');
        else if (quality.isDark) safeSetStatus('Low light. Improve lighting for better OCR.');
        else if (lowRes) safeSetStatus('Move closer so ISBN fills the frame for better OCR.');

        const ocrPasses = buildOcrPasses(quality, `${prefix}`);
        const useMultilang = runOcrWithLang && (ocrLanguage === 'de' || ocrLanguage === 'both');
        const totalPasses = ocrPasses.length + (useMultilang ? 1 : 0);

        reportProgress({ phase: 'ocr', currentPass: 0, totalPasses });

        /** Track best ISBN found so far when confidence is below threshold. */
        let bestResult: { isbn: string; confidence?: number } | null = null;
        /** Map candidate → per-char confidence weights for targeted double-fix. */
        const candidateConfidences = new Map<string, number[]>();

        for (let i = 0; i < ocrPasses.length; i++) {
            const pass = ocrPasses[i];
            if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) {
                addLog(`OCR total timeout reached.`);
                break;
            }
            if (signal?.aborted) break;
            try {
                safeSetStatus(`OCR: pass ${i + 1} of ${totalPasses}...`);
                reportProgress({ phase: 'ocr', currentPass: i + 1, totalPasses, passLabel: pass.label });
                const effectiveRotation = (pass.rotation === 0 && Math.abs(detectedSkew) > 1) ? detectedSkew : pass.rotation;
                const processed = preprocessImage(img, canvas, effectiveRotation, pass.crop, pass.mode);
                const result = await runOcr(processed, pass.label, extractIsbnCandidates, isValidIsbn, {
                    psm: pass.psm,
                    charWhitelist: pass.charWhitelist,
                    onRecognizeProgress: (pct) => reportProgress({ phase: 'ocr', currentPass: i + 1, totalPasses, passLabel: pass.label, passProgress: Math.round(pct * 100) }),
                });
                ocrPassesAttempted += 1;
                result.allCandidates.forEach(c => allCandidates.add(c));
                // Store per-char confidence weights for targeted double-fix later
                if (result.symbolConfidences?.length) {
                    const weights = getCharConfidenceWeights(result.symbolConfidences);
                    for (const c of result.allCandidates) {
                        if (!candidateConfidences.has(c) && weights.length === c.length) {
                            candidateConfidences.set(c, weights);
                        }
                    }
                }
                const repairable = Array.from(allCandidates).filter(c => !isValidIsbn(c)).flatMap(c => {
                    const fix = tryFixChecksum(c);
                    return fix ? [fix] : [];
                });
                reportProgress({ phase: 'ocr', currentPass: i + 1, totalPasses, passLabel: pass.label, possibleCandidates: repairable.slice(0, 3) });
                if (result.isbn) {
                    addLog(`ISBN via OCR [${pass.label}]: ${result.isbn}${result.confidence != null ? ` conf=${result.confidence}` : ''}`);
                    if (result.confidence != null) {
                        addLog(`[OCR-ANALYTICS] pass=${pass.label} confidence=${result.confidence} imgWidth=${img.width} brightness=${quality.brightness.toFixed(0)} blur=${quality.blurVariance.toFixed(0)}`);
                    }
                    // Early exit only when confidence is unavailable (backward compat) or >= threshold
                    if (result.confidence == null || result.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
                        safeSetStatus(`Found ISBN: ${result.isbn}`);
                        addLog(`Early exit: valid ISBN found${result.confidence != null ? ` (conf=${result.confidence}, threshold=${HIGH_CONFIDENCE_THRESHOLD})` : ''}`);
                        return { isbn: result.isbn, suggestions: [], detectionMethod: 'ocr', confidence: result.confidence, confidenceBand: getConfidenceBand(result.confidence) };
                    }
                    // Low confidence: save as best candidate and continue scanning
                    if (!bestResult || (result.confidence != null && (bestResult.confidence == null || result.confidence > bestResult.confidence))) {
                        bestResult = { isbn: result.isbn, confidence: result.confidence };
                        addLog(`Low confidence ISBN (${result.confidence} < ${HIGH_CONFIDENCE_THRESHOLD}), continuing scan...`);
                    }
                }
            } catch (err) {
                addLog(`OCR pass [${pass.label}] error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        /* ── Phase 2b: Multi-language fallback (German/non-English books) ──── */
        // Guarded by useMultilang so ocrLanguage='en' correctly skips this phase.
        // 'de' uses Tesseract's German-only model; 'both' combines eng+deu for mixed spines.
        if (useMultilang && !signal?.aborted && (OCR_TOTAL_TIMEOUT - (Date.now() - ocrStartTime)) >= 8000) {
            const multilangStr = ocrLanguage === 'de' ? 'deu' : 'eng+deu';
            try {
                safeSetStatus(`OCR: retrying with multi-language (${multilangStr})...`);
                const processed = preprocessImage(img, canvas, 0, CROP_FULL, 'clean');
                const result = await runOcrWithLang(processed, `${prefix}full-${multilangStr}`, multilangStr, extractIsbnCandidates, isValidIsbn);
                ocrPassesAttempted += 1;
                result.allCandidates.forEach(c => allCandidates.add(c));
                if (result.isbn) {
                    addLog(`ISBN via OCR [multi-lang ${multilangStr}]: ${result.isbn}`);
                    safeSetStatus(`Found ISBN: ${result.isbn}`);
                    reportProgress({ phase: 'done' });
                    return { isbn: result.isbn, suggestions: [], detectionMethod: 'ocr-multilang', confidence: result.confidence, confidenceBand: getConfidenceBand(result.confidence) };
                }
            } catch (err) {
                addLog(`Multi-lang OCR fallback error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        /* ── Return best low-confidence candidate if no high-confidence ISBN was found ──── */
        if (bestResult) {
            addLog(`Returning best low-confidence ISBN: ${bestResult.isbn} (conf=${bestResult.confidence})`);
            safeSetStatus(`Found ISBN: ${bestResult.isbn}`);
            reportProgress({ phase: 'done' });
            return { isbn: bestResult.isbn, suggestions: [], detectionMethod: 'ocr', confidence: bestResult.confidence, confidenceBand: getConfidenceBand(bestResult.confidence) };
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
                if (!fix) {
                    const charConf = candidateConfidences.get(c);
                    const doubleFix = tryFixChecksumDouble(c, charConf);
                    if (doubleFix && !candidateList.includes(doubleFix) && !repaired.includes(doubleFix)) {
                        repaired.push(doubleFix);
                        repairedMap[doubleFix] = c;
                        addLog(`Checksum double-repair: ${c} → ${doubleFix}${charConf ? ' (confidence-guided)' : ''} (suggested)`);
                    }
                    if (!doubleFix) {
                        const tripleFix = tryFixChecksumTriple(c, charConf);
                        if (tripleFix && !candidateList.includes(tripleFix) && !repaired.includes(tripleFix)) {
                            repaired.push(tripleFix);
                            repairedMap[tripleFix] = c;
                            addLog(`Checksum triple-repair: ${c} → ${tripleFix}${charConf ? ' (confidence-guided)' : ''} (suggested)`);
                        }
                    }
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
        } finally {
            pipelineBusyRef.current = false;
        }
    }, [addLog, setStatus, runOcr, runOcrWithLang, tryBarcodeDecode, onProgress, ocrLanguage, scanMode]);

    return { runPipeline };
}
