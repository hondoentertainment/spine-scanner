import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateAmazonLink } from '../amazonLink';
import { copyBookLink, getBookShareUrl, getShareBaseUrl, shareBook } from '../shareBook';

describe('generateAmazonLink', () => {
  it('generates a link with the ISBN as search term', () => {
    const link = generateAmazonLink('9780141036144');
    expect(link).toContain('9780141036144');
    expect(link).toContain('amazon.com');
  });

  it('does not include an affiliate tag', () => {
    const link = generateAmazonLink('9780141036144');
    expect(link).not.toContain('tag=');
  });

  it('returns a valid URL', () => {
    const link = generateAmazonLink('9780141036144');
    expect(() => new URL(link)).not.toThrow();
  });
});

describe('shareBook helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a share base URL with and without a trailing slash', () => {
    expect(getShareBaseUrl()).toMatch(/^https?:\/\//);
    const withSlash = getShareBaseUrl();
    expect(withSlash.endsWith('/')).toBe(false);
  });

  it('returns a library URL when the ISBN is empty after cleaning', () => {
    expect(getBookShareUrl('!!!')).toMatch(/\/library$/);
  });

  it('returns a deep link for a usable ISBN', () => {
    expect(getBookShareUrl('978-0141036144')).toContain('isbn=978-0141036144');
  });

  it('copies a share payload and reports clipboard failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await expect(copyBookLink('9780141036144', '1984', 'Orwell')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalled();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await expect(copyBookLink('9780141036144', '1984', 'Orwell')).resolves.toBe(false);
  });

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      share,
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    });
    await expect(shareBook('9780141036144', '1984', 'Orwell', vi.fn())).resolves.toBe(true);
    expect(share).toHaveBeenCalled();
  });

  it('treats a user abort as a failed share without copying', async () => {
    const abort = Object.assign(new Error('nope'), { name: 'AbortError' });
    Object.assign(navigator, {
      share: vi.fn().mockRejectedValue(abort),
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    });
    const onCopy = vi.fn();
    await expect(shareBook('9780141036144', '1984', 'Orwell', onCopy)).resolves.toBe(false);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('falls back to copy when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: undefined, clipboard: { writeText } });
    const onCopy = vi.fn();
    await expect(shareBook('9780141036144', '1984', 'Orwell', onCopy)).resolves.toBe(true);
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
