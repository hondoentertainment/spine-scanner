import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { resolveTesseractModule, useOcrEngine } from '../useOcrEngine';
import { extractIsbnCandidates } from '../../utils/ocr';
import { isValidIsbn } from '../../utils/isbnValidation';

/* ================================================================
 *  resolveTesseractModule (pure function — no mocks needed)
 * ================================================================ */

describe('resolveTesseractModule', () => {
  it('resolves module with createWorker and recognize at root', () => {
    const createWorker = vi.fn();
    const recognize = vi.fn();
    const PSM = { SINGLE_BLOCK: '6', SINGLE_LINE: '7' };
    const mod = { createWorker, recognize, PSM };

    const resolved = resolveTesseractModule(mod);

    expect(resolved.createWorker).toBe(createWorker);
    expect(resolved.recognize).toBe(recognize);
    expect(resolved.PSM).toBe(PSM);
  });

  it('resolves module with default export', () => {
    const createWorker = vi.fn();
    const recognize = vi.fn();
    const mod = {
      default: { createWorker, recognize, PSM: {} },
    };

    const resolved = resolveTesseractModule(mod);

    expect(resolved.createWorker).toBe(createWorker);
    expect(resolved.recognize).toBe(recognize);
  });

  it('accepts module with only recognize (no createWorker)', () => {
    const recognize = vi.fn();
    const mod = { recognize };

    const resolved = resolveTesseractModule(mod);

    expect(resolved.createWorker).toBeUndefined();
    expect(resolved.recognize).toBe(recognize);
  });

  it('throws when neither createWorker nor recognize exist', () => {
    const mod = { foo: 'bar' };

    expect(() => resolveTesseractModule(mod)).toThrow(/tesseract.js module resolution failed/);
    expect(() => resolveTesseractModule(mod)).toThrow(/Keys: \[foo\]/);
  });
});

/* ================================================================
 *  useOcrEngine — mocked tesseract (shared mock for namespace + default)
 * ================================================================ */

let mockOcrText = '';
let mockOcrConfidence: number | undefined;
let createWorkerReject: Error | null = null;
let workerRecognizeReject: Error | null = null;

const { createWorkerFn, recognizeFn } = vi.hoisted(() => ({
  createWorkerFn: vi.fn(),
  recognizeFn: vi.fn(),
}));

vi.mock('tesseract.js', () => {
  const mod = {
    createWorker: createWorkerFn,
    recognize: recognizeFn,
    PSM: { SINGLE_BLOCK: '6', SINGLE_LINE: '7', SPARSE_TEXT: '11' },
  };
  return { default: mod, ...mod };
});

