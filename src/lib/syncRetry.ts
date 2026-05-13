/** Resolves after `ms` milliseconds. Exported for testability. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` with exponential-backoff retry.
 *
 * @param fn          The async operation to attempt.
 * @param opts.maxAttempts  Total attempts before giving up (default 4).
 * @param opts.baseDelayMs  Delay before the first retry in ms (default 2000).
 *                          Subsequent delays are `baseDelayMs * 2^attempt`, capped at 30 s.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 2000;
  const MAX_DELAY_MS = 30_000;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt) break;

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), MAX_DELAY_MS);
      await sleep(delay);
    }
  }

  throw lastError;
}
