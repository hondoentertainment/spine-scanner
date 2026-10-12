import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ text: '9780441478125', fail: false }));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    async decodeFromImageUrl() {
      if (state.fail) throw new Error('no barcode');
      return { getText: () => state.text };
    }
  },
}));

vi.mock('@zxing/library', () => ({
  DecodeHintType: { POSSIBLE_FORMATS: 0, TRY_HARDER: 1 },
  BarcodeFormat: { EAN_13: 1, UPC_A: 2, CODE_128: 3, ITF: 4 },
}));

import { decodeSpineBarcode } from '../decodeSpineBarcode.ts';

describe('decodeSpineBarcode', () => {
  it('returns a checksum-valid ISBN from ZXing', async () => {
    state.fail = false;
    state.text = '9780441478125';
    await expect(decodeSpineBarcode('data:image/jpeg;base64,abc')).resolves.toBe('9780441478125');
  });

  it('returns null when the crop has no barcode', async () => {
    state.fail = true;
    await expect(decodeSpineBarcode('data:image/jpeg;base64,abc')).resolves.toBeNull();
    await expect(decodeSpineBarcode('')).resolves.toBeNull();
  });
});