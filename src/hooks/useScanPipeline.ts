import { useCallback } from 'react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { extractIsbnCandidates, tryFixChecksum } from '../utils/ocr.ts';
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

const DARK_SCENE_THRESHOLD = 90;
const BLUR_VARIANCE_THRESHOLD = 120;
const OCR_TOTAL_TIMEOUT = 35000;

type PreprocessMode = 'clean' | 'enhanced' | 'boost' | 'invert' | 'sharpen';

const PREPROCESS_FILTERS: Record<PreprocessMode, string> = {
    clean:    'grayscale(100%) contrast(110%)',
    enhanced: 'grayscale(100%) contrast(140%) brightness(108%)',
    boost:    'grayscale(100%) contrast(180%) brightness(115%)',
    invert:   'grayscale(100%) contrast(130%) invert(100%)',
    sharpen:  'grayscale(100%) contrast(130%) brightness(105%)',
};

export interface FrameQuality {
    brightness: number;
    blurVariance: number;
    isDark: boolean;
    isBlurry: boolean;
}

interface OcrPassConfig {
    crop: CropRegion;
    rotation: number;
    mode: PreprocessMode;
    label: string;
}

/* ================================================================
 *  Image preprocessing (pure functions)
 * ================================================================ */

const getAdaptiveScale = (imgWidth: number): number => {
    if (imgWidth >= 1920) return 1.5;
    if (imgWidth >= 1280) return 2;
    if (imgWidth >= 640) return 2.5;
    return 3;
};

export const preprocessImage = (
    img: HTMLImageElement, canvas: HTMLCanvasElement,
    rotateDeg: number, crop: CropRegion, mode: PreprocessMode = 'clean',
): string => {
    const ctx = canvas.getContext('2d')!;
    const cropX = img.width * (1 - crop.widthFrac) / 2;
    const cropY = img.height * (1 - crop.heightFrac) / 2;
    const cropW = img.width * crop.widthFrac;
    const cropH = img.height * crop.heightFrac;
    const scale = getAdaptiveScale(img.width);
    const outW = cropW * scale;
    const outH = cropH * scale;

    if (rotateDeg === 90 || rotateDeg === 270) { canvas.width = outH; canvas.height = outW; }
    else { canvas.width = outW; canvas.height = outH; }

    ctx.save();
    if (rotateDeg !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotateDeg * Math.PI) / 180);
        ctx.translate(-outW / 2, -outH / 2);
    }
    ctx.filter = PREPROCESS_FILTERS[mode];
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.restore();

    if (mode === 'sharpen' && typeof ctx.getImageData === 'function') {
        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const w = canvas.width;
            const src = new Uint8ClampedArray(data);
            for (let y = 1; y < canvas.height - 1; y++) {
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
            ctx.putImageData(imgData, 0, 0);
        } catch { /* skip */ }
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

export const assessFrameQuality = (
    img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion = CROP_MEDIUM,
): FrameQuality => {
    const brightness = detectBrightness(img, canvas, crop);
    const blurVariance = detectBlurVariance(img, canvas, crop);
    return { brightness, blurVariance, isDark: brightness < DARK_SCENE_THRESHOLD, isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD };
};

const detectBrightness = (img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.getImageData !== 'function') return 128;
        const cropX = img.width * (1 - crop.widthFrac) / 2;
        const cropY = img.height * (1 - crop.heightFrac) / 2;
        const sampleW = Math.min(img.width * crop.widthFrac, 200);
        const sampleH = Math.min(img.height * crop.heightFrac, 150);
        canvas.width = sampleW; canvas.height = sampleH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(img, cropX, cropY, img.width * crop.widthFrac, img.height * crop.heightFrac, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        let total = 0;
        for (let i = 0; i < imgData.data.length; i += 4) total += imgData.data[i];
        return total / (imgData.data.length / 4);
    } catch { return 128; }
};

const detectBlurVariance = (img: HTMLImageElement, canvas: HTMLCanvasElement, crop: CropRegion): number => {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.getImageData !== 'function') return BLUR_VARIANCE_THRESHOLD;
        const cropX = img.width * (1 - crop.widthFrac) / 2;
        const cropY = img.height * (1 - crop.heightFrac) / 2;
        const cropW = img.width * crop.widthFrac;
        const cropH = img.height * crop.heightFrac;
        const sW = Math.min(Math.floor(cropW), 320);
        const sH = Math.min(Math.floor(cropH), 220);
        if (sW < 3 || sH < 3) return BLUR_VARIANCE_THRESHOLD;
        canvas.width = sW; canvas.height = sH;
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, sW, sH);
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

/* ================================================================
 *  Build OCR pass configurations
 * ================================================================ */

