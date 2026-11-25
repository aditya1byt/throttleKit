/**
 * Result returned by every rate limiter algorithm after a check.
 * These fields map directly to the standard rate-limit response headers.
 */
export interface RateLimitResult {
  /** Whether this request is allowed through */
  allowed: boolean;
  /** The configured maximum requests per window */
  limit: number;
  /** How many requests remain in the current window */
  remaining: number;
  /** Unix epoch (seconds) when the current window resets */
  resetAt: number;
  /** Milliseconds until the client should retry; 0 if allowed */
  retryAfterMs: number;
}

/** Supported algorithm identifiers */
export type AlgorithmName =
  'fixedWindow' | 'slidingWindowLog' | 'slidingWindowCounter' | 'tokenBucket';

/**
 * Common interface every rate limiter algorithm must implement.
 *
 * Design rationale: a uniform interface lets the middleware and service mode
 * swap algorithms without changing any calling code. The Redis client is
 * injected via the constructor (not imported), so tests can pass a real or
 * mocked client.
 */
export interface RateLimiter {
  /** Which algorithm this instance uses */
  readonly algorithm: AlgorithmName;

  /**
   * Atomically check and update the rate limit for a given key.
   * @param key - Unique identifier (e.g., IP, API key, user ID)
   * @param limit - Maximum allowed requests per window
   * @param windowSeconds - Window duration in seconds
   */
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;

  /**
   * Reset (delete) all rate-limit state for a key.
   * Useful for admin overrides or testing.
   */
  reset(key: string): Promise<void>;
}
