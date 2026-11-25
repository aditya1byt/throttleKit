import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Redis } from 'ioredis';
import { SlidingWindowLogLimiter } from '../../src/algorithms/slidingWindowLog.js';
import { createTestRedis, cleanRateLimitKeys } from '../setup.js';

describe('SlidingWindowLogLimiter', () => {
  let redis: InstanceType<typeof Redis>;
  let limiter: SlidingWindowLogLimiter;

  beforeAll(async () => {
    redis = createTestRedis();
    await redis.connect();
    limiter = new SlidingWindowLogLimiter(redis);
  });

  afterEach(async () => {
    await cleanRateLimitKeys(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should allow requests under the limit', async () => {
    const result = await limiter.check('swl:under', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.retryAfterMs).toBe(0);
  });

  it('should track remaining count correctly', async () => {
    const key = 'swl:track';

    await limiter.check(key, 5, 60);
    await limiter.check(key, 5, 60);
    const result = await limiter.check(key, 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - 3
  });

  it('should deny requests over the limit', async () => {
    const key = 'swl:over';

    for (let i = 0; i < 5; i++) {
      const r = await limiter.check(key, 5, 60);
      expect(r.allowed).toBe(true);
    }

    const denied = await limiter.check(key, 5, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('should slide the window — old entries expire', async () => {
    const key = 'swl:slide';
    const windowSeconds = 1;

    // Fill up the window
    for (let i = 0; i < 3; i++) {
      await limiter.check(key, 3, windowSeconds);
    }
    const denied = await limiter.check(key, 3, windowSeconds);
    expect(denied.allowed).toBe(false);

    // Wait for entries to fall out of the window
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should be allowed again
    const result = await limiter.check(key, 3, windowSeconds);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should use separate logs for different keys', async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check('swl:keyA', 3, 60);
    }
    const deniedA = await limiter.check('swl:keyA', 3, 60);
    expect(deniedA.allowed).toBe(false);

    const allowedB = await limiter.check('swl:keyB', 3, 60);
    expect(allowedB.allowed).toBe(true);
  });

  it('should reset entries for a key', async () => {
    const key = 'swl:reset';

    await limiter.check(key, 5, 60);
    await limiter.check(key, 5, 60);

    await limiter.reset(key);

    const result = await limiter.check(key, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should return retryAfterMs pointing to oldest entry expiry', async () => {
    const key = 'swl:retry';

    await limiter.check(key, 1, 60);
    const denied = await limiter.check(key, 1, 60);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
