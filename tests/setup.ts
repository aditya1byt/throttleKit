import { Redis } from 'ioredis';

/**
 * Shared test utilities.
 *
 * Each test file creates its own Redis connection (not shared) so
 * test suites are independent. We provide a helper that creates a
 * client and cleans up rate-limit keys after each test.
 */
export function createTestRedis(): InstanceType<typeof Redis> {
  return new Redis('redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    // lazyConnect: true so we control when connection happens
    lazyConnect: true,
  });
}

/**
 * Flush only rate-limit keys (prefixed with "rl:") to avoid
 * nuking unrelated Redis data during development.
 */
export async function cleanRateLimitKeys(redis: InstanceType<typeof Redis>): Promise<void> {
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
