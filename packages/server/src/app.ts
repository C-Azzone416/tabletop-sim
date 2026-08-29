import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as gamesDb from './db/games.js';
import * as playersDb from './db/players.js';
import * as profilesDb from './db/profiles.js';
import * as tokensDb from './db/tokens.js';
import * as wiresDb from './db/wires.js';
import { getMigrationsStatus } from './db/migrations.js';
import * as engine from './engine/game-engine.js';
import { handleMessage } from './ws/message-handler.js';
import { removeConnection, setAuthenticatedUser, registerConnection } from './ws/connection-manager.js';
import { authenticateUpgrade } from './ws/auth.js';
import { broadcastGameState } from './ws/state-broadcaster.js';

// #252 — pre-launch access gate. Two independent mechanisms, per Caroline's
// requirement: a shared secret alone would still let anyone holding it mint
// or claim any name, so the allow-list is not optional once the secret
// exists. Both read once at boot, not per-request. Unset (dev/test default)
// disables the corresponding gate entirely — see docs/local-dev.md. In
// production, unset is a startup failure rather than a silent open door.
function getAccessKey(): string | null {
  return process.env.API_ACCESS_KEY?.trim() || null;
}

function getProfileAllowlist(): Set<string> | null {
  const raw = process.env.PROFILE_ALLOWLIST;
  if (!raw) return null;
  const names = raw.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

// #259 — weasel's FINAL review of #252 flagged the naive `===` secret
// comparison as timing-leaky (short-circuits on the first differing byte).
// Hashing both sides to a fixed-size SHA-256 digest before comparing means
// timingSafeEqual is always called on two equal-length (32-byte) buffers —
// no length guard is needed at all, so there's nothing left to leak: unlike
// comparing the raw strings, this reveals nothing about the candidate's
// length OR content, only ever "matches" or "doesn't."
function secretsMatch(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

// #264 — POST /profiles has no request-cost check, so anyone already
// holding the #252 shared secret can enumerate PROFILE_ALLOWLIST membership
// (200/201 vs 403) at whatever speed the server allows. This route's blast
// radius is "which first names are invited," not game state — a lightweight
// self-contained limiter matches that severity; no new dependency for one
// low-risk route. Fixed-window per key, in-memory. Never pruned: bounded by
// the count of distinct callers this process ever sees, a non-issue at this
// project's scale (an invite-only game for a handful of people), and adding
// a sweep/interval would need its own shutdown handling for one Low-severity
// route.
function createRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, { count: number; windowStart: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

export async function buildApp() {
  const apiAccessKey = getAccessKey();
  const profileAllowlist = getProfileAllowlist();

  if (process.env.NODE_ENV === 'production') {
    if (!apiAccessKey) {
      throw new Error('API_ACCESS_KEY must be set in production — see docs/access-control.md (#252)');
    }
    if (!profileAllowlist) {
      throw new Error('PROFILE_ALLOWLIST must be set in production — see docs/access-control.md (#252)');
    }
  }

  // #264 — Render terminates TLS and proxies every request to this process,
  // so without this, `request.ip` resolves to Render's internal proxy
  // address for every request, not the real client — a per-IP rate limit
  // built on that would rate-limit "everyone" as a single client instead of
  // each caller individually.
  //
  // KNOWN ISSUE, NOT YET RESOLVED IN THIS PATCH: `trustProxy: true` (43ed460's
  // original value) trusts the ENTIRE X-Forwarded-For chain and reads the
  // FIRST (leftmost) entry — which is exactly the value a caller can supply
  // themselves. #279 (c3b0df6, not in #305's four-commit cherry-pick list)
  // fixes this to `trustProxy: 1`, confirmed live by toucan: with `true`, an
  // attacker can fully reset their own rate-limit quota by changing the
  // X-Forwarded-For header on each request, defeating #264 entirely. See the
  // PR description / #305 thread — this needs a decision on whether #279
  // should be a fifth cherry-pick before this patch is considered complete.
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.url'] }, trustProxy: true });

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000'];

  // Vercel's dashboard "Visit" button lands on the per-deployment preview URL
  // (hash rotates every deploy), not the stable branch alias in CORS_ORIGINS —
  // that's the natural-but-blocked click path (issue #121). Anchored on the
  // full origin including scheme, not a substring/includes() check, so an
  // attacker-registered lookalike project can't slip through. Confirmed
  // pattern from 4 real deployments (2026-07-22): `tabletop-<hash>-c-azzone416s-projects.vercel.app`
  // — note the prefix is `tabletop-`, not `tabletop-sim-` (project rename artifact).
  const VERCEL_PREVIEW_ORIGIN = /^https:\/\/tabletop-[a-z0-9]+-c-azzone416s-projects\.vercel\.app$/;
  // Same condition as every other /dev/* route gate — structurally impossible
  // to activate in production regardless of misconfiguration elsewhere.
  const allowVercelPreviews = process.env.ENABLE_DEV_SEED === 'true' && process.env.NODE_ENV !== 'production';

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      if (allowVercelPreviews && VERCEL_PREVIEW_ORIGIN.test(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // Shared-secret gate — the first of the two #252 mechanisms. Runs before
  // every route handler except the liveness probes. Accepts the secret as
  // either the `x-api-key` header (plain HTTP fetches) or an `apiKey` query
  // param (the WS upgrade — browsers can't set custom headers on that
  // handshake, so it rides the URL the same way profileId/name already do).
  app.addHook('preHandler', async (request, reply) => {
    if (!apiAccessKey) return;
    if (request.url.startsWith('/health')) return;
    const headerKey = request.headers['x-api-key'];
    const queryKey = (request.query as Record<string, unknown> | undefined)?.apiKey;
    const provided = typeof headerKey === 'string' ? headerKey : typeof queryKey === 'string' ? queryKey : null;
    if (provided === null || !secretsMatch(provided, apiAccessKey)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/games', async (request, reply) => {
    const { playerName } = request.body as { playerName: string };
    if (!playerName || typeof playerName !== 'string') {
      return reply.status(400).send({ error: 'playerName is required' });
    }
    return reply.status(501).send({ error: 'Use WebSocket to create games' });
  });

  // #264 — 20 requests/minute per IP by default, overridable via env for
  // whoever ends up tuning it against real traffic. Checked as its own
  // preHandler, before the route body below ever reads `name` or touches
  // profileAllowlist: whether a request gets 429'd depends only on how many
  // requests this IP has made, never on what name it sent, so the limiter
  // can't become a second oracle layered on top of the one #264 is about.
  const profilesRateLimitMax = Number(process.env.PROFILES_RATE_LIMIT_MAX ?? 20);
  const profilesRateLimitWindowMs = Number(process.env.PROFILES_RATE_LIMIT_WINDOW_MS ?? 60_000);
  const allowProfilesRequest = createRateLimiter(profilesRateLimitMax, profilesRateLimitWindowMs);

  app.post('/profiles', {
    preHandler: async (request, reply) => {
      if (!allowProfilesRequest(request.ip)) {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
  }, async (request, reply) => {
    const { name } = request.body as { name: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
      return reply.status(400).send({ error: 'name is required (1-20 chars)' });
    }
    const trimmed = name.trim();
    // #252 — invite-only: a shared secret alone doesn't stop anyone holding
    // it from minting or claiming an arbitrary name, so this checks the
    // allow-list before either branch of find-or-create, not just create.
    if (profileAllowlist && !profileAllowlist.has(trimmed.toLowerCase())) {
      return reply.status(403).send({ error: 'This name is not on the invite list' });
    }
    try {
      const existing = await profilesDb.getProfileByName(trimmed);
      if (existing) {
        return { profile: existing };
      }
      const profile = await profilesDb.createProfile(trimmed);
      return reply.status(201).send({ profile });
    } catch (err) {
      app.log.error({ err }, '[POST /profiles] DB error');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.get<{ Params: { id: string } }>('/profiles/:id', async (request, reply) => {
    try {
      const profile = await profilesDb.getProfileById(request.params.id);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      return { profile };
    } catch (err) {
      app.log.error({ err }, '[GET /profiles/:id] DB error');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.get<{ Params: { joinCode: string } }>('/games/:joinCode', async (request, reply) => {
    const { joinCode } = request.params;
    try {
      const game = await gamesDb.getGameByJoinCode(joinCode);
      if (!game) {
        return reply.status(404).send({ error: 'Game not found' });
      }
      const players = await playersDb.getPlayersByGameId(game.id);
      return { game, players };
    } catch (err) {
      app.log.error({ err }, '[GET /games/:joinCode] DB error');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.get('/ws', { websocket: true }, async (socket, request) => {
    // Register handlers synchronously before any awaits so messages sent
    // immediately on client onopen aren't silently dropped. Messages arriving
    // before auth + reconnect complete are buffered and replayed afterward.
    const pendingMessages: Buffer[] = [];
    let authComplete = false;

    socket.on('message', async (raw: Buffer) => {
      if (!authComplete) {
        pendingMessages.push(raw);
        return;
      }
      await handleMessage(socket, raw.toString(), app.log);
    });

    socket.on('close', () => {
      removeConnection(socket);
    });

    socket.on('error', (err: Error) => {
      app.log.error(err, 'WebSocket error');
      removeConnection(socket);
    });

    try {
      const user = await authenticateUpgrade(request);
      if (!user) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        socket.close(4001, 'Unauthenticated');
        return;
      }

      setAuthenticatedUser(socket, user);

      // Reconnect: re-register socket if this profile has an active player in a game
      try {
        const player = await playersDb.getActivePlayerByProfileId(user.profileId);
        if (player) {
          const game = await gamesDb.getGameById(player.gameId);
          if (game) {
            registerConnection(socket, player.id, game.id);
            const players = await playersDb.getPlayersByGameId(game.id);
            await broadcastGameState(game.id, game, players);
          }
        }
      } catch (err) {
        app.log.error({ err }, '[WS /ws] reconnect lookup error');
      }

      // Auth and reconnect complete — replay buffered messages in order
      authComplete = true;
      for (const buffered of pendingMessages) {
        await handleMessage(socket, buffered.toString(), app.log);
      }
    } catch (err) {
      app.log.error({ err }, '[WS /ws] upgrade error');
      socket.close(4000, 'Internal error');
    }
  });

  if (process.env.ENABLE_DEV_SEED === 'true' && process.env.NODE_ENV !== 'production') {
    app.post('/dev/advance-turn', async (request, reply) => {
      try {
        const { joinCode } = request.body as { joinCode?: string };
        if (!joinCode) return reply.status(400).send({ error: 'joinCode is required' });

        const game = await gamesDb.getGameByJoinCode(joinCode);
        if (!game) return reply.status(404).send({ error: 'Game not found' });
        if (game.status !== 'active') return reply.status(400).send({ error: 'Game is not active' });

        const updatedGame = await engine.advanceTurn(game.id);
        const players = await playersDb.getPlayersByGameId(game.id);
        await broadcastGameState(game.id, updatedGame, players);

        const currentPlayer = players.find(p => p.id === updatedGame.currentTurnPlayerId);
        return { currentTurnPlayerId: updatedGame.currentTurnPlayerId, playerName: currentPlayer?.name ?? '' };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/advance-turn] error');
        return reply.status(500).send({ error: 'Failed to advance turn' });
      }
    });

    const parseMissionParam = (body: unknown): number | { error: string } => {
      const rawMission = (body as Record<string, unknown> | null ?? {}).mission;
      if (rawMission === undefined) return 1;
      if (typeof rawMission !== 'number' || !Number.isInteger(rawMission) || rawMission < 1 || rawMission > 8) {
        return { error: 'mission must be an integer between 1 and 8' };
      }
      return rawMission;
    };

    const getOrCreateProfile = async (name: string) => {
      const existing = await profilesDb.getProfileByName(name);
      return existing ?? await profilesDb.createProfile(name);
    };

    const seedDevGame = async (mission: number, options: { completeSetup: boolean }) => {
      const devProfile = await getOrCreateProfile('Dev');
      const { game, player } = await engine.createGame('Dev', devProfile.id);

      const aliceProfile = await getOrCreateProfile('Alice');
      const bobProfile = await getOrCreateProfile('Bob');
      const carolProfile = await getOrCreateProfile('Carol');
      const { player: alice } = await engine.joinGame(game.joinCode, 'Alice', aliceProfile.id);
      const { player: bob } = await engine.joinGame(game.joinCode, 'Bob', bobProfile.id);
      const { player: carol } = await engine.joinGame(game.joinCode, 'Carol', carolProfile.id);

      // startGame now requires every player to have readied up in the lobby;
      // dev seeding skips the real ready flow, so ready everyone up here.
      for (const p of [player, alice, bob, carol]) {
        await engine.executePlayerReady(game.id, p.id);
      }

      await engine.startGame(game.id, player.id, mission);
      if (options.completeSetup) {
        await engine.completeSetup(game.id);
        // Auto-generate info tokens for each player's wires so dev games start with full knowledge
        const gamePlayers = await playersDb.getPlayersByGameId(game.id);
        for (const p of gamePlayers) {
          const wires = await wiresDb.getWiresByPlayerId(p.id);
          for (const wire of wires) {
            if (wire.value !== null) {
              await tokensDb.createInfoToken(game.id, wire.id, wire.value);
            }
          }
        }
      }
      return {
        joinCode: game.joinCode,
        profileId: devProfile.id,
        playerName: 'Dev',
        mission,
        // Real profileIds for every dev-seeded player, so a dev-mode client can connect via
        // the standard WS auth (profileId + name) as any seat, not just the creator. Bounded
        // strictly to the Alice/Bob/Carol/Dev rows this seed call itself creates/reuses.
        players: [
          { name: 'Dev', profileId: devProfile.id },
          { name: 'Alice', profileId: aliceProfile.id },
          { name: 'Bob', profileId: bobProfile.id },
          { name: 'Carol', profileId: carolProfile.id },
        ],
      };
    };

    // Lands the seeded game at the START of the real opening flow (lobby
    // readied + started, captain's turn, no tokens placed) — drivable
    // seat-by-seat through the seat switcher, same as a real game would be.
    // Use POST /dev/reveal-all-tokens to fast-forward an existing seeded
    // game to the old all-tokens/active state on demand.
    app.post('/dev/seed', async (request, reply) => {
      try {
        const mission = parseMissionParam(request.body);
        if (typeof mission === 'object') return reply.status(400).send(mission);

        const result = await seedDevGame(mission, { completeSetup: false });
        return result;
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });

    // Positions a freshly-seeded active game one correct solo cut from
    // victory: finds a same-value, same-color hidden wire pair (never red —
    // solo cutting a red pair isn't the intended win path, and every mission
    // config guarantees a blue group to pick from instead), reassigns both
    // wires to the Dev player, cuts every other hidden wire, and hands Dev
    // the turn. Lets E2E/manual testing exercise the win flow (checklist
    // item 7) via a single real solo_cut instead of an unverified
    // multi-identity turn-ordered solver.
    const positionNearWin = async (gameId: string, devPlayerId: string): Promise<{ value: string; color: string }> => {
      const wires = await wiresDb.getWiresByGameId(gameId);
      const hiddenByKey = new Map<string, typeof wires>();
      for (const w of wires) {
        if (w.status !== 'hidden') continue;
        const key = `${w.color}:${w.value}`;
        const group = hiddenByKey.get(key) ?? [];
        group.push(w);
        hiddenByKey.set(key, group);
      }

      const pair = [...hiddenByKey.entries()]
        .filter(([key, group]) => !key.startsWith('red:') && group.length >= 2)
        .sort(([a], [b]) => a.localeCompare(b))[0]?.[1];
      if (!pair) throw new Error(`No matching non-red wire pair available to seed a near-win for this mission`);
      const [wireA, wireB] = pair;

      const devWires = await wiresDb.getWiresByPlayerId(devPlayerId);
      const nextRackPosition = Math.max(0, ...devWires.map(w => w.rackPosition)) + 1;
      await wiresDb.updateWirePlayer(wireA.id, devPlayerId, nextRackPosition);
      await wiresDb.updateWirePlayer(wireB.id, devPlayerId, nextRackPosition + 1);

      for (const w of wires) {
        if (w.id === wireA.id || w.id === wireB.id) continue;
        if (w.status === 'hidden') {
          await wiresDb.updateWireStatus(w.id, 'cut');
        }
      }

      await gamesDb.updateCurrentTurn(gameId, devPlayerId);

      return { value: wireA.value!, color: wireA.color };
    };

    app.post('/dev/seed-near-win', async (request, reply) => {
      try {
        const mission = parseMissionParam(request.body);
        if (typeof mission === 'object') return reply.status(400).send(mission);

        const result = await seedDevGame(mission, { completeSetup: true });
        const game = await gamesDb.getGameByJoinCode(result.joinCode);
        if (!game) throw new Error('Seeded game not found');
        const players = await playersDb.getPlayersByGameId(game.id);
        const devPlayer = players.find(p => p.name === 'Dev');
        if (!devPlayer) throw new Error('Dev player not found in seeded game');

        const nearWin = await positionNearWin(game.id, devPlayer.id);

        return { ...result, nearWinValue: nearWin.value, nearWinColor: nearWin.color };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed-near-win] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });

    app.post('/dev/cleanup', async (request, reply) => {
      try {
        const { joinCode } = request.body as { joinCode?: string };
        if (!joinCode) return reply.status(400).send({ error: 'joinCode is required' });

        const game = await gamesDb.getGameByJoinCode(joinCode);
        if (!game) return reply.status(404).send({ error: 'Game not found' });

        await gamesDb.deleteGame(game.id);
        return { deleted: true, joinCode };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/cleanup] error');
        return reply.status(500).send({ error: 'Cleanup failed' });
      }
    });

    // Fast-forwards an existing dev-seeded game to full-knowledge omniscience
    // on demand: completes any remaining opening-token placement (via the
    // same dev-only completeSetup helper /dev/seed used to run inline) and
    // backfills an info token for every wire that doesn't already have one
    // (skips wires a real action already tokened/revealed, so it's safe to
    // call mid-game too, not just right after seeding).
    app.post('/dev/reveal-all-tokens', async (request, reply) => {
      try {
        const { joinCode } = request.body as { joinCode?: string };
        if (!joinCode) return reply.status(400).send({ error: 'joinCode is required' });

        const game = await gamesDb.getGameByJoinCode(joinCode);
        if (!game) return reply.status(404).send({ error: 'Game not found' });
        if (game.status !== 'setup' && game.status !== 'active') {
          return reply.status(400).send({ error: `Cannot reveal tokens for a game in '${game.status}' status` });
        }

        let updatedGame = game;
        if (game.status === 'setup') {
          updatedGame = await engine.completeSetup(game.id);
        }

        const [wires, existingTokens, players] = await Promise.all([
          wiresDb.getWiresByGameId(game.id),
          tokensDb.getInfoTokensByGameId(game.id),
          playersDb.getPlayersByGameId(game.id),
        ]);
        const wiresWithTokens = new Set(existingTokens.map(t => t.wireId));

        let created = 0;
        for (const wire of wires) {
          if (wire.value === null || wiresWithTokens.has(wire.id)) continue;
          await tokensDb.createInfoToken(game.id, wire.id, wire.value);
          created += 1;
        }

        await broadcastGameState(game.id, updatedGame, players);

        return { joinCode, tokensCreated: created, game: updatedGame };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/reveal-all-tokens] error');
        return reply.status(500).send({ error: 'Reveal failed' });
      }
    });

    // Schema-currency check (#141) — reports whether every migration
    // db/migrate.ts knows about has actually been applied to the DB this
    // server instance is talking to. Wired into the post-deploy staging
    // smoke check so drift (like #140's 6-week-stale staging incident) is
    // caught within one scheduled run instead of waiting for a human to
    // hit a missing column live. Dev-gated like every other /dev/* route —
    // prod is exempt per the #122 pattern (this never runs there).
    app.get('/dev/migrations-status', async (_request, reply) => {
      try {
        const status = await getMigrationsStatus();
        return status;
      } catch (err) {
        app.log.error({ err }, '[GET /dev/migrations-status] error');
        return reply.status(500).send({ error: 'Migrations status check failed' });
      }
    });
  }

  return app;
}
