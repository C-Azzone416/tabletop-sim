# Local Development Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 18 via Homebrew (`brew install postgresql@18`)
- Postgres is **not** set to auto-start — you control it manually

## First-time setup

```bash
# 1. Create the local database and run migrations
createdb tabletop
psql -d tabletop -f db/migrations/001_initial_schema.sql
psql -d tabletop -f db/migrations/002_mission1_updates.sql
psql -d tabletop -f db/migrations/003_player_profiles.sql
psql -d tabletop -f db/migrations/004_multi_color_mission.sql

# 2. Create the server env file
echo 'DATABASE_URL=postgresql://localhost/tabletop\nPORT=3001' > packages/server/.env

# 3. Install dependencies
npm install
```

> **Note:** `packages/server/.env` is gitignored — each developer sets it up once locally.

## Pre-launch access gate (#252)

The server rejects requests that don't carry a shared secret, and restricts profile creation to an invite allow-list — see `docs/access-control.md` for the full design. Both are **off by default in local dev**: leave `API_ACCESS_KEY` / `PROFILE_ALLOWLIST` unset in `packages/server/.env` and the app behaves exactly as before, no extra setup needed.

To exercise the gate locally (e.g. testing the sign-in flow against it), set matching values on both sides:

```bash
# packages/server/.env
API_ACCESS_KEY=dev-local-key
PROFILE_ALLOWLIST=Dev,Alice,Bob,Carol

# packages/client/.env.local
NEXT_PUBLIC_API_ACCESS_KEY=dev-local-key
```

`/dev/*` routes are still separately gated by `ENABLE_DEV_SEED` — the dev-seed profiles (Dev/Alice/Bob/Carol) are created directly against the database and never go through `POST /profiles`, so they're unaffected by `PROFILE_ALLOWLIST` either way. Only sign-in (`POST /profiles`, via `auth.ts`) checks the allow-list.

**In production, both are required** — `buildApp()` refuses to start without them when `NODE_ENV=production`.

## Starting the dev environment

```bash
npm run dev:up
```

This starts PostgreSQL (without registering it to auto-start) and then starts both the Next.js client (port 3000) and Fastify server (port 3001).

## Stopping the dev environment

```bash
npm run dev:down
```

This kills the client and server processes and stops PostgreSQL. Nothing runs in the background after this.

## Quick game test

Once the dev environment is running, visit:

```
http://localhost:3000/dev
```

This seeds a game, signs you in as "Dev", and redirects straight to an active game — no sign-in form or lobby needed.

## Running tests

```bash
# All tests
npm test

# Server tests only
npm test -w packages/server

# Client tests only
npm test -w packages/client
```

## Running the E2E suite locally (#261)

```bash
npm run build -w packages/shared
npm run build -w packages/server
npm run build -w packages/client   # NEXT_PUBLIC_* flags are baked in here, not read at runtime
npm test -w packages/client -- --run  # unit tests, not E2E — see below for Playwright

cd packages/client
DATABASE_URL=postgresql://localhost/tabletop \
ENABLE_DEV_SEED=true \
CI=1 \
npx playwright test
```

`playwright.config.ts` always starts its own server + client processes — it never reuses whatever is already listening on 3000/3001 (fixed by #261; that used to be silent, shared-machine-hostile behavior). **This means two agents/sessions can't both run the suite against the default ports at the same time** — the second one will fail loudly with a port-already-in-use error from the process it tries to start, not a confusing empty game lobby.

To run concurrently, give each session its own ports — both the client's and server's actual listening port are derived from these two URLs, not hardcoded, so this is enough on its own:

```bash
E2E_BASE_URL=http://localhost:3011 \
E2E_API_URL=http://localhost:3012 \
DATABASE_URL=postgresql://localhost/tabletop \
ENABLE_DEV_SEED=true \
CI=1 \
npx playwright test
```

`CI=1` isn't required (CI already sets it) but is worth setting locally too — it also tightens `retries`/`forbidOnly`, closer to what actually runs in the pipeline. If you need `AUTH_SECRET`/`AUTH_TRUST_HOST` for a build that exercises real sign-in, set those alongside `NEXT_PUBLIC_SERVER_URL` in `packages/client/.env.local` **before** the `npm run build -w packages/client` step above — `NEXT_PUBLIC_*` values are compiled in, so a stale build with the wrong baked-in server URL silently talks to the wrong server no matter what env vars you set afterward.

## Adding a new migration

1. Create `db/migrations/00N_description.sql`
2. Apply locally: `psql -d tabletop -f db/migrations/00N_description.sql`
3. Commit the file — CI checks that all migrations are present

## Ports

| Service | Port |
|---------|------|
| Next.js client | 3000 |
| Fastify server | 3001 |
| PostgreSQL | 5432 |

## Vercel: Preview Comments disabled (#284)

The **Vercel Toolbar / Comments** setting for this project (Project Settings → General → Vercel Toolbar) has **Preview = Off**, deliberately, as of #284 (2026-08-29). Production is left at its default (Comments never auto-patches there, per #284's own findings — see the issue for the full evidence trail).

Why: Next 16.3.x's immutable static file upload conflicts with Vercel's automatic preview-comment patch step, which runs on every Preview deployment by default. With it on, every Preview deploy for this project failed outright with `Cannot patch preview comments when immutable static file upload is enabled`. There's no committable fix — this isn't controlled by `vercel.json`, an env var, or anything else in-repo; it's a dashboard-only project setting. If you're bootstrapping a **new** Vercel project for this repo (e.g. after a fork), you'll need to flip this off by hand or Preview deployments will fail the same way.
