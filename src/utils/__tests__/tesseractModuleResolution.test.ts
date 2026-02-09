import { describe, it, expect } from 'vitest';

/**
 * Tests for the CJS/ESM interop resolution logic used in Scanner.tsx.
 *
 * tesseract.js v7 is a CJS module. When Vite bundles it for browser ESM,
 * the exports can appear in different shapes depending on the bundler:
 *   - Named exports: mod.createWorker, mod.PSM
 *   - On .default: mod.default.createWorker, mod.default.PSM
 *   - Or both
 *
 * The resolveTesseractModule function must handle all these cases.
 */

// Re-implement the resolution logic here so we can test it in isolation
// (the actual function lives in Scanner.tsx but is not exported)
function resolveTesseractModule(mod: any): {
  createWorker: any;
  recognize: any;
  PSM: Record<string, string>;
} {
  const root = mod.createWorker ? mod : mod.default ?? mod;
  const createWorker = root.createWorker;
  const recognize = root.recognize;
  const PSM = root.PSM ?? {};

  if (!createWorker && !recognize) {
    throw new Error(
      `tesseract.js module resolution failed. `
      + `Keys: [${Object.keys(mod).join(', ')}], `
      + `default keys: [${mod.default ? Object.keys(mod.default).join(', ') : 'N/A'}]`
    );
  }
  return { createWorker, recognize, PSM };
}

describe('resolveTesseractModule', () => {
  const mockCreateWorker = async () => ({});
  const mockRecognize = async () => ({});
  const mockPSM = { SINGLE_BLOCK: '6', AUTO: '3' };

  it('resolves when exports are at top level (Vite named export extraction)', () => {
    const mod = {
      createWorker: mockCreateWorker,
      recognize: mockRecognize,
      PSM: mockPSM,
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBe(mockCreateWorker);
    expect(resolved.recognize).toBe(mockRecognize);
    expect(resolved.PSM).toBe(mockPSM);
  });

  it('resolves when exports are on .default (CJS interop)', () => {
    const mod = {
      default: {
        createWorker: mockCreateWorker,
        recognize: mockRecognize,
        PSM: mockPSM,
      },
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBe(mockCreateWorker);
    expect(resolved.recognize).toBe(mockRecognize);
    expect(resolved.PSM).toBe(mockPSM);
  });

  it('resolves when exports are on both top-level and .default', () => {
    const mod = {
      createWorker: mockCreateWorker,
      recognize: mockRecognize,
      PSM: mockPSM,
      default: {
        createWorker: mockCreateWorker,
        recognize: mockRecognize,
        PSM: mockPSM,
      },
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBe(mockCreateWorker);
    expect(resolved.recognize).toBe(mockRecognize);
  });

  it('resolves when only recognize is available (no createWorker)', () => {
    const mod = {
      recognize: mockRecognize,
      PSM: mockPSM,
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBeUndefined();
    expect(resolved.recognize).toBe(mockRecognize);
  });

  it('resolves when only createWorker is available (no recognize)', () => {
    const mod = {
      createWorker: mockCreateWorker,
      PSM: mockPSM,
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBe(mockCreateWorker);
    expect(resolved.recognize).toBeUndefined();
  });

  it('throws when neither createWorker nor recognize is available', () => {
    const mod = { PSM: mockPSM };

    expect(() => resolveTesseractModule(mod)).toThrow('module resolution failed');
  });

  it('throws for completely empty module', () => {
    expect(() => resolveTesseractModule({})).toThrow('module resolution failed');
  });

  it('provides empty PSM object when PSM is missing', () => {
    const mod = {
      createWorker: mockCreateWorker,
      recognize: mockRecognize,
      // PSM missing
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.PSM).toEqual({});
  });

  it('resolves recognize on .default when top-level has no functions', () => {
    const mod = {
      __esModule: true,
      default: {
        createWorker: mockCreateWorker,
        recognize: mockRecognize,
        PSM: mockPSM,
      },
    };

    const resolved = resolveTesseractModule(mod);
    expect(resolved.createWorker).toBe(mockCreateWorker);
    expect(resolved.recognize).toBe(mockRecognize);
  });
});
