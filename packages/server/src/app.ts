import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as gamesDb from './db/games.js';
import * as playersDb from './db/players.js';
import * as profilesDb from './db/profiles.js';
import * as outcomesDb from './db/outcomes.js';
import * as tokensDb from './db/tokens.js';
import * as wiresDb from './db/wires.js';
import { getMigrationsStatus } from './db/migrations.js';
import * as engine from './engine/game-engine.js';
import { handleMessage } from './ws/message-handler.js';
import { removeConnection, setAuthenticatedUser, registerConnection } from './ws/connection-manager.js';
import { authenticateUpgrade, authenticateProfile } from './ws/auth.js';
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

  // #82 — wire value/colour must never reach a log line, even by accident:
  // the whole game mechanic is hidden information (#187), and a log is just
  // another place the server can disclose state it isn't supposed to. Pino
  // redact paths match exact depth, not arbitrary nesting, so this covers
  // these field names at the top level and one level of nesting (e.g. a
  // future `log.info({ result: { value } })`) — it is not a blanket
  // guarantee against every possible shape. Authors still need to not log
  // full wire/candidate objects; this is a backstop for the common cases,
  // not a substitute for that discipline.
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: [
        'req.url',
        'value', 'color', 'guessedValue', 'wireValue', 'wireColor',
        'nearWinValue', 'nearWinColor', 'soloCutValue', 'soloCutColor',
        '*.value', '*.color', '*.guessedValue', '*.wireValue', '*.wireColor',
        '*.nearWinValue', '*.nearWinColor', '*.soloCutValue', '*.soloCutColor',
      ],
    },
  });

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
    if (provided !== apiAccessKey) {
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

  app.post('/profiles', async (request, reply) => {
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

  // #194 — own-profile only: a profile's {id, name} composes with #189's
  // un-gated mission-outcomes route into a profile-enumeration + history-leak
  // path once a profileId is known by any means, so this can't stay open.
  app.get<{ Params: { id: string }; Querystring: { profileId?: string; name?: string } }>('/profiles/:id', async (request, reply) => {
    const user = await authenticateProfile(request.query.profileId, request.query.name);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    if (user.profileId !== request.params.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
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

  // #170 — per-profile mission outcomes for the home-screen indicators.
  // Missions absent from the array were never played.
  // #222 — own-profile only, same #194 pattern: this route was the exact
  // history-leak the #194 comment on /profiles/:id above warned would
  // compose with an un-gated mission-outcomes endpoint — it just hadn't
  // been closed yet. IMPORTANT: the client's useMissionOutcomes call must
  // ship credentialed (profileId/name query params) in the same window as
  // this gate, or the mission-unlock picker breaks for everyone — see #222.
  app.get<{ Params: { id: string }; Querystring: { profileId?: string; name?: string } }>('/profiles/:id/mission-outcomes', async (request, reply) => {
    const user = await authenticateProfile(request.query.profileId, request.query.name);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    if (user.profileId !== request.params.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    try {
      const profile = await profilesDb.getProfileById(request.params.id);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      const outcomes = await outcomesDb.getMissionOutcomesByProfileId(profile.id);
      return { outcomes };
    } catch (err) {
      app.log.error({ err }, '[GET /profiles/:id/mission-outcomes] DB error');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // #194 — seated-player-in-that-game only: returns mission/detonator state
  // and every seated player's id/name/seatOrder, which was a full identity +
  // live-progress leak to anyone with a join code, no session required.
  app.get<{ Params: { joinCode: string }; Querystring: { profileId?: string; name?: string } }>('/games/:joinCode', async (request, reply) => {
    const user = await authenticateProfile(request.query.profileId, request.query.name);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    const { joinCode } = request.params;
    try {
      const game = await gamesDb.getGameByJoinCode(joinCode);
      if (!game) {
        return reply.status(404).send({ error: 'Game not found' });
      }
      const seatedProfileIds = await playersDb.getPlayerProfileIdsByGameId(game.id);
      if (!seatedProfileIds.includes(user.profileId)) {
        return reply.status(403).send({ error: 'Forbidden' });
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
            app.log.info({ gameId: game.id, playerId: player.id }, '[WS /ws] player reconnected');
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

    const parseMissionParam = (body: unknown, defaultMission = 1): number | { error: string } => {
      const rawMission = (body as Record<string, unknown> | null ?? {}).mission;
      if (rawMission === undefined) return defaultMission;
      if (typeof rawMission !== 'number' || !Number.isInteger(rawMission) || rawMission < 1 || rawMission > 8) {
        return { error: 'mission must be an integer between 1 and 8' };
      }
      return rawMission;
    };

    // #256 — explicit colour targeting for the near-win / solo-cut-legal dev
    // seeds. 'yellow' is the only other colour they ever need to target
    // (red is never a solo-cut path); every mission below 3 has no yellow
    // wires, so a caller asking for yellow without naming a mission gets
    // mission 3 (the first one that has any) rather than a confusing error.
    type DevSoloCutColor = 'blue' | 'yellow';
    const parseColorParam = (body: unknown): DevSoloCutColor | undefined | { error: string } => {
      const raw = (body as Record<string, unknown> | null ?? {}).color;
      if (raw === undefined) return undefined;
      if (raw !== 'blue' && raw !== 'yellow') {
        return { error: "color must be 'blue' or 'yellow'" };
      }
      return raw;
    };

    const getOrCreateProfile = async (name: string) => {
      const existing = await profilesDb.getProfileByName(name);
      return existing ?? await profilesDb.createProfile(name);
    };

    // #270 — Dev is always the captain/creator; the rest of DEV_SEED_NAMES
    // fills in join order, so a playerCount of 2 or 3 seeds Dev+Alice or
    // Dev+Alice+Bob rather than all four. Every per-count rule (stand
    // allocation, detonator max) already reads off the actual seated player
    // count in game-engine.ts/wire-dealer.ts — dealWires' wiresPerPlayer
    // lookup and startGame's `players.length - 1` detonator formula were
    // never hardcoded to 4, so seeding fewer players is the entire fix.
    const DEV_SEED_NAMES = ['Dev', 'Alice', 'Bob', 'Carol'] as const;

    const parsePlayerCountParam = (body: unknown): number | { error: string } => {
      const raw = (body as Record<string, unknown> | null ?? {}).playerCount;
      if (raw === undefined) return DEV_SEED_NAMES.length;
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 2 || raw > DEV_SEED_NAMES.length) {
        return { error: `playerCount must be an integer between 2 and ${DEV_SEED_NAMES.length}` };
      }
      return raw;
    };

    const seedDevGame = async (mission: number, options: { completeSetup: boolean; playerCount?: number }) => {
      const names = DEV_SEED_NAMES.slice(0, options.playerCount ?? DEV_SEED_NAMES.length);

      const devProfile = await getOrCreateProfile(names[0]);
      const { game, player } = await engine.createGame(names[0], devProfile.id, 'dev_seed');

      const seatedPlayers = [player];
      const profilesByName = new Map([[names[0], devProfile]]);
      for (const name of names.slice(1)) {
        const profile = await getOrCreateProfile(name);
        profilesByName.set(name, profile);
        const { player: joined } = await engine.joinGame(game.joinCode, name, profile.id);
        seatedPlayers.push(joined);
      }

      // startGame now requires every player to have readied up in the lobby;
      // dev seeding skips the real ready flow, so ready everyone up here.
      for (const p of seatedPlayers) {
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
              await tokensDb.createInfoToken(game.id, wire.id, wire.value, true);
            }
          }
        }
      }
      return {
        joinCode: game.joinCode,
        profileId: devProfile.id,
        playerName: names[0],
        mission,
        // Real profileIds for every dev-seeded player, so a dev-mode client can connect via
        // the standard WS auth (profileId + name) as any seat, not just the creator. Bounded
        // strictly to the names this seed call itself creates/reuses/joins.
        players: names.map(name => ({ name, profileId: profilesByName.get(name)!.id })),
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
        const playerCount = parsePlayerCountParam(request.body);
        if (typeof playerCount === 'object') return reply.status(400).send(playerCount);

        const result = await seedDevGame(mission, { completeSetup: false, playerCount });
        return result;
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });

    // #256 — colour-scoped (yellow, #190 Phase B) vs value-scoped (every
    // other non-red colour) hidden-wire selection, shared by positionNearWin
    // and positionSoloCutLegal below. Previously both grouped by
    // (color, value) and picked the alphabetically-first non-red key, which
    // is always a blue group since every mission includes blue — no caller
    // could ever reach the yellow path this way. Selection is explicit now:
    // pass 'yellow' to target it; leave targetColor unset for the
    // longstanding blue-preferred default every existing caller relies on.
    const selectHiddenScope = (
      wires: Awaited<ReturnType<typeof wiresDb.getWiresByGameId>>,
      targetColor?: DevSoloCutColor,
    ): { color: string; value: string; wires: typeof wires } | null => {
      if (targetColor === 'yellow') {
        // Colour-scoped: any hidden yellow wires, any values — solo-cut
        // legality for yellow is "holds every remaining hidden yellow wire
        // in the game," not a per-value match. Works whether yellow's count
        // is today's placeholder of 1 or #216's eventual higher count.
        const yellowWires = wires.filter(w => w.status === 'hidden' && w.color === 'yellow');
        return yellowWires.length > 0 ? { color: 'yellow', value: 'YELLOW', wires: yellowWires } : null;
      }

      // Only 'blue' reaches here — 'yellow' is handled above (colour-scoped)
      // and 'red' is never a solo-cut/near-win path, and those are the only
      // three wire colours (WireColor in packages/shared/src/types.ts), so
      // there's no other colour left to prefer between.
      const hiddenByValue = new Map<string, typeof wires>();
      for (const w of wires) {
        if (w.status !== 'hidden' || w.color !== 'blue') continue;
        const group = hiddenByValue.get(w.value!) ?? [];
        group.push(w);
        hiddenByValue.set(w.value!, group);
      }
      if (hiddenByValue.size === 0) return null;

      // Explicit, not an artifact of key ordering: numeric value ascending,
      // never a string/alphabetical sort (which is what let a decimal like
      // "4.1" jump ahead of "5" under the old code).
      const [pickedValue, group] = [...hiddenByValue.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))[0];
      return { color: 'blue', value: pickedValue, wires: group };
    };

    // Positions a freshly-seeded active game one correct solo cut from
    // victory: finds a hidden-wire pair in scope (value-matched for blue and
    // every other non-red/non-yellow colour; any two hidden yellows for the
    // colour-scoped #190 Phase B path), reassigns them to the Dev player,
    // cuts every other hidden wire, and hands Dev the turn. Lets E2E/manual
    // testing exercise the win flow (checklist item 7) via a single real
    // solo_cut instead of an unverified multi-identity turn-ordered solver.
    const positionNearWin = async (gameId: string, devPlayerId: string, targetColor?: DevSoloCutColor): Promise<{ value: string; color: string }> => {
      const wires = await wiresDb.getWiresByGameId(gameId);
      const scope = selectHiddenScope(wires, targetColor);
      if (!scope || (targetColor !== 'yellow' && scope.wires.length < 2)) {
        throw new Error(
          targetColor === 'yellow'
            ? 'No hidden yellow wire available to seed a near-win for this mission'
            : 'No matching non-red wire pair available to seed a near-win for this mission'
        );
      }
      // Yellow's "pair" can be a single wire (matches today's placeholder
      // count of 1, still correct once #216 raises it) — every other colour
      // keeps #165's original >= 2 requirement (already enforced above), so
      // the cut-two-at-once demo is unchanged.
      const pair = scope.wires.slice(0, 2);
      const pairIds = new Set(pair.map(w => w.id));

      const devWires = await wiresDb.getWiresByPlayerId(devPlayerId);
      let nextRackPosition = Math.max(0, ...devWires.map(w => w.rackPosition)) + 1;
      for (const w of pair) {
        await wiresDb.updateWirePlayer(w.id, devPlayerId, nextRackPosition);
        nextRackPosition += 1;
      }

      for (const w of wires) {
        if (pairIds.has(w.id)) continue;
        if (w.status === 'hidden') {
          await wiresDb.updateWireStatus(w.id, 'cut');
        }
      }

      await gamesDb.updateCurrentTurn(gameId, devPlayerId);

      return targetColor === 'yellow' ? { value: 'YELLOW', color: 'yellow' } : { value: pair[0].value!, color: pair[0].color! };
    };

    app.post('/dev/seed-near-win', async (request, reply) => {
      try {
        const colorResult = parseColorParam(request.body);
        if (typeof colorResult === 'object') return reply.status(400).send(colorResult);
        const color = colorResult;
        const mission = parseMissionParam(request.body, color === 'yellow' ? 3 : 1);
        if (typeof mission === 'object') return reply.status(400).send(mission);
        const playerCount = parsePlayerCountParam(request.body);
        if (typeof playerCount === 'object') return reply.status(400).send(playerCount);

        const result = await seedDevGame(mission, { completeSetup: true, playerCount });
        const game = await gamesDb.getGameByJoinCode(result.joinCode);
        if (!game) throw new Error('Seeded game not found');
        const players = await playersDb.getPlayersByGameId(game.id);
        const devPlayer = players.find(p => p.name === 'Dev');
        if (!devPlayer) throw new Error('Dev player not found in seeded game');

        const nearWin = await positionNearWin(game.id, devPlayer.id, color);

        return { ...result, nearWinValue: nearWin.value, nearWinColor: nearWin.color };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed-near-win] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });

    // #165 — mission 1 splits each value's 4 copies across 4 players, so a
    // random /dev/seed deal gives one player all 4 copies of a value (the
    // only way a solo cut is legal per #150) with <1% probability. Forces it
    // deterministically: picks a fully-hidden scope (#256 — value group for
    // blue/other colours, every hidden yellow wire for the colour-scoped
    // #190 Phase B path) and reassigns every wire in it to Dev, mirroring
    // positionNearWin's wire-reassignment trick but for solo-cut legality
    // rather than an immediate win.
    const positionSoloCutLegal = async (gameId: string, devPlayerId: string, targetColor?: DevSoloCutColor): Promise<{ value: string; color: string }> => {
      const wires = await wiresDb.getWiresByGameId(gameId);
      const scope = selectHiddenScope(wires, targetColor);
      if (!scope) {
        throw new Error(
          targetColor === 'yellow'
            ? 'No hidden yellow wire available to seed a legal solo cut for this mission'
            : 'No non-red wire group available to seed a legal solo cut for this mission'
        );
      }

      const devWires = await wiresDb.getWiresByPlayerId(devPlayerId);
      let nextRackPosition = Math.max(0, ...devWires.map(w => w.rackPosition)) + 1;
      for (const wire of scope.wires) {
        if (wire.playerId === devPlayerId) continue;
        await wiresDb.updateWirePlayer(wire.id, devPlayerId, nextRackPosition);
        nextRackPosition += 1;
      }

      return { value: scope.value, color: scope.color };
    };

    app.post('/dev/seed-solo-cut-legal', async (request, reply) => {
      try {
        const colorResult = parseColorParam(request.body);
        if (typeof colorResult === 'object') return reply.status(400).send(colorResult);
        const color = colorResult;
        const mission = parseMissionParam(request.body, color === 'yellow' ? 3 : 1);
        if (typeof mission === 'object') return reply.status(400).send(mission);
        const playerCount = parsePlayerCountParam(request.body);
        if (typeof playerCount === 'object') return reply.status(400).send(playerCount);

        const result = await seedDevGame(mission, { completeSetup: true, playerCount });
        const game = await gamesDb.getGameByJoinCode(result.joinCode);
        if (!game) throw new Error('Seeded game not found');
        const players = await playersDb.getPlayersByGameId(game.id);
        const devPlayer = players.find(p => p.name === 'Dev');
        if (!devPlayer) throw new Error('Dev player not found in seeded game');

        const legal = await positionSoloCutLegal(game.id, devPlayer.id, color);

        return { ...result, soloCutValue: legal.value, soloCutColor: legal.color };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed-solo-cut-legal] error');
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
          await tokensDb.createInfoToken(game.id, wire.id, wire.value, true);
          created += 1;
        }

        await broadcastGameState(game.id, updatedGame, players);

        return { joinCode, tokensCreated: created, game: updatedGame };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/reveal-all-tokens] error');
        return reply.status(500).send({ error: 'Reveal failed' });
      }
    });

    // #172 — the reveal-all undo: removes only dev-created info tokens
    // (dev_created = TRUE), leaving gameplay-placed tokens untouched. Does
    // NOT revert setup completion — if reveal-all completed setup, that
    // transition is one-way and the game stays active.
    app.post('/dev/hide-dev-tokens', async (request, reply) => {
      try {
        const { joinCode } = request.body as { joinCode?: string };
        if (!joinCode) return reply.status(400).send({ error: 'joinCode is required' });

        const game = await gamesDb.getGameByJoinCode(joinCode);
        if (!game) return reply.status(404).send({ error: 'Game not found' });
        if (game.status !== 'setup' && game.status !== 'active') {
          return reply.status(400).send({ error: `Cannot hide tokens for a game in '${game.status}' status` });
        }

        const tokensRemoved = await tokensDb.deleteDevInfoTokensByGameId(game.id);

        const players = await playersDb.getPlayersByGameId(game.id);
        await broadcastGameState(game.id, game, players);

        return { joinCode, tokensRemoved, game };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/hide-dev-tokens] error');
        return reply.status(500).send({ error: 'Hide failed' });
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
