import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as gamesDb from './db/games.js';
import * as playersDb from './db/players.js';
import * as profilesDb from './db/profiles.js';
import { handleMessage } from './ws/message-handler.js';
import { removeConnection, setAuthenticatedUser } from './ws/connection-manager.js';
import { authenticateUpgrade } from './ws/auth.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

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
    try {
      const user = await authenticateUpgrade(request);
      if (!user) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        socket.close(4001, 'Unauthenticated');
        return;
      }

      setAuthenticatedUser(socket, user);

      socket.on('message', async (raw: Buffer) => {
        await handleMessage(socket, raw.toString());
      });

      socket.on('close', () => {
        removeConnection(socket);
      });

      socket.on('error', (err: Error) => {
        app.log.error(err, 'WebSocket error');
        removeConnection(socket);
      });
    } catch (err) {
      app.log.error({ err }, '[WS /ws] upgrade error');
      socket.close(4000, 'Internal error');
    }
  });

  return app;
}
