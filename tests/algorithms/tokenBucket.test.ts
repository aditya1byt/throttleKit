import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Redis } from 'ioredis';
import { TokenBucketLimiter } from '../../src/algorithms/tokenBucket.js';
import { createTestRedis, cleanRateLimitKeys } from '../setup.js';

describe('TokenBucketLimiter', () => {
  let redis: InstanceType<typeof Redis>;
  let limiter: TokenBucketLimiter;

  beforeAll(async () => {
    redis = createTestRedis();
    await redis.connect();
    limiter = new TokenBucketLimiter(redis);
  });

  afterEach(async () => {
    await cleanRateLimitKeys(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should allow the first request (bucket starts full)', async () => {
    const result = await limiter.check('tb:first', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 - 1 consumed
    expect(result.limit).toBe(5);
    expect(result.retryAfterMs).toBe(0);
  });

  it('should allow requests up to the capacity', async () => {
    const key = 'tb:capacity';

    for (let i = 0; i < 5; i++) {
      const r = await limiter.check(key, 5, 60);
      expect(r.allowed).toBe(true);
    }
  });

  it('should deny when the bucket is empty', async () => {
    const key = 'tb:empty';

    // Drain the bucket
    for (let i = 0; i < 5; i++) {
      await limiter.check(key, 5, 60);
    }

    const denied = await limiter.check(key, 5, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('should refill tokens over time', async () => {
    const key = 'tb:refill';
    // Window = 5s, limit = 5 → refill rate = 1 token/sec

    // Drain the bucket
    for (let i = 0; i < 5; i++) {
      await limiter.check(key, 5, 5);
    }

    const denied = await limiter.check(key, 5, 5);
    expect(denied.allowed).toBe(false);

    // Wait 1.5 seconds → should have ~1 token refilled
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const after = await limiter.check(key, 5, 5);
    expect(after.allowed).toBe(true);
  });

  it('should use separate buckets for different keys', async () => {
    // Drain key A
    for (let i = 0; i < 3; i++) {
      await limiter.check('tb:keyA', 3, 60);
    }
    const deniedA = await limiter.check('tb:keyA', 3, 60);
    expect(deniedA.allowed).toBe(false);

    // Key B should be unaffected
    const allowedB = await limiter.check('tb:keyB', 3, 60);
    expect(allowedB.allowed).toBe(true);
  });

  it('should reset the bucket for a key', async () => {
    const key = 'tb:reset';

    // Use some tokens
    await limiter.check(key, 5, 60);
    await limiter.check(key, 5, 60);

    // Reset
    await limiter.reset(key);

    // Bucket should be full again
    const result = await limiter.check(key, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should return retryAfterMs when denied', async () => {
    const key = 'tb:retry';

    // Drain with a short window so retryAfter is small
    await limiter.check(key, 1, 10);
    const denied = await limiter.check(key, 1, 10);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    // With refill rate = 1/10 = 0.1 tokens/sec, need ~10s for 1 token
    expect(denied.retryAfterMs).toBeLessThanOrEqual(10_000);
  });
});
