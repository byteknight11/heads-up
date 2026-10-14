import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { PrismaStore } from './prisma-store.js';
import { MemoryStore, type Store } from './store.js';

const config = loadConfig();
let store: Store;
if (config.databaseUrl) {
  store = new PrismaStore();
  const aborted = await store.abortActiveGames();
  if (aborted) console.log(`aborted ${aborted} games left over from the last run (unrated)`);
} else {
  console.warn('DATABASE_URL not set: using an in-memory store, nothing will be saved');
  store = new MemoryStore();
}

const { app } = await buildApp({ store, authSecret: config.authSecret, devLogin: config.devLogin });
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`server listening on :${config.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
