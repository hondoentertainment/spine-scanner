import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, sleep } from '../syncRetry';

describe('sleep', () => {
  it('is exported and resolves after the given delay', async () => {
    vi.useFakeTimers();
    const p = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the first attempt when fn succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxAttempts on repeated failure then rethrows', async () => {
    const err = new Error('boom');
    const fn = vi.fn().mockRejectedValue(err);

    // Attach catch BEFORE running timers to prevent unhandled rejection
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    const guarded = promise.catch((e: unknown) => e);
    // Advance through all backoff delays (100ms, 200ms)
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('boom');
    await guarded;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error after all attempts are exhausted', async () => {
    const err = new Error('final error');
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 });
    const guarded = promise.catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBe(err);
    await guarded;
  });

  it('succeeds on a later attempt after initial failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxAttempts: 4, baseDelayMs: 100 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('delays double each attempt (exponential backoff)', async () => {
    // Spy on sleep by intercepting setTimeout through fake timers
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (typeof delay === 'number') delays.push(delay);
      return originalSetTimeout(fn, 0, ...args);
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, { maxAttempts: 4, baseDelayMs: 1000 });
    // Attach catch before running timers to prevent unhandled rejection
    const guarded = promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    await guarded;

    // Restore
    vi.restoreAllMocks();

    // 3 sleeps for 4 attempts: 1000, 2000, 4000
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('caps delay at 30 seconds', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (typeof delay === 'number') delays.push(delay);
      return originalSetTimeout(fn, 0, ...args);
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // baseDelayMs=20000, attempts=4 → 20000, 40000→cap30000, 80000→cap30000
    const promise = withRetry(fn, { maxAttempts: 4, baseDelayMs: 20000 });
    // Attach catch before running timers to prevent unhandled rejection
    const guarded = promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    await guarded;

    vi.restoreAllMocks();

    expect(delays[0]).toBe(20000);
    expect(delays[1]).toBe(30000);
    expect(delays[2]).toBe(30000);
  });
});
