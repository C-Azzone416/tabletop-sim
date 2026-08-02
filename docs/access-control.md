# Access Control Matrix

Every externally-reachable surface in this application and its current auth requirement, verified directly against the implementation on `develop` (HEAD includes #217/#218/#219, #252). This matrix records what the code currently does — it does not describe intended behavior that isn't actually implemented. Any surface found not to match its intended auth level is filed as its own issue, not noted here as a caveat.

Re-derived from scratch for #186 after the original draft was lost to channel auto-pruning (unprotected work channels are not durable storage — security artifacts belong in the repo, a PR, or an issue).

## Pre-launch access gate (#252)

Before #252, `POST /profiles` — the credential-issuance step everything else in this matrix sits downstream of — was reachable by anyone with the URL, unauthenticated, find-or-create by name. Two independent mechanisms now sit in front of the whole API surface, per Caroline's standing pre-launch requirement:

1. **Shared-secret header (`API_ACCESS_KEY`)** — a global `preHandler` hook in `app.ts` rejects any request that doesn't carry the configured secret, before it reaches route logic. Accepted as the `x-api-key` header (plain HTTP) or an `apiKey` query param (the WS upgrade — browsers can't set custom headers on that handshake, so it rides the URL the same way `profileId`/`name` already do). `/health` and `/healthz` stay reachable unauthenticated (liveness probes).
2. **Invite allow-list (`PROFILE_ALLOWLIST`)** — `POST /profiles` checks the requested name against a configured allow-list *before* either branch of find-or-create, so an uninvited caller can neither mint a new profile nor be handed back an existing one by posting its name.

**Why both, not just the secret:** the secret is one deploy-wide value — everyone who has it (anyone with the URL, since it ships in the client bundle) can call `POST /profiles` with any name. Without the allow-list, that's still open name-based identity assumption once the secret is known; the secret alone does not close the name-collision path #252 was filed over. The two are independent and both required.

**Configuration is fail-open in dev, fail-closed in production:** if either env var is unset, `buildApp()` disables the corresponding gate — this keeps local dev and the test suite running without extra setup. If `NODE_ENV=production` and either is unset, `buildApp()` throws at startup rather than serving unprotected. Both are plain env vars, never committed (see `docs/local-dev.md` for the dev-path defaults and `.env.example`).

**What this does not do:** neither mechanism authenticates an individual person — the allow-list is a name check, not identity verification, and two people who both know an allow-listed name can still both claim it (the same structural limitation `ws/auth.ts` already documents: "will be upgraded to JWT verification when Auth.js shares its secret"). It only prevents an uninvited caller with just the URL from minting or claiming a profile at all.

