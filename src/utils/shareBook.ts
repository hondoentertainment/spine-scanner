/**
 * Share/copy utilities for individual books.
 * Deep link format: #{base}#book-{isbn} opens library with that book in view.
 */
import { generateAmazonLink } from './amazonLink.ts';

/** Base URL for shareable links (origin + base path). */
export function getShareBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base.endsWith('/') ? base.slice(0, -1) : base}`;
}

/** Generate deep link to open a specific book in the app. */
export function getBookShareUrl(isbn: string): string {
  const clean = isbn.replace(/[^0-9Xa-z-]/g, ''); // allow photo-uuid
  if (!clean) return getShareBaseUrl();
  return `${getShareBaseUrl()}#book-${encodeURIComponent(clean)}`;
}

/** Copy share link to clipboard. Returns true on success. */
export async function copyBookLink(isbn: string, title: string, author: string): Promise<boolean> {
  const url = getBookShareUrl(isbn);
  const amazon = generateAmazonLink(isbn);
  const text = amazon
    ? `${title} by ${author}\n${url}\nView on Amazon: ${amazon}`
    : `${title} by ${author}\n${url}`;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Use Web Share API if available; otherwise fall back to copy. */
export async function shareBook(
  isbn: string,
  title: string,
  author: string,
  onCopyFallback: () => void
): Promise<boolean> {
  const url = getBookShareUrl(isbn);
  const amazon = generateAmazonLink(isbn);
  const shareData: ShareData = {
    title: `${title} by ${author}`,
    text: `Check out "${title}" by ${author}`,
    url: amazon || url,
  };
  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const ok = await copyBookLink(isbn, title, author);
  if (ok) onCopyFallback();
  return ok;
}
