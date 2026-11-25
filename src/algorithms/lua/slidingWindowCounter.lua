-- Sliding Window Counter Rate Limiter
--
-- WHY THIS IS ATOMIC:
--   Both GET calls, the weighted calculation, and the conditional INCR
--   all run inside one Lua script. No interleaving possible.
--
-- HOW IT WORKS:
--   Combines the efficiency of fixed-window counters with the accuracy
--   of a sliding window. It keeps counters for the current and previous
--   fixed windows, then computes a weighted count:
--
--     weighted = previousCount × (1 - elapsedFraction) + currentCount
--
--   where elapsedFraction = how far into the current window we are.
--   This approximates a true sliding window without storing individual
--   request timestamps, using O(1) memory.
--
-- TRADE-OFF:
--   Not perfectly accurate — it assumes requests in the previous window
--   were evenly distributed. In practice, the error is small and this
--   is the most popular algorithm in production rate limiters (Cloudflare,
--   Stripe, etc.).
--
-- KEYS[1] = base key prefix (e.g., "rl:swc:192.168.1.1:/api")
-- ARGV[1] = limit  — max requests per window
-- ARGV[2] = window — window size in seconds
-- ARGV[3] = now    — current Unix timestamp in seconds
--
-- RETURNS: {allowed (0|1), remaining, resetAt, retryAfterMs}

local key    = KEYS[1]
local limit  = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])

-- Identify current and previous fixed windows
local currentStart  = now - (now % window)
local previousStart = currentStart - window

local currentKey  = key .. ':' .. currentStart
local previousKey = key .. ':' .. previousStart

-- Get counters (nil → 0 for non-existent keys)
local currentCount  = tonumber(redis.call('GET', currentKey)) or 0
local previousCount = tonumber(redis.call('GET', previousKey)) or 0

-- How far into the current window are we? (0.0 → 1.0)
local elapsed  = now - currentStart
local weight   = 1 - (elapsed / window)

-- Weighted estimate of requests in the sliding window
local weighted = previousCount * weight + currentCount

local resetAt = currentStart + window

if weighted < limit then
  -- Allowed: increment the current window counter
  local newCount = redis.call('INCR', currentKey)
  -- Set TTL on first increment; 2× window so the key survives long
  -- enough to be the "previous" window for the next period
  if newCount == 1 then
    redis.call('EXPIRE', currentKey, window * 2 + 1)
  end

  local newWeighted = previousCount * weight + newCount
  local remaining   = math.max(0, math.floor(limit - newWeighted))

  return {1, remaining, resetAt, 0}
else
  -- Denied
  local retryAfterMs = math.max(1, math.ceil((resetAt - now) * 1000))
  return {0, 0, resetAt, retryAfterMs}
end