**Enumeration rate limit (#264):** `POST /profiles`' three distinct status codes (200 existing / 201 created / 403 not-allow-listed) are a status-code oracle for `PROFILE_ALLOWLIST` membership, reachable by anyone who already holds the shared secret. A per-IP fixed-window limiter (`PROFILES_RATE_LIMIT_MAX`/`PROFILES_RATE_LIMIT_WINDOW_MS`, default 20/minute) sits in front of the route as its own `preHandler` — checked before the handler reads the request body at all, so the limiter itself can never become a second oracle keyed on which name was being probed. `request.ip` requires `trustProxy: 1` on the Fastify instance (numeric — trust exactly one hop) to resolve to something the caller can't fully forge; `trustProxy: true` shipped first and was wrong (#279 — trusts the whole X-Forwarded-For chain and reads the attacker-controlled leftmost entry, so the limiter didn't limit anyone who changed the header). See the comment on `buildApp()`'s Fastify constructor for the still-open question of whether 1 is exactly the right hop count against Render's real edge topology.

## HTTP routes (`packages/server/src/app.ts`)

Every row below is also behind the shared-secret gate described above (except `/health`/`/healthz`); it's omitted from each row's "Auth" column to avoid repeating it 8 times, but it is enforced first, on every request.

| Method + path | Auth | Notes |
|---|---|---|
| `GET /health`, `GET /healthz` | None (intentional) | Liveness probes, no sensitive data. Also the only routes exempt from the shared-secret gate. |
| `POST /games` | None | Stubbed, always 501 — games are actually created over WS (`create_game`) |
| `POST /profiles` | **Invite allow-list** (`PROFILE_ALLOWLIST`, #252) | Find-or-create by name, restricted to allow-listed names; this *is* the credential-issuance step — returns `{id, name}` used as the credential thereafter |
| `GET /profiles/:id` | **Required** — `authenticateProfile(profileId, name)`, then 403 unless `user.profileId === params.id` | Own-profile-only (#194/#204) |
| `GET /profiles/:id/mission-outcomes` | **Required** — `authenticateProfile(profileId, name)`, then 403 unless `user.profileId === params.id` | Own-profile-only (#222/#224), same pattern as `/profiles/:id` — closes the mission-history-leak composition #194's neighboring fix called out but hadn't itself closed. |
| `GET /games/:joinCode` | **Required** — `authenticateProfile`, then 403 unless requester's profileId is seated in that game | Returns game state + all seated players' id/name/seatOrder (#194/#204) |
| `GET /ws` (upgrade) | **Required** — `authenticateUpgrade(request)`; closes 4001 if unauthenticated | Gates all further WS traffic on this connection |
| `POST /dev/*` (advance-turn, seed, seed-near-win, seed-solo-cut-legal, cleanup, reveal-all-tokens, hide-dev-tokens) | **Config-gated, not authenticated** — routes only registered when `ENABLE_DEV_SEED==='true' && NODE_ENV!=='production'` | No per-request credential on top; structurally absent in a correctly configured prod deploy |
| `GET /dev/migrations-status` | Config-gated, not authenticated | Same gate as above |

No server-side `/game/*` HTTP routes exist — the server only exposes `/games` (plural) and `/games/:joinCode`. The client's `/game/*` gating is a separate, client-side concern (see below).

## WebSocket messages (`packages/server/src/ws/message-handler.ts`, `engine/game-engine.ts`)

Every message resolves `playerId`/`gameId` from the server-tracked socket→connection binding (set only by the server at `create_game`/`join_game` time), not from client-supplied fields — this is the baseline sender-identity guarantee below.

| Message | Check | Notes |
|---|---|---|
| `create_game` | WS-upgrade auth (`getAuthenticatedUser`) | Binds new player to socket |
| `join_game` | WS-upgrade auth | Binds joining player to socket |
| `start_game` | `game.captainId === requestingPlayerId`; `assertMissionUnlocked` | Server-side mission-unlock enforcement (#206) |
| `next_mission` | `game.captainId === requestingPlayerId`; `assertMissionUnlocked` | Same server-side enforcement (#206) |
| `place_info_token` | Turn check + `wire.playerId === playerId` + wire hidden + blue-only for opening | |
| `propose_dual_cut` | Turn check + can't target own wire + must-hold-match | |
| `respond_dual_cut` | `wire.playerId === playerId` (only the targeted wire's owner may respond) | |
| `complete_dual_cut` | `game.pendingDualCutProposerId === playerId` + `ownWire.playerId === playerId` | |
| `solo_cut` | Turn check + must hold all remaining hidden wires in scope | Color-scoped for yellow, value-scoped for blue (#190 Phase B) |
| `double_detector` | Turn check + both target wires belong to `playerId` | Result sent only to the requesting socket |
| `reveal_reds` | Turn check + mission must have red wires | |
| `player_ready` | `game.status==='waiting'` only | Self-scoped by the bound playerId; no additional restriction needed |

**Hidden-wire redaction:** `buildPlayerView()` (`state-broadcaster.ts`) redacts both `value` and `color` to `null` for any wire where `wire.playerId !== requestingPlayerId && wire.status === 'hidden'` (#187/#192 — color redacted alongside value, since on red-wire missions the color map alone is mission-deciding information). This is the single choke point used by every broadcast path; confirmed no code path — including the #190 Phase A/B/C wire-semantics changes (#217/#219/#218) — constructs a message with raw wire data bypassing it. Revealed wires (`reveal_reds`, all-red-hand auto-reveal) are intentionally globally visible once `status` flips to `'revealed'` — that's correct per game rules, not a leak.

## Client-side route gates (`packages/client`)

| Page/route | Gate | Notes |
|---|---|---|
| `/game/:path*` | NextAuth middleware (`middleware.ts`) via a real `authorized()` callback requiring `auth?.user`, OR (dev-tools flag AND `profileId` param) | #193. Bare `auth` middleware without the `authorized()` callback is a documented no-op trap — confirmed this isn't the case here. |
| `/game/[joinCode]` page component | Re-checks `auth()` server-side; dev-param fallback requires `NEXT_PUBLIC_ENABLE_DEV_TOOLS==='true'` | Defense-in-depth alongside the middleware gate |
| `/dev` | `NEXT_PUBLIC_ENABLE_DEV_TOOLS==='true'` or `notFound()` | Build-flag only, matches server `/dev/*` philosophy |
| `/` (Home) | No route gate; renders signed-in/signed-out UI conditionally | Public landing page; actions (create/join) gated behind a session-derived identity, not the route itself |
| `/signin` | None (intentional) | Public entry point |

**Mission-unlock client gating (#209):** `highestUnlockedMission()` drives the mission picker UI in `Lobby.tsx`/`GameOverOverlay.tsx` — cosmetic only. The real backstop is server-side `assertMissionUnlocked()` (#206), enforced independently of what the client sends. Depends on `/profiles/:id/mission-outcomes`, now own-profile-gated (#222/#224).

## Summary

- Confirmed fixed and currently correct: #204 (`/profiles/:id`, `/games/:joinCode`), #222/#224 (`/profiles/:id/mission-outcomes`), #193 (`/game/*` client gate), #206 (server-side mission-unlock), #192 (hidden-wire color+value redaction, still unbroken by today's #190 wire-semantics work), #252 (shared-secret gate + invite allow-list close the previously-open `POST /profiles` credential-issuance step).
- Confirmed present but intentionally cosmetic: #209 (client-side mission-unlock picker), backstopped by #206.
- `/dev/*` (server + client): gated by build/deploy config only, not request-time authentication — acceptable given structural absence in production, stated explicitly rather than implying a request-level check exists. Also behind the #252 shared-secret gate when one is configured.
