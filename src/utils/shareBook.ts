/**
 * Share/copy utilities for individual books.
 * Deep link: /library?isbn=… (legacy #book-{isbn} still redirects on load).
 */
import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from './amazonLink.ts';
import { bookShareCardFilename, renderBookShareCardPng } from './bookShareCardImage.ts';

/** Base URL for shareable links (origin + base path, no trailing slash). */
export function getShareBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base.endsWith('/') ? base.slice(0, -1) : base}`;
}

/** Generate deep link to open a specific book in the app. */
export function getBookShareUrl(isbn: string): string {
  const clean = isbn.replace(/[^0-9Xa-z-]/g, ''); // allow photo-uuid
  if (!clean) return `${getShareBaseUrl()}/library`;
  return `${getShareBaseUrl()}/library?isbn=${encodeURIComponent(clean)}`;
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

type ToastFn = (message: string, variant: 'success' | 'error' | 'info') => void;

/** Create a PNG share card; Web Share with file when supported, otherwise trigger download. */
export async function shareOrDownloadBookShareCard(
  book: Pick<BookEntry, 'title' | 'author' | 'isbn' | 'coverImg'>,
  toast: ToastFn,
): Promise<void> {
  try {
    const blob = await renderBookShareCardPng(book);
    if (!blob) {
      toast('Could not create image', 'error');
      return;
    }
    const name = bookShareCardFilename(book);
    const file = new File([blob], name, { type: 'image/png' });
    const payload: ShareData = { files: [file], title: book.title, text: `${book.title} by ${book.author}` };
    if (navigator.share && navigator.canShare?.(payload)) {
      try {
        await navigator.share(payload);
        toast('Image shared', 'success');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.click();
    URL.revokeObjectURL(url);
    toast('Image downloaded', 'success');
  } catch {
    toast('Could not share or download image', 'error');
  }
}
