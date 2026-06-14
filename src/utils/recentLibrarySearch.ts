const STORAGE_KEY = 'spine-recent-library-searches';
const MAX_RECENT = 8;

export function loadRecentLibrarySearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    return [];
  }
}

export function rememberLibrarySearch(term: string): string[] {
  const trimmed = term.trim();
  if (trimmed.length < 2) return loadRecentLibrarySearches();
  const lowered = trimmed.toLowerCase();
  const next = [trimmed, ...loadRecentLibrarySearches().filter((q) => q.toLowerCase() !== lowered)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

export function clearRecentLibrarySearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
