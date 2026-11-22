import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Redis } from 'ioredis';
import { FixedWindowLimiter } from '../../src/algorithms/fixedWindow.js';
import { createTestRedis, cleanRateLimitKeys } from '../setup.js';

describe('FixedWindowLimiter', () => {
  let redis: InstanceType<typeof Redis>;
  let limiter: FixedWindowLimiter;

  beforeAll(async () => {
    redis = createTestRedis();
    await redis.connect();
    limiter = new FixedWindowLimiter(redis);
  });

  afterEach(async () => {
    await cleanRateLimitKeys(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should allow requests under the limit', async () => {
    const result = await limiter.check('test:under', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 limit - 1 used
    expect(result.limit).toBe(5);
    expect(result.retryAfterMs).toBe(0);
  });

  it('should track remaining count correctly', async () => {
    // Send 3 requests
    await limiter.check('test:track', 5, 60);
    await limiter.check('test:track', 5, 60);
    const result = await limiter.check('test:track', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - 3 = 2
  });

  it('should deny requests over the limit', async () => {
    const key = 'test:over';

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      const r = await limiter.check(key, 5, 60);
      expect(r.allowed).toBe(true);
    }

    // 6th request should be denied
    const denied = await limiter.check(key, 5, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('should return proper resetAt timestamp', async () => {
    const result = await limiter.check('test:reset', 5, 60);
    const now = Math.floor(Date.now() / 1000);

    // resetAt should be within the next 60 seconds
    expect(result.resetAt).toBeGreaterThan(now - 1);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60);
  });

  it('should use separate counters for different keys', async () => {
    // Exhaust key A
    for (let i = 0; i < 3; i++) {
      await limiter.check('test:keyA', 3, 60);
    }
    const deniedA = await limiter.check('test:keyA', 3, 60);
    expect(deniedA.allowed).toBe(false);

    // Key B should still be allowed
    const allowedB = await limiter.check('test:keyB', 3, 60);
    expect(allowedB.allowed).toBe(true);
    expect(allowedB.remaining).toBe(2);
  });

  it('should reset counters for a specific key', async () => {
    const key = 'test:resetable';

    // Use up some limit
    await limiter.check(key, 5, 60);
    await limiter.check(key, 5, 60);

    // Reset
    await limiter.reset(key);

    // Should be fresh
    const result = await limiter.check(key, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should reset the window after it expires', async () => {
    const key = 'test:expire';
    // Use a 1-second window so we can wait for it to expire
    const windowSeconds = 1;

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      await limiter.check(key, 3, windowSeconds);
    }
    const denied = await limiter.check(key, 3, windowSeconds);
    expect(denied.allowed).toBe(false);

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should be allowed again in the new window
    const result = await limiter.check(key, 3, windowSeconds);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should return retryAfterMs > 0 when denied', async () => {
    const key = 'test:retry';

    // Exhaust
    await limiter.check(key, 1, 60);

    // Denied
    const denied = await limiter.check(key, 1, 60);
    expect(denied.allowed).toBe(false);
    // Should tell client to wait until window resets (up to 60s = 60000ms)
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
