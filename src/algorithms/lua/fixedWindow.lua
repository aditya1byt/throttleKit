-- Fixed Window Rate Limiter
--
-- WHY THIS IS ATOMIC:
--   Redis executes the entire Lua script as a single command. No other
--   client can run commands between the INCR and EXPIRE calls below.
--   This prevents the race condition where two concurrent requests both
--   read the same counter value and both think they're under the limit.
--
-- KEYS[1] = base key prefix (e.g., "rl:fw:192.168.1.1:/login")
-- ARGV[1] = limit — max allowed requests per window
-- ARGV[2] = window — window size in seconds
-- ARGV[3] = now   — current Unix timestamp in seconds (passed from app
--                    for determinism; avoids redis.call('TIME') which is
--                    non-deterministic and can break replication)
--
-- RETURNS: {allowed (0|1), remaining, resetAt, retryAfterMs}

local key    = KEYS[1]
local limit  = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])

-- Compute which fixed window we're in
local windowStart = now - (now % window)
local windowKey   = key .. ':' .. windowStart

-- Atomically increment; first call creates the key with value 1
local current = redis.call('INCR', windowKey)

-- Set expiry only on first request in this window.
-- +1 second buffer so the key outlives the window slightly,
-- preventing edge-case misses right at the boundary.
if current == 1 then
  redis.call('EXPIRE', windowKey, window + 1)
end

local resetAt = windowStart + window

if current <= limit then
  -- Allowed
  return {1, limit - current, resetAt, 0}
else
  -- Denied
  local retryAfterMs = (resetAt - now) * 1000
  return {0, 0, resetAt, retryAfterMs}
end
