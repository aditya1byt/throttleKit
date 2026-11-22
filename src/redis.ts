import { Redis } from 'ioredis';

/**
 * Re-export so consumers depend on our type, not ioredis directly.
 * This makes it easier to swap the Redis client in tests or if we
 * ever migrate away from ioredis.
 */
export type RedisClient = Redis;

/**
 * Factory function for creating Redis connections.
 *
 * Why a factory instead of a singleton?
 * - Tests create isolated clients per test suite
 * - Service mode and library mode may need different configs
 * - Avoids hidden global state (important for clean architecture)
 *
 * @param url - Redis connection URL, defaults to localhost
 */
export function createRedisClient(url?: string): RedisClient {
  return new Redis(url ?? 'redis://localhost:6379', {
    // Don't retry forever if Redis is down — let the caller handle it
    maxRetriesPerRequest: 3,
    // Disable offline queue so commands fail fast when disconnected
    enableOfflineQueue: false,
  });
}
