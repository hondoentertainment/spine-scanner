import { describe, expect, it, vi } from 'vitest';
import { fetchShelfVisionBooks, isShelfVisionEnabled } from '../shelfVision.ts';

describe('shelf vision gate', () => {
  it('stays off unless the flag and an http endpoint are both set', () => {
    expect(isShelfVisionEnabled({})).toBe(false);
    expect(isShelfVisionEnabled({ VITE_SHELF_VISION_API: 'true' })).toBe(false);
    expect(isShelfVisionEnabled({
      VITE_SHELF_VISION_API: 'true',
      VITE_SHELF_VISION_ENDPOINT: 'ftp://files.example/shelf',
    })).toBe(false);
    expect(isShelfVisionEnabled({
      VITE_SHELF_VISION_API: 'true',
      VITE_SHELF_VISION_ENDPOINT: 'https://vision.example/shelf',
    })).toBe(true);
  });

  it('does not call the network when the flag is off', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchShelfVisionBooks('data:image/jpeg;base64,abc', { env: {}, fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('parses books from a configured endpoint and ignores a bad payload', async () => {
    const env = {
      VITE_SHELF_VISION_API: 'true',
      VITE_SHELF_VISION_ENDPOINT: 'https://vision.example/shelf',
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        books: [
          { title: 'Kindred', author: 'Octavia E. Butler', isbn: '9780807083697' },
          { title: '  ', author: '', isbn: '' },
        ],
      }),
    });
    await expect(fetchShelfVisionBooks('data:image/jpeg;base64,abc', { env, fetchImpl })).resolves.toEqual([
      { title: 'Kindred', author: 'Octavia E. Butler', isbn: '9780807083697' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith('https://vision.example/shelf', expect.objectContaining({ method: 'POST' }));

    fetchImpl.mockResolvedValueOnce({ ok: true, json: async () => ({ nope: true }) });
    await expect(fetchShelfVisionBooks('data:image/jpeg;base64,abc', { env, fetchImpl })).resolves.toBeNull();

    fetchImpl.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchShelfVisionBooks('data:image/jpeg;base64,abc', { env, fetchImpl })).resolves.toBeNull();
  });
});
