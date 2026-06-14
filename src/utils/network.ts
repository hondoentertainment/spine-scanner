export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function offlineMetadataMessage(): string {
  return 'You appear to be offline. Connect to the internet to refresh metadata.';
}

export function parseOptionalPageCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = parseInt(trimmed, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
