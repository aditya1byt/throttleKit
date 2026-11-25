// Public API — what consumers import from 'throttle-kit'
export type { RateLimiter, RateLimitResult, AlgorithmName } from './types.js';

export { createRedisClient } from './redis.js';
export type { RedisClient } from './redis.js';

export {
  FixedWindowLimiter,
  TokenBucketLimiter,
  SlidingWindowLogLimiter,
  SlidingWindowCounterLimiter,
} from './algorithms/index.js';