function buildOcrPasses(isDark: boolean, prefix: string): OcrPassConfig[] {
    return [
        { crop: CROP_NARROW, rotation: 0,   mode: 'clean',    label: `${prefix}narrow-0` },
        { crop: CROP_NARROW, rotation: 0,   mode: 'enhanced', label: `${prefix}narrow-0-enh` },
        { crop: CROP_CENTER, rotation: 0,   mode: 'clean',    label: `${prefix}center-0` },
        { crop: CROP_MEDIUM, rotation: 0,   mode: 'clean',    label: `${prefix}medium-0` },
        { crop: CROP_MEDIUM, rotation: 0,   mode: 'enhanced', label: `${prefix}medium-0-enh` },
        { crop: CROP_NARROW, rotation: 90,  mode: 'clean',    label: `${prefix}narrow-90` },
        { crop: CROP_NARROW, rotation: 270, mode: 'clean',    label: `${prefix}narrow-270` },
        { crop: CROP_NARROW, rotation: 0,   mode: 'boost',    label: `${prefix}narrow-boost` },
        ...(isDark ? [{ crop: CROP_NARROW, rotation: 0, mode: 'invert' as PreprocessMode, label: `${prefix}narrow-inv` }] : []),
        { crop: CROP_WIDE,   rotation: 0,   mode: 'clean',    label: `${prefix}wide-0` },
        { crop: CROP_FULL,   rotation: 0,   mode: 'clean',    label: `${prefix}full-0` },
    ];
}

/* ================================================================
 *  Shared scan pipeline result
 * ================================================================ */

export interface ScanPipelineResult {
    isbn: string | null;
    suggestions: string[];
}

interface UseScanPipelineOptions {
    addLog: (msg: string) => void;
    setStatus: (msg: string) => void;
    runOcr: (image: string, label: string, extract: typeof extractIsbnCandidates, validate: typeof isValidIsbn) => Promise<OcrResult>;
    tryBarcodeDecode: (source: HTMLImageElement | string, label: string) => Promise<string | null>;
}

/**
 * Hook that provides a unified scan pipeline for both camera capture and photo upload.
 * Eliminates the duplicated barcode + OCR logic.
 */
export function useScanPipeline({ addLog, setStatus, runOcr, tryBarcodeDecode }: UseScanPipelineOptions) {

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

        /* ── Phase 1: Barcode scan (fast, multiple crops) ──── */
        addLog(`Phase 1: Barcode scan (${prefix})...`);
        setStatus('Scanning barcode...');

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
            return { isbn, suggestions: [] };
        }
        if (isbn) {
            allCandidates.add(isbn);
            const repaired = tryFixChecksum(isbn);
            if (repaired) {
                addLog(`ISBN via barcode (repaired): ${isbn} → ${repaired}`);
                setStatus(`Found ISBN: ${repaired}`);
                return { isbn: repaired, suggestions: [] };
            }
        }

        /* ── Phase 2: OCR scan ──── */
        addLog(`Phase 2: OCR scan (${prefix})...`);

        const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
        addLog(`Quality: brightness=${quality.brightness.toFixed(0)} (${quality.isDark ? 'dark' : 'normal'}), blur=${quality.blurVariance.toFixed(0)} (${quality.isBlurry ? 'blurry' : 'sharp'})`);

        if (quality.isBlurry) setStatus('Image looks blurry. Hold steady and move closer.');
        else if (quality.isDark) setStatus('Low light. Improve lighting for better OCR.');

        const ocrPasses = buildOcrPasses(quality.isDark, `${prefix}`);

        for (const pass of ocrPasses) {
            if (Date.now() - ocrStartTime > OCR_TOTAL_TIMEOUT) {
                addLog(`OCR total timeout reached.`);
                break;
            }
            try {
                setStatus(`OCR: ${pass.label}...`);
                const processed = preprocessImage(img, canvas, pass.rotation, pass.crop, pass.mode);
                const result = await runOcr(processed, pass.label, extractIsbnCandidates, isValidIsbn);
                result.allCandidates.forEach(c => allCandidates.add(c));
                if (result.isbn) {
                    addLog(`ISBN via OCR [${pass.label}]: ${result.isbn}`);
                    setStatus(`Found ISBN: ${result.isbn}`);
                    return { isbn: result.isbn, suggestions: [] };
                }
            } catch (err) {
                addLog(`OCR pass [${pass.label}] error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        /* ── Phase 3: Build suggestions ──── */
        const candidateList = Array.from(allCandidates);
        const repaired: string[] = [];
        for (const c of candidateList) {
            if (!isValidIsbn(c)) {
                const fix = tryFixChecksum(c);
                if (fix && !candidateList.includes(fix) && !repaired.includes(fix)) {
                    repaired.push(fix);
                    addLog(`Checksum repair: ${c} → ${fix} (suggested)`);
                }
            }
        }

        return { isbn: null, suggestions: [...candidateList, ...repaired].slice(0, 6) };
    }, [addLog, setStatus, runOcr, tryBarcodeDecode]);

    return { runPipeline };
}
