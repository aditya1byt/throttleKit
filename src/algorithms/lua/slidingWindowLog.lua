-- Sliding Window Log Rate Limiter
--
-- WHY THIS IS ATOMIC:
--   ZREMRANGEBYSCORE, ZCARD, ZADD, and EXPIRE all execute inside one Lua
--   script. No other client can insert a request between the count check
--   and the add, so the limit is never exceeded.
--
-- HOW IT WORKS:
--   Every request timestamp is stored as an entry in a Redis sorted set
--   (score = timestamp). On each check, we remove entries older than
--   (now - window), count the remaining entries, and allow only if the
--   count is below the limit. This gives a true sliding window — no
--   boundary burst problem.
--
-- TRADE-OFF:
--   Memory grows linearly with request count (one entry per request),
--   unlike counter-based algorithms. Best suited for low-to-medium
--   rate limits (e.g., 5 login attempts / minute).
--
-- KEYS[1] = rate limit key (e.g., "rl:swl:192.168.1.1:/login")
-- ARGV[1] = limit  — max requests per window
-- ARGV[2] = window — window size in seconds
-- ARGV[3] = nowMs  — current timestamp in milliseconds (for precision + unique members)
--
-- RETURNS: {allowed (0|1), remaining, resetAt, retryAfterMs}

local key    = KEYS[1]
local limit  = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local nowMs  = tonumber(ARGV[3])
local now    = nowMs / 1000  -- seconds with ms precision

-- Remove all entries outside the current window
local windowStart = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count entries still in the window
local current = redis.call('ZCARD', key)

if current < limit then
  -- Add this request. Member must be unique within the set.
  -- nowMs gives ms precision; appending the current count handles the
  -- (astronomically rare) case of two Lua calls in the same millisecond.
  local member = tostring(nowMs) .. ':' .. tostring(current)
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, window + 1)

  local remaining = limit - current - 1

  -- resetAt: when does the oldest entry in the set fall out of the window?
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = math.ceil(now + window)
  if #oldest >= 2 then
    resetAt = math.ceil(tonumber(oldest[2]) + window)
  end

  return {1, remaining, resetAt, 0}
else
  redis.call('EXPIRE', key, window + 1)

  -- When will the oldest entry expire, freeing a slot?
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt      = math.ceil(now + window)
  local retryAfterMs = window * 1000
  if #oldest >= 2 then
    local oldestTime = tonumber(oldest[2])
    resetAt      = math.ceil(oldestTime + window)
    retryAfterMs = math.max(1, math.ceil((oldestTime + window - now) * 1000))
  end

  return {0, 0, resetAt, retryAfterMs}
end
