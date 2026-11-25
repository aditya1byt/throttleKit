# ThrottleKit — Progress Tracker

## Current Phase: 2 (Complete — awaiting your review)
**Status**: Token Bucket, Sliding Window Log, and Sliding Window Counter implemented with atomic Lua scripts, TypeScript wrappers, and full test suites. All 29 tests passing against real Redis.

## Completed
- [x] Phase 1: Repo scaffold, TypeScript/ESLint/Prettier/Vitest, docker-compose, fixed window Lua + tests
- [x] Phase 2: Token bucket + both sliding window algorithms + tests

## Phase Plan
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Repo scaffold, tooling, docker-compose, fixed window + tests | ✅ Complete |
| 2 | Token bucket + both sliding window algorithms + tests | ✅ Complete |
| 3 | Express middleware, rules loader (Zod), headers, fail modes | ⬜ Not Started |
| 4 | Concurrency tests (1000 parallel, assert exactly 100 pass) | ⬜ Not Started |
| 5 | Service mode HTTP API, Dockerfile, docker-compose, CI | ⬜ Not Started |
| 6 | k6 load tests, benchmark comparison table | ⬜ Not Started |
| 7 | Dashboard (Next.js + Socket.io + Recharts) | ⬜ Not Started |
| 8 | README, architecture diagram, interview notes | ⬜ Not Started |

## Next Step
- Phase 3: Implement Express middleware (`throttle({...})`), rules configuration loader with Zod validation, standard HTTP response headers (429, Retry-After, X-RateLimit-*), and fail-open / fail-closed modes.
