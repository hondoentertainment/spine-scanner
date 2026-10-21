export type CloudLinkDecision = 'offer' | 'merged' | 'later';

const STORAGE_KEY = 'spine-scanner.cloud-link';

export function getCloudLinkDecision(userId: string): CloudLinkDecision | null {
  const all = readAll();
  const value = all[userId];
  if (value === 'offer' || value === 'merged' || value === 'later') return value;
  return null;
}

export function setCloudLinkDecision(userId: string, decision: CloudLinkDecision): void {
  const all = readAll();
  all[userId] = decision;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Private mode can reject writes. The in-memory offer still works for this visit.
  }
}

/**
 * First sign-in with books already on the device should ask before merging.
 * `later` keeps the device copy and skips the automatic push.
 * Anything else can run the usual merge (local ids win, remote-only books stay).
 */
export function shouldOfferLocalMerge(input: {
  localBookCount: number;
  pendingCloudLink: boolean;
  decision: CloudLinkDecision | null;
}): 'offer' | 'hold' | 'sync' {
  if (input.decision === 'later') return 'hold';
  if (
    input.localBookCount > 0
    && (input.decision === 'offer' || (input.decision == null && input.pendingCloudLink))
  ) {
    return 'offer';
  }
  return 'sync';
}

function readAll(): Record<string, CloudLinkDecision> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CloudLinkDecision>;
  } catch {
    return {};
  }
}
