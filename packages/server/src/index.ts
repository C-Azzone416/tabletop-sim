import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server listening on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
