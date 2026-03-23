import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rateLimiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tryAcquire', () => {
    it('succeeds up to maxTokens times', () => {
      const limiter = createRateLimiter(3, 1);

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('fails when all tokens are exhausted', () => {
      const limiter = createRateLimiter(2, 1);

      limiter.tryAcquire();
      limiter.tryAcquire();

      expect(limiter.tryAcquire()).toBe(false);
    });

    it('refills tokens over time', () => {
      const limiter = createRateLimiter(2, 1); // 1 token per second

      // Exhaust all tokens
      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);

      // Advance 1 second — should refill 1 token
      vi.advanceTimersByTime(1000);
      expect(limiter.tryAcquire()).toBe(true);

      // Should be exhausted again
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('does not refill beyond maxTokens', () => {
      const limiter = createRateLimiter(2, 10); // 10 tokens/sec but max 2

      // Exhaust all
      limiter.tryAcquire();
      limiter.tryAcquire();

      // Advance 5 seconds — would generate 50 tokens, but capped at 2
      vi.advanceTimersByTime(5000);

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('refills fractional tokens proportionally', () => {
      const limiter = createRateLimiter(5, 2); // 2 tokens per second

      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);

      // Advance 500ms — should refill 1 token (2 * 0.5)
      vi.advanceTimersByTime(500);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe('waitForToken', () => {
    it('resolves immediately when tokens are available', async () => {
      const limiter = createRateLimiter(1, 1);

      const promise = limiter.waitForToken();
      // Should resolve without needing to advance timers
      await expect(promise).resolves.toBeUndefined();
    });

    it('resolves after refill when no tokens available', async () => {
      const limiter = createRateLimiter(1, 1); // 1 token/sec

      // Exhaust the token
      limiter.tryAcquire();

      let resolved = false;
      const promise = limiter.waitForToken().then(() => {
        resolved = true;
      });

      // Should not have resolved yet
      expect(resolved).toBe(false);

      // Advance time enough for 1 token to refill
      vi.advanceTimersByTime(1100);
      await promise;

      expect(resolved).toBe(true);
    });

    it('handles concurrent waitForToken calls', async () => {
      const limiter = createRateLimiter(1, 1); // 1 token/sec

      // Exhaust the token
      limiter.tryAcquire();

      const results: number[] = [];

      const p1 = limiter.waitForToken().then(() => results.push(1));
      const p2 = limiter.waitForToken().then(() => results.push(2));

      // Advance enough for both to resolve
      vi.advanceTimersByTime(2100);

      await Promise.all([p1, p2]);

      expect(results).toHaveLength(2);
      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });
});
