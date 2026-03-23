/**
 * Token-bucket rate limiter for client-side throttling of external API calls.
 *
 * Each limiter starts with `maxTokens` tokens. Every call to `tryAcquire` or
 * `waitForToken` consumes one token. Tokens are refilled at `refillRate`
 * tokens per second, up to the `maxTokens` cap.
 */

export interface RateLimiter {
  /** Attempt to consume a token immediately. Returns true if a token was available. */
  tryAcquire(): boolean;
  /** Wait until a token is available, then consume it. */
  waitForToken(): Promise<void>;
}

export function createRateLimiter(maxTokens: number, refillRate: number): RateLimiter {
  let tokens = maxTokens;
  let lastRefillTime = Date.now();

  const refill = (): void => {
    const now = Date.now();
    const elapsed = (now - lastRefillTime) / 1000; // seconds
    const newTokens = elapsed * refillRate;
    tokens = Math.min(maxTokens, tokens + newTokens);
    lastRefillTime = now;
  };

  const tryAcquire = (): boolean => {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  };

  const waitForToken = (): Promise<void> => {
    if (tryAcquire()) {
      return Promise.resolve();
    }
    // Calculate how long until the next token is available
    const deficit = 1 - tokens;
    const waitMs = (deficit / refillRate) * 1000;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        refill();
        tokens -= 1;
        resolve();
      }, waitMs);
    });
  };

  return { tryAcquire, waitForToken };
}
