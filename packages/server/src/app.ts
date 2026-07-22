import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as gamesDb from './db/games.js';
import * as playersDb from './db/players.js';
import * as profilesDb from './db/profiles.js';
import * as tokensDb from './db/tokens.js';
import * as wiresDb from './db/wires.js';
import * as engine from './engine/game-engine.js';
import { handleMessage } from './ws/message-handler.js';
import { removeConnection, setAuthenticatedUser, registerConnection } from './ws/connection-manager.js';
import { authenticateUpgrade } from './ws/auth.js';
import { broadcastGameState } from './ws/state-broadcaster.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.url'] } });

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
      await engine.joinGame(game.joinCode, 'Alice', aliceProfile.id);
      await engine.joinGame(game.joinCode, 'Bob', bobProfile.id);
      await engine.joinGame(game.joinCode, 'Carol', carolProfile.id);

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

    app.post('/dev/seed', async (request, reply) => {
      try {
        const mission = parseMissionParam(request.body);
        if (typeof mission === 'object') return reply.status(400).send(mission);

        const result = await seedDevGame(mission, { completeSetup: true });
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

    app.post('/dev/seed-setup', async (request, reply) => {
      try {
        const mission = parseMissionParam(request.body);
        if (typeof mission === 'object') return reply.status(400).send(mission);

        const result = await seedDevGame(mission, { completeSetup: false });
        return result;
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed-setup] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });
  }

  return app;
}
