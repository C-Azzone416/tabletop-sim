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
  const app = Fastify({ logger: true });

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000'];
  await app.register(cors, { origin: allowedOrigins });
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
      await handleMessage(socket, raw.toString());
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
        await handleMessage(socket, buffered.toString());
      }
    } catch (err) {
      app.log.error({ err }, '[WS /ws] upgrade error');
      socket.close(4000, 'Internal error');
    }
  });

  if (process.env.ENABLE_DEV_SEED === 'true') {
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

    app.post('/dev/seed', async (_request, reply) => {
      try {
        const existing = await profilesDb.getProfileByName('Dev');
        const profile = existing ?? await profilesDb.createProfile('Dev');
        const { game, player } = await engine.createGame('Dev', profile.id);
        await engine.joinGame(game.joinCode, 'Alice');
        await engine.joinGame(game.joinCode, 'Bob');
        await engine.joinGame(game.joinCode, 'Carol');
        await engine.startGame(game.id, player.id, 1);
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
        return { joinCode: game.joinCode, profileId: profile.id, playerName: 'Dev' };
      } catch (err) {
        app.log.error({ err }, '[POST /dev/seed] error');
        return reply.status(500).send({ error: 'Seed failed' });
      }
    });
  }

  return app;
}
