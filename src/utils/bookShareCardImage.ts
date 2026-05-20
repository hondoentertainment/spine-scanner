import type { BookEntry } from '../types.ts';
import { getBookCoverSrc } from './bookPresentation.ts';

const CARD_W = 1200;
const CARD_H = 630;

function loadImageForCanvas(src: string): Promise<HTMLImageElement | null> {
  if (src.startsWith('data:')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let cy = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
      lines += 1;
      if (lines >= maxLines) return cy;
      line = word;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/**
 * Renders a 1200×630 share card (PNG). Cover may be omitted if the URL is not drawable (CORS).
 */
export async function renderBookShareCardPng(
  book: Pick<BookEntry, 'title' | 'author' | 'isbn' | 'coverImg'>,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.45, '#1e1b4b');
  grad.addColorStop(1, '#4c1d95');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const coverX = 64;
  const coverY = 56;
  const coverW = 320;
  const coverH = 518;
  const coverSrc = book.coverImg?.trim() ? book.coverImg : '';
  const displaySrc = coverSrc || '';
  let coverImg: HTMLImageElement | null = null;
  if (displaySrc) {
    coverImg = await loadImageForCanvas(getBookCoverSrc(displaySrc));
  }

  ctx.save();
  drawRoundedRect(ctx, coverX, coverY, coverW, coverH, 16);
  ctx.clip();
  if (coverImg && coverImg.naturalWidth > 0) {
    const scale = Math.max(coverW / coverImg.naturalWidth, coverH / coverImg.naturalHeight);
    const dw = coverImg.naturalWidth * scale;
    const dh = coverImg.naturalHeight * scale;
    const dx = coverX + (coverW - dw) / 2;
    const dy = coverY + (coverH - dh) / 2;
    ctx.drawImage(coverImg, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = '#334155';
    ctx.fillRect(coverX, coverY, coverW, coverH);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No cover', coverX + coverW / 2, coverY + coverH / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  const textX = coverX + coverW + 48;
  const textMaxW = CARD_W - textX - 64;
  let ty = 100;

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ty = wrapFillText(ctx, book.title || 'Untitled', textX, ty, textMaxW, 64, 3) + 24;

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(book.author || 'Unknown author', textX, ty);
  ty += 52;

  ctx.fillStyle = '#94a3b8';
  ctx.font = '26px ui-monospace, monospace';
  const isbnLine = book.isbn?.trim() ? `ISBN ${book.isbn}` : '';
  if (isbnLine) {
    ctx.fillText(isbnLine, textX, ty);
    ty += 40;
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('Spine Scanner', textX, CARD_H - 48);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
  });
}

export function bookShareCardFilename(book: Pick<BookEntry, 'title' | 'isbn'>): string {
  const base = (book.title || 'book')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'book';
  const suffix = book.isbn?.replace(/[^\dX]/gi, '').slice(-6) || 'card';
  return `${base}-share-${suffix}.png`;
}
