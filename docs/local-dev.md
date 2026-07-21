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
