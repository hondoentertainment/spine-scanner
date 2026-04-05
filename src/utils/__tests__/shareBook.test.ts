import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getShareBaseUrl, getBookShareUrl, copyBookLink, shareBook } from '../shareBook.ts';

describe('shareBook utilities', () => {
  const origClipboard = navigator.clipboard;
  const origShare = navigator.share;
  const origCanShare = navigator.canShare;

  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://example.com' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'clipboard', { value: origClipboard, configurable: true });
    Object.defineProperty(navigator, 'share', { value: origShare, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: origCanShare, configurable: true });
  });

  it('getShareBaseUrl joins origin and Vite base path', () => {
    expect(getShareBaseUrl()).toMatch(/^https:\/\/example\.com/);
  });

  it('getBookShareUrl appends encoded book hash', () => {
    const u = getBookShareUrl('9780141036144');
    expect(u).toContain('#book-9780141036144');
  });

  it('getBookShareUrl returns base when ISBN empty after strip', () => {
    const base = getShareBaseUrl();
    expect(getBookShareUrl('   ')).toBe(base);
  });

  it('copyBookLink writes combined text and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const ok = await copyBookLink('9780141036144', 'Gatsby', 'Fitzgerald');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('9780141036144'));
  });

  it('copyBookLink returns false when clipboard throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    expect(await copyBookLink('9780141036144', 'T', 'A')).toBe(false);
  });

  it('shareBook uses Web Share when canShare allows', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const ok = await shareBook('9780141036144', 'T', 'A', vi.fn());
    expect(ok).toBe(true);
    expect(share).toHaveBeenCalled();
  });

  it('shareBook returns false on user AbortError', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    expect(await shareBook('9780141036144', 'T', 'A', vi.fn())).toBe(false);
  });

  it('shareBook falls back to copy and invokes callback', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onCopy = vi.fn();
    const ok = await shareBook('9780141036144', 'T', 'A', onCopy);
    expect(ok).toBe(true);
    expect(onCopy).toHaveBeenCalled();
  });
});
