import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as gamesDb from './db/games.js';
import * as playersDb from './db/players.js';
import * as profilesDb from './db/profiles.js';
import { handleMessage } from './ws/message-handler.js';
import { removeConnection } from './ws/connection-manager.js';

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get('/health', async () => ({ status: 'ok' }));

  // REST: Create a game (returns join code)
  app.post('/games', async (request, reply) => {
    const { playerName } = request.body as { playerName: string };
    if (!playerName || typeof playerName !== 'string') {
      return reply.status(400).send({ error: 'playerName is required' });
    }
    // Game creation is handled via WebSocket, but this endpoint
    // can be used to check if a join code is valid
    return reply.status(501).send({ error: 'Use WebSocket to create games' });
  });

  // REST: Find or create a player profile by name
  app.post('/profiles', async (request, reply) => {
    const { name } = request.body as { name: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
      return reply.status(400).send({ error: 'name is required (1-20 chars)' });
    }
    const trimmed = name.trim();
    const existing = await profilesDb.getProfileByName(trimmed);
    if (existing) {
      return { profile: existing };
    }
    const profile = await profilesDb.createProfile(trimmed);
    return reply.status(201).send({ profile });
  });

  // REST: Get profile by ID
  app.get<{ Params: { id: string } }>('/profiles/:id', async (request, reply) => {
    const profile = await profilesDb.getProfileById(request.params.id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return { profile };
  });

  // REST: Get game by join code (for lobby preview)
  app.get<{ Params: { joinCode: string } }>('/games/:joinCode', async (request, reply) => {
    const { joinCode } = request.params;
    const game = await gamesDb.getGameByJoinCode(joinCode);
    if (!game) {
      return reply.status(404).send({ error: 'Game not found' });
    }
    const players = await playersDb.getPlayersByGameId(game.id);
    return { game, players };
  });

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
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
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server listening on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
