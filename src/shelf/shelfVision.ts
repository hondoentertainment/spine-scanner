import type { VisionShelfBook } from './types.ts';

export interface ShelfVisionEnv {
  VITE_SHELF_VISION_API?: string;
  VITE_SHELF_VISION_ENDPOINT?: string;
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/** Vision is off unless both the flag and an http(s) endpoint are set at build time. */
export function isShelfVisionEnabled(env: ShelfVisionEnv = import.meta.env): boolean {
  return env.VITE_SHELF_VISION_API === 'true'
    && typeof env.VITE_SHELF_VISION_ENDPOINT === 'string'
    && isHttpUrl(env.VITE_SHELF_VISION_ENDPOINT);
}

const parseVisionBooks = (payload: unknown): VisionShelfBook[] | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { books?: unknown }).books)) {
    return null;
  }
  const books: VisionShelfBook[] = [];
  for (const entry of (payload as { books: unknown[] }).books) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const author = typeof row.author === 'string' ? row.author.trim() : '';
    const isbn = typeof row.isbn === 'string' ? row.isbn.trim() : '';
    if (!title && !author && !isbn) continue;
    books.push({ title, author, isbn });
  }
  return books;
};

/**
 * Optional vision assist. The on-device detector still runs; this only adds
 * candidates when the endpoint is configured. Failures return null.
 */
export async function fetchShelfVisionBooks(
  imageDataUrl: string,
  options: { env?: ShelfVisionEnv; fetchImpl?: typeof fetch } = {},
): Promise<VisionShelfBook[] | null> {
  const env = options.env ?? import.meta.env;
  if (!isShelfVisionEnabled(env) || !imageDataUrl) return null;
  const endpoint = env.VITE_SHELF_VISION_ENDPOINT;
  if (!endpoint) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    if (!response.ok) return null;
    return parseVisionBooks(await response.json());
  } catch {
    return null;
  }
}