describe('useOcrEngine', () => {
  let addLog: ReturnType<typeof vi.fn>;
  let setStatus: ReturnType<typeof vi.fn>;
  let onOcrReady: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    addLog = vi.fn();
    setStatus = vi.fn();
    onOcrReady = vi.fn();
    mockOcrText = '';
    mockOcrConfidence = undefined;
    createWorkerReject = null;
    workerRecognizeReject = null;

    createWorkerFn.mockImplementation(async () => {
      if (createWorkerReject) throw createWorkerReject;
      const worker = {
        setParameters: vi.fn().mockResolvedValue(undefined),
        recognize: vi.fn().mockImplementation(async () => {
          if (workerRecognizeReject) throw workerRecognizeReject;
          return { data: { text: mockOcrText, confidence: mockOcrConfidence } };
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      return worker;
    });

    recognizeFn.mockImplementation(async () => ({
      data: { text: mockOcrText, confidence: mockOcrConfidence },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runOcr with worker', () => {
    it('returns ISBN when worker recognize succeeds', async () => {
      mockOcrText = 'ISBN 978-0-14-103614-4';

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBe('9780141036144');
      expect(ocrResult.allCandidates).toContain('9780141036144');
    });
  });

  describe('runOcr fallback when worker fails', () => {
    it('uses one-shot recognize when getWorker returns null after retries', async () => {
      createWorkerReject = new Error('Worker init failed');
      mockOcrText = 'Penguin 978-0-14-103614-4 Penguin Classics';

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'fallback-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('one-shot recognize() fallback'));
      expect(ocrResult.isbn).toBe('9780141036144');
    });
  });

  describe('runOcr when worker recognize throws', () => {
    it('falls back to one-shot recognize when worker.recognize fails', async () => {
      workerRecognizeReject = new Error('recognize failed');
      mockOcrText = '9780141036144';

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'worker-fail-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(addLog).toHaveBeenCalledWith(expect.stringMatching(/Worker recognize failed|one-shot recognize/));
      expect(ocrResult.isbn).toBe('9780141036144');
    });
  });

  describe('runOcr options', () => {
    it('passes psm and charWhitelist to worker setParameters', async () => {
      mockOcrText = '9780141036144';

      let capturedWorker: { setParameters: ReturnType<typeof vi.fn> } | null = null;
      createWorkerFn.mockImplementation(async () => {
        const w = {
          setParameters: vi.fn().mockResolvedValue(undefined),
          recognize: vi.fn().mockResolvedValue({ data: { text: mockOcrText } }),
          terminate: vi.fn().mockResolvedValue(undefined),
        };
        capturedWorker = w;
        return w;
      });

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'test',
          extractIsbnCandidates,
          isValidIsbn,
          { psm: '7', charWhitelist: '0123456789X' }
        )
      );

      expect(capturedWorker?.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: '0123456789X',
        })
      );
    });
  });

  describe('runOcr result structure', () => {
    it('returns allCandidates and null isbn when no valid ISBN found', async () => {
      mockOcrText = 'No ISBN here at all';

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBeNull();
      expect(ocrResult.allCandidates).toEqual([]);
    });

    it('includes confidence when Tesseract returns it', async () => {
      mockOcrText = '9780141036144';
      mockOcrConfidence = 95;

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.confidence).toBe(95);
    });
  });

  describe('preWarm', () => {
    it('calls onOcrReady and sets ocrState to ready when worker is ready', async () => {
      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      await act(async () => {
        await result.current.preWarm();
      });

      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Pre-warming OCR engine'));
      expect(addLog).toHaveBeenCalledWith(expect.stringMatching(/OCR engine pre-warmed|OCR worker ready/));
      expect(onOcrReady).toHaveBeenCalled();
      expect(result.current.ocrState).toBe('ready');
    });

    it('sets ocrState to fallback and calls onOcrReady when worker creation fails after retries', async () => {
      createWorkerReject = new Error('createWorker failed');

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      await act(async () => {
        await result.current.preWarm();
      });

      expect(addLog).toHaveBeenCalledWith(expect.stringMatching(/OCR worker unavailable|Pre-warm failed|will use fallback/));
      expect(result.current.ocrState).toBe('fallback');
      expect(onOcrReady).toHaveBeenCalled();
    });
  });

  describe('runOcrWithLang', () => {
    it('calls recognize with eng+deu for multi-language OCR', async () => {
      mockOcrText = 'ISBN 978-3-16-148410-0';

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcrWithLang(
          'data:image/png;base64,iVBORw0KGgo=',
          'deu-test',
          'eng+deu',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('eng+deu'));
      expect(recognizeFn).toHaveBeenCalledWith(
        expect.any(String),
        'eng+deu',
        expect.any(Object)
      );
      expect(ocrResult.isbn).toBe('9783161484100');
    });
  });

  describe('worker retry counter NOT decremented on recognize timeout', () => {
    it('does not decrement workerRetries when worker.recognize times out', async () => {
      // First call: worker created successfully, recognize times out
      workerRecognizeReject = new Error('OCR test: timed out after 8000ms');
      mockOcrText = '9780141036144'; // fallback will use this

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      // First runOcr: worker is created, recognize fails, falls back to one-shot
      await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'timeout-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      // Worker was terminated, workerRef is null. But retry counter should NOT have changed.
      // Now clear the error so the next worker creation succeeds
      workerRecognizeReject = null;
      mockOcrText = '9783161484100';

      // Second runOcr: should be able to create a new worker (retry counter not exhausted)
      // Use a different image string to avoid OCR cache hit from the first call
      const ocrResult2 = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,DIFFERENT_IMAGE_DATA',
          'after-timeout-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      // First runOcr: 1 create (worker reused across recognize retries), recognize fails twice, terminate, fallback to one-shot.
      // Second runOcr: 1 create (workerRef was null after terminate).
      expect(createWorkerFn).toHaveBeenCalledTimes(2);
      expect(ocrResult2.isbn).toBe('9783161484100');
    });
  });

  describe('runOcr rejects invalid input', () => {
    it('rejects empty string input', async () => {
      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          '',
          'empty-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBeNull();
      expect(ocrResult.allCandidates).toEqual([]);
      expect(ocrResult.confidence).toBeUndefined();
      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('empty or invalid'));
    });

    it('rejects non-data-URL string input', async () => {
      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'https://example.com/image.png',
          'non-dataurl-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBeNull();
      expect(ocrResult.allCandidates).toEqual([]);
      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('expected data:image/ URL'));
    });

    it('rejects oversized string input (>7MB)', async () => {
      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      // Create a data URL string > 7MB
      const oversized = 'data:image/png;base64,' + 'A'.repeat(7_000_001);

      const ocrResult = await act(async () =>
        result.current.runOcr(
          oversized,
          'oversized-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBeNull();
      expect(ocrResult.allCandidates).toEqual([]);
      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('too large'));
    });
  });

  describe('runOcr returns confidence undefined when Tesseract does not provide it', () => {
    it('returns undefined confidence when mock returns no confidence', async () => {
      mockOcrText = '9780141036144';
      mockOcrConfidence = undefined; // Tesseract doesn't provide confidence

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      const ocrResult = await act(async () =>
        result.current.runOcr(
          'data:image/png;base64,iVBORw0KGgo=',
          'no-conf-test',
          extractIsbnCandidates,
          isValidIsbn
        )
      );

      expect(ocrResult.isbn).toBe('9780141036144');
      expect(ocrResult.confidence).toBeUndefined();
    });
  });
});
