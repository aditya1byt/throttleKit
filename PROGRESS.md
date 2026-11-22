# ThrottleKit — Progress Tracker

## Current Phase: 1 (Complete — awaiting your review)
**Status**: Repo scaffold, tooling, docker-compose, fixed window algorithm — all built and passing tsc + eslint. Tests need Redis (docker compose up).

## Completed
- [x] Phase 1: Repo scaffold, TypeScript/ESLint/Prettier/Vitest, docker-compose, fixed window Lua + tests

## Phase Plan
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Repo scaffold, tooling, docker-compose, fixed window + tests | ✅ Complete |
| 2 | Token bucket + both sliding window algorithms + tests | ⬜ Not Started |
| 3 | Express middleware, rules loader (Zod), headers, fail modes | ⬜ Not Started |
| 4 | Concurrency tests (1000 parallel, assert exactly 100 pass) | ⬜ Not Started |
| 5 | Service mode HTTP API, Dockerfile, docker-compose, CI | ⬜ Not Started |
| 6 | k6 load tests, benchmark comparison table | ⬜ Not Started |
| 7 | Dashboard (Next.js + Socket.io + Recharts) | ⬜ Not Started |
| 8 | README, architecture diagram, interview notes | ⬜ Not Started |

## Next Step
- Phase 2: Implement tokenBucket, slidingWindowLog, slidingWindowCounter — each with Lua script + TS wrapper + integration tests
