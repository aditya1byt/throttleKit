-- Token Bucket Rate Limiter
--
-- WHY THIS IS ATOMIC:
--   The entire read → refill → check → update cycle runs in one Lua
--   script. Redis blocks all other commands until it finishes, so no
--   other client can see a half-updated bucket.
--
-- HOW IT WORKS:
--   A bucket starts full at `capacity` tokens. Each request consumes 1
--   token. Tokens refill at a steady rate (capacity / window) per second.
--   Unlike fixed windows, this allows smooth bursting up to `capacity`
--   while enforcing a long-term average rate.
--
-- KEYS[1] = rate limit key (e.g., "rl:tb:192.168.1.1:/api")
-- ARGV[1] = capacity  — max tokens (= limit)
-- ARGV[2] = refillRate — tokens added per second (= limit / windowSeconds)
-- ARGV[3] = now       — current timestamp in seconds (fractional, from Date.now()/1000)
-- ARGV[4] = window    — window in seconds (used only for key TTL)
--
-- RETURNS: {allowed (0|1), remaining, resetAt, retryAfterMs}

local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local window     = tonumber(ARGV[4])

-- Read stored state; nil on first request
local data       = redis.call('HMGET', key, 'tokens', 'ts')
local tokens     = tonumber(data[1])
local lastRefill = tonumber(data[2])

-- First request: bucket starts full
if tokens == nil then
  tokens     = capacity
  lastRefill = now
end

-- Refill: add tokens proportional to elapsed time, capped at capacity
local elapsed = math.max(0, now - lastRefill)
tokens        = math.min(capacity, tokens + elapsed * refillRate)
lastRefill    = now

if tokens >= 1 then
  -- Consume one token
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'ts', lastRefill)
  redis.call('EXPIRE', key, window * 2)

  local remaining = math.floor(tokens)
  -- resetAt = when the bucket will be fully replenished
  local resetAt   = math.ceil(now + (capacity - tokens) / refillRate)

  return {1, remaining, resetAt, 0}
else
  -- No tokens available
  redis.call('HMSET', key, 'tokens', tokens, 'ts', lastRefill)
  redis.call('EXPIRE', key, window * 2)

  -- How long until 1 token is available?
  local deficit      = 1 - tokens
  local retryAfterMs = math.ceil(deficit / refillRate * 1000)
  local resetAt      = math.ceil(now + capacity / refillRate)

  return {0, 0, resetAt, retryAfterMs}
end
