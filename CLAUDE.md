# ThrottleKit — Project Context

## What is this?
A Redis-backed rate limiting toolkit with two usage modes:
1. **Library mode** — Express middleware (`app.use(throttle({...}))`)
2. **Service mode** — Standalone HTTP service (`POST /check`)

## Tech Stack
- TypeScript (strict, ESM) on Node.js 20+
- Redis + ioredis, atomic logic via Lua scripts
- Express.js, Zod, Vitest, ESLint + Prettier
- Docker Compose, GitHub Actions CI, k6 load testing
- Dashboard: Next.js + Tailwind + Socket.io + Recharts

## Architecture
- `src/types.ts` — Core `RateLimiter` interface and `RateLimitResult` type
- `src/redis.ts` — Redis client factory (injectable for testing)
- `src/algorithms/` — Each algorithm has a `.lua` script + `.ts` wrapper
- `src/middleware/` — Express middleware (Phase 3)
- `src/service/` — HTTP service mode (Phase 5)
- `tests/` — Vitest integration tests against real Redis

## Key Design Decisions
- **Lua scripts for atomicity** — All check-and-update ops are a single Redis call
- **Dependency injection** — Redis client is injected, never imported globally
- **Interface-first** — All algorithms implement `RateLimiter` so they're swappable
- **ESM** — `"type": "module"` throughout

## Token Discipline
- At session start, read only `CLAUDE.md` and `PROGRESS.md`
- Never scan the whole repo; open only files needed for the current task
- Before ending any session, update `PROGRESS.md`

## Commands
- `pnpm test` — Run Vitest (requires Redis on localhost:6379)
- `pnpm lint` — ESLint
- `pnpm format` — Prettier
- `docker compose up -d redis` — Start Redis for local dev
