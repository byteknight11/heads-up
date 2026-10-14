import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { z } from 'zod';
import { signToken, verifyToken } from './auth.js';
import { Hub, type HubOptions } from './hub.js';
import { type Store, baseUsername } from './store.js';

export interface AppOptions {
  store: Store;
  authSecret: string;
  devLogin: boolean;
  hub?: Omit<HubOptions, 'store'>;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: false });
  const hub = new Hub({ ...opts.hub, store: opts.store });
  await app.register(websocket);
  app.addHook('onClose', async () => hub.close());

  app.get('/health', async () => ({ ok: true }));

  app.get('/users/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const user = await opts.store.findUserById(id);
    if (!user) return reply.code(404).send({ error: 'not found' });
    const history = await opts.store.history(id);
    return { user: { id: user.id, username: user.username, rating: user.rating, gamesPlayed: user.gamesPlayed }, history };
  });

  if (opts.devLogin) {
    // Local development only: sign in by username, no password.
    app.post('/dev/login', async (req) => {
      const { username } = z.object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/) }).parse(req.body);
      const email = `${username.toLowerCase()}@dev.local`;
      const user = await opts.store.upsertUser(email, username);
      return { token: await signToken({ email, name: username }, opts.authSecret), user };
    });
  }

  app.get('/play', { websocket: true }, async (socket, req) => {
    // Hold messages that arrive while the token is checked, so none are lost.
    const early: string[] = [];
    const hold = (data: unknown) => early.push(String(data));
    socket.on('message', hold);
    const token = z.object({ token: z.string() }).safeParse(req.query);
    const claims = token.success ? await verifyToken(token.data.token, opts.authSecret) : null;
    const user = claims && (await opts.store.upsertUser(claims.email, baseUsername(claims.name)));
    socket.off('message', hold);
    if (!user) return socket.close(4401, 'unauthorized');
    hub.connect(user, socket, early);
  });

  return { app, hub };
}
