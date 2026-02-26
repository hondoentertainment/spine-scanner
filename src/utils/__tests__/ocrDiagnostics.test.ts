import { describe, it, expect } from 'vitest';
import { formatDiagnostics, buildErrorDiagnostics } from '../ocrDiagnostics';
import type { ScanDiagnostics } from '../../hooks/useScanPipeline';

function makeDiag(overrides: Partial<ScanDiagnostics> = {}): ScanDiagnostics {
  return {
    quality: {
      brightness: 128,
      blurVariance: 150,
      isDark: false,
      isBlurry: false,
    },
    phase: 'ocr',
    barcodeAttempted: true,
    ocrPassesAttempted: 5,
    ...overrides,
  };
}

describe('formatDiagnostics', () => {
  it('includes image quality section with brightness and blur', () => {
    const diag = makeDiag();
    const out = formatDiagnostics(diag);
    expect(out).toContain('═══ Image quality ═══');
    expect(out).toContain('Brightness: 128 (OK)');
    expect(out).toContain('Blur (sharpness): 150 (OK)');
  });

  it('marks dark when brightness is low', () => {
    const diag = makeDiag({
      quality: { brightness: 50, blurVariance: 150, isDark: true, isBlurry: false },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('low — add light');
  });

  it('marks blurry when variance is low', () => {
    const diag = makeDiag({
      quality: { brightness: 128, blurVariance: 80, isDark: false, isBlurry: true },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('blurry — hold steady');
  });

  it('includes low resolution line when applicable', () => {
    const diag = makeDiag({ lowResolution: true });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Resolution: low (move closer)');
  });

  it('includes skip reason when present', () => {
    const diag = makeDiag({ skipReason: 'Image too blurry and dark' });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Skipped OCR: Image too blurry and dark');
  });

  it('includes scan progress section', () => {
    const diag = makeDiag({ ocrPassesAttempted: 12, phase: 'suggestions' });
    const out = formatDiagnostics(diag);
    expect(out).toContain('═══ Scan progress ═══');
    expect(out).toContain('Phase: suggestions');
    expect(out).toContain('OCR passes attempted: 12');
  });

  it('includes tips section', () => {
    const diag = makeDiag();
    const out = formatDiagnostics(diag);
    expect(out).toContain('═══ Tips ═══');
  });

  it('includes skip-specific tips when skipReason present', () => {
    const diag = makeDiag({ skipReason: 'Image too blurry and dark' });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Hold the camera steady');
    expect(out).toContain('brighter lighting');
  });

  it('includes low resolution tip when applicable', () => {
    const diag = makeDiag({ lowResolution: true });
    const out = formatDiagnostics(diag);
    expect(out).toContain('200+ px per axis');
  });

  it('shows "low" brightness label when isDark', () => {
    const diag = makeDiag({
      quality: { brightness: 40, blurVariance: 200, isDark: true, isBlurry: false },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('(low');
  });

  it('shows "blurry" label when isBlurry', () => {
    const diag = makeDiag({
      quality: { brightness: 128, blurVariance: 60, isDark: false, isBlurry: true },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('(blurry');
  });

  it('includes skip reason text in output', () => {
    const diag = makeDiag({ skipReason: 'Frame was too shaky' });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Frame was too shaky');
  });

  it('shows low resolution hint when lowResolution is true', () => {
    const diag = makeDiag({ lowResolution: true });
    const out = formatDiagnostics(diag);
    expect(out).toContain('low (move closer)');
  });

  it('shows "hold steady" tip when blurry', () => {
    const diag = makeDiag({
      quality: { brightness: 128, blurVariance: 60, isDark: false, isBlurry: true },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Hold steady');
  });

  it('shows "improve lighting" tip when dark', () => {
    const diag = makeDiag({
      quality: { brightness: 40, blurVariance: 200, isDark: true, isBlurry: false },
    });
    const out = formatDiagnostics(diag);
    expect(out).toContain('Improve lighting');
  });
});

describe('buildErrorDiagnostics', () => {
  it('includes error message and recent logs', () => {
    const out = buildErrorDiagnostics('Something failed', ['log1', 'log2']);
    expect(out).toContain('═══ Error ═══');
    expect(out).toContain('Something failed');
    expect(out).toContain('═══ Recent logs ═══');
    expect(out).toContain('log1');
    expect(out).toContain('log2');
  });

  it('shows "(no logs)" when logs array is empty', () => {
    const out = buildErrorDiagnostics('Error', []);
    expect(out).toContain('(no logs)');
  });

  it('limits logs to 10 entries', () => {
    const logs = Array.from({ length: 15 }, (_, i) => `log${i}`);
    const out = buildErrorDiagnostics('Error', logs);
    expect(out).not.toContain('log10');
  });

  it('returns timeout-specific tips for timeout errors', () => {
    const out = buildErrorDiagnostics('OCR narrow-0: timed out after 8000ms', []);
    expect(out).toContain('═══ Tips ═══');
    expect(out).toContain('OCR took too long');
    expect(out).toContain('smaller/clearer image');
  });

  it('returns worker/module tips for tesseract errors', () => {
    const out = buildErrorDiagnostics('tesseract.js module resolution failed', []);
    expect(out).toContain('OCR engine may still be loading');
    expect(out).toContain('internet connection');
  });

  it('returns fallback tips when one-shot recognize failed (module not loaded)', () => {
    const out = buildErrorDiagnostics('One-shot recognize failed: module not loaded', []);
    expect(out).toContain('First scan may be slower');
    expect(out).toContain('fallback');
  });

  it('returns failed to load tips for image errors', () => {
    const out = buildErrorDiagnostics('Failed to load image', []);
    expect(out).toContain('corrupted or in an unsupported format');
  });

  it('returns camera tips for media errors', () => {
    const out = buildErrorDiagnostics('Camera access denied', []);
    expect(out).toContain('Grant camera permission');
    expect(out).toContain('photo upload');
  });

  it('returns generic tips for unknown errors', () => {
    const out = buildErrorDiagnostics('Unknown error xyz', []);
    expect(out).toContain('Expand the debug panel');
    expect(out).toContain('manual ISBN entry');
  });

  it('maps timeout errors to helpful tips', () => {
    const out = buildErrorDiagnostics('OCR pass timed out after 8000ms', []);
    expect(out).toContain('OCR took too long');
  });

  it('maps worker errors to OCR engine tips', () => {
    const out = buildErrorDiagnostics('worker initialization failed', []);
    expect(out).toContain('OCR engine may still be loading');
  });

  it('includes recent logs in output', () => {
    const out = buildErrorDiagnostics('some error', ['first log', 'second log', 'third log']);
    expect(out).toContain('first log');
    expect(out).toContain('second log');
    expect(out).toContain('third log');
  });
});
