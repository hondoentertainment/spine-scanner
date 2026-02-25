import type { ScanDiagnostics } from '../hooks/useScanPipeline.ts';
import { DARK_SCENE_THRESHOLD as DARK_THRESHOLD, BLUR_VARIANCE_THRESHOLD as BLUR_THRESHOLD } from '../hooks/useScanPipeline.ts';

/**
 * Format scan diagnostics into a readable string for the expandable toast details.
 */
export function formatDiagnostics(diag: ScanDiagnostics): string {
    const lines: string[] = [];
    const { quality, phase, ocrPassesAttempted, skipReason } = diag;

    lines.push('═══ Image quality ═══');
    lines.push(`Brightness: ${quality.brightness.toFixed(0)} ${quality.isDark ? '(low — add light)' : '(OK)'}`);
    lines.push(`Blur (sharpness): ${quality.blurVariance.toFixed(0)} ${quality.isBlurry ? '(blurry — hold steady)' : '(OK)'}`);
    if (diag.lowResolution) lines.push('Resolution: low (move closer)');

    if (skipReason) {
        lines.push('');
        lines.push(`Skipped OCR: ${skipReason}`);
    }

    lines.push('');
    lines.push('═══ Scan progress ═══');
    lines.push(`Phase: ${phase}`);
    lines.push(`OCR passes attempted: ${ocrPassesAttempted}`);

    lines.push('');
    lines.push('═══ Tips ═══');
    lines.push(...getDiagnosticTips(diag));

    return lines.join('\n');
}

/**
 * Generate actionable tips based on diagnostics.
 */
function getDiagnosticTips(diag: ScanDiagnostics): string[] {
    const tips: string[] = [];
    const { quality, skipReason, ocrPassesAttempted } = diag;

    if (skipReason) {
        tips.push('• Hold the camera steady for 1–2 seconds');
        tips.push('• Use brighter lighting or move to a well-lit area');
        tips.push('• Move closer so the ISBN fills more of the frame');
        return tips;
    }

    if (diag.lowResolution) {
        tips.push('• Move closer so the ISBN fills more of the frame (200+ px per axis for reliable OCR)');
    }
    if (quality.isDark) {
        tips.push('• Improve lighting — low light reduces OCR accuracy');
    }
    if (quality.isBlurry) {
        tips.push('• Hold steady — blur was detected');
        tips.push('• Try resting the phone or book on a surface');
    }
    if (quality.brightness < DARK_THRESHOLD - 30) {
        tips.push('• Very dark scene — consider using a flashlight or lamp');
    }
    if (quality.blurVariance < BLUR_THRESHOLD * 0.7) {
        tips.push('• Image is quite blurry — refocus and hold still before capturing');
    }
    if (ocrPassesAttempted > 10 && !quality.isBlurry && !quality.isDark) {
        tips.push('• OCR ran many passes — ensure ISBN text is clearly visible and not obscured');
    }
    if (tips.length === 0) {
        tips.push('• Ensure the ISBN barcode or text is visible in the frame');
        tips.push('• Try different angles (spine often has ISBN printed vertically)');
        tips.push('• Use manual entry if the spine is worn or damaged');
    }

    return tips;
}

/**
 * Build diagnostic details for scan errors (when pipeline throws).
 * Maps common error patterns to helpful tips.
 */
export function buildErrorDiagnostics(errorMessage: string, recentLogs: string[]): string {
    const lines: string[] = [];

    lines.push('═══ Error ═══');
    lines.push(errorMessage);

    lines.push('');
    lines.push('═══ Recent logs ═══');
    const logs = recentLogs.slice(0, 10);
    if (logs.length > 0) {
        lines.push(...logs);
    } else {
        lines.push('(no logs)');
    }

    lines.push('');
    lines.push('═══ Tips ═══');
    lines.push(...getErrorTips(errorMessage));

    return lines.join('\n');
}

/**
 * Suggest fixes based on common OCR/scan error patterns.
 */
function getErrorTips(errorMessage: string): string[] {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('timeout') || msg.includes('timed out')) {
        return [
            '• OCR took too long — try a smaller/clearer image',
            '• Ensure a stable connection if loading OCR data',
            '• Try capturing again with better lighting',
        ];
    }
    if (msg.includes('fallback') || msg.includes('one-shot')) {
        return [
            '• First scan may be slower while using fallback OCR mode',
            '• OCR worker failed to start — scans will still work',
            '• Refresh the page to retry loading the full OCR engine',
        ];
    }
    if (msg.includes('tesseract') || msg.includes('worker') || msg.includes('module')) {
        return [
            '• OCR engine may still be loading — wait a moment and try again',
            '• Check your internet connection (first load downloads OCR data)',
            '• Refresh the page if the problem persists',
        ];
    }
    if (msg.includes('failed to load') || msg.includes('failed to read')) {
        return [
            '• The image may be corrupted or in an unsupported format',
            '• Try a different photo (JPEG or PNG, under 5MB)',
        ];
    }
    if (msg.includes('camera') || msg.includes('video') || msg.includes('media')) {
        return [
            '• Grant camera permission in browser settings',
            '• Use photo upload as an alternative',
        ];
    }

    return [
        '• Expand the debug panel (terminal icon) for full logs',
        '• Try again with a clearer image',
        '• Use manual ISBN entry if scanning keeps failing',
    ];
}
