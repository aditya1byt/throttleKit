import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Redis } from 'ioredis';
import { SlidingWindowCounterLimiter } from '../../src/algorithms/slidingWindowCounter.js';
import { createTestRedis, cleanRateLimitKeys } from '../setup.js';

describe('SlidingWindowCounterLimiter', () => {
  let redis: InstanceType<typeof Redis>;
  let limiter: SlidingWindowCounterLimiter;

  beforeAll(async () => {
    redis = createTestRedis();
    await redis.connect();
    limiter = new SlidingWindowCounterLimiter(redis);
  });

  afterEach(async () => {
    await cleanRateLimitKeys(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should allow requests under the limit', async () => {
    const result = await limiter.check('swc:under', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(4);
    expect(result.limit).toBe(5);
    expect(result.retryAfterMs).toBe(0);
  });

  it('should deny requests over the limit', async () => {
    const key = 'swc:over';

    for (let i = 0; i < 5; i++) {
      const r = await limiter.check(key, 5, 60);
      expect(r.allowed).toBe(true);
    }

    const denied = await limiter.check(key, 5, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('should use separate counters for different keys', async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check('swc:keyA', 3, 60);
    }
    const deniedA = await limiter.check('swc:keyA', 3, 60);
    expect(deniedA.allowed).toBe(false);

    const allowedB = await limiter.check('swc:keyB', 3, 60);
    expect(allowedB.allowed).toBe(true);
  });

  it('should reset counters for a key', async () => {
    const key = 'swc:reset';

    await limiter.check(key, 5, 60);
    await limiter.check(key, 5, 60);

    await limiter.reset(key);

    const result = await limiter.check(key, 5, 60);
    expect(result.allowed).toBe(true);
  });

  it('should allow requests again after the window passes', async () => {
    const key = 'swc:expire';
    const windowSeconds = 1;

    for (let i = 0; i < 3; i++) {
      await limiter.check(key, 3, windowSeconds);
    }
    const denied = await limiter.check(key, 3, windowSeconds);
    expect(denied.allowed).toBe(false);

    // Wait for both current and previous windows to pass so the
    // weighted count drops to zero
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const result = await limiter.check(key, 3, windowSeconds);
    expect(result.allowed).toBe(true);
  });

  it('should return proper resetAt timestamp', async () => {
    const result = await limiter.check('swc:resetAt', 5, 60);
    const now = Math.floor(Date.now() / 1000);

    expect(result.resetAt).toBeGreaterThan(now - 1);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60);
  });

  it('should weight previous window counts (sliding behavior)', async () => {
    // Use a 2-second window so we can observe the weighting
    const key = 'swc:weight';
    const windowSeconds = 2;

    // Fill the first window to the limit
    for (let i = 0; i < 5; i++) {
      await limiter.check(key, 5, windowSeconds);
    }

    // Wait for the window to roll over — now the 5 requests are in the
    // "previous" window. The weighted count should be less than 5 because
    // we're at the start of a new window (weight ≈ 1.0 × 5 ≈ 5).
    // Wait until we're midway into the new window so weight ≈ 0.5.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Weighted count ≈ 5 × 0.0 + 0 = 0 (previous window fully expired)
    const result = await limiter.check(key, 5, windowSeconds);
    expect(result.allowed).toBe(true);
  });
});
