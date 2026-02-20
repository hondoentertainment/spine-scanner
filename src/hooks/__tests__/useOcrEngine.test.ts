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
    it('calls onOcrReady when worker is ready', async () => {
      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      await act(async () => {
        await result.current.preWarm();
      });

      expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Pre-warming OCR engine'));
      expect(addLog).toHaveBeenCalledWith(expect.stringMatching(/OCR engine pre-warmed|OCR worker ready/));
      expect(onOcrReady).toHaveBeenCalled();
    });

    it('logs fallback message when worker creation fails after retries', async () => {
      createWorkerReject = new Error('createWorker failed');

      const { result } = renderHook(() =>
        useOcrEngine({ addLog, setStatus, onOcrReady })
      );

      await act(async () => {
        await result.current.preWarm();
      });

      expect(addLog).toHaveBeenCalledWith(expect.stringMatching(/OCR worker unavailable|Pre-warm failed|will use fallback/));
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
});
