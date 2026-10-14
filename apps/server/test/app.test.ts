import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { signToken } from '../src/auth.js';
import type { ServerMessage } from '../src/protocol.js';
import { MemoryStore } from '../src/store.js';

const SECRET = 'test-secret';
let close: (() => Promise<unknown>) | undefined;
afterEach(async () => close?.());

async function start(opts: { slowStore?: boolean } = {}) {
  const store = new MemoryStore();
  if (opts.slowStore) {
    // Simulates a database round trip during socket auth.
    const upsert = store.upsertUser.bind(store);
    store.upsertUser = async (email, name) => (await new Promise((r) => setTimeout(r, 50)), upsert(email, name));
  }
  const { app } = await buildApp({ store, authSecret: SECRET, devLogin: true, hub: { matchIntervalMs: 10, tableOptions: { betweenHandsMs: 5 } } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  close = () => app.close();
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { app, store, base: `127.0.0.1:${port}` };
}

async function login(base: string, username: string) {
  const res = await fetch(`http://${base}/dev/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) });
  return (await res.json()) as { token: string; user: { id: string } };
}

/** A client that answers every decision with an all-in or a call, so games end fast. */
function bot(base: string, token: string) {
  const ws = new WebSocket(`ws://${base}/play?token=${token}`);
  const seen: ServerMessage[] = [];
  const ended = new Promise<Extract<ServerMessage, { type: 'game.end' }>>((resolve) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      seen.push(msg);
      if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'queue.join' }));
      if (msg.type === 'state' && msg.view.legal) {
        const l = msg.view.legal;
        const action = l.maxRaiseTo !== null ? { type: 'allin' } : l.callAmount !== null ? { type: 'call' } : { type: 'check' };
        ws.send(JSON.stringify({ type: 'action', action }));
      }
      if (msg.type === 'game.end') resolve(msg);
    });
  });
  return { ws, seen, ended };
}

describe('server', () => {
  it('creates a player on first connect from a web-signed token', async () => {
    const { base, store } = await start();
    const token = await signToken({ email: 'new@example.com', name: 'Ana María' }, SECRET);
    const ws = new WebSocket(`ws://${base}/play?token=${token}`);
    const hello = await new Promise<ServerMessage>((r) => ws.on('message', (raw) => r(JSON.parse(raw.toString()))));
    ws.close();
    expect(hello).toMatchObject({ type: 'hello', user: { username: 'Ana_Maria', rating: 1200 } });
    expect([...store.users.values()].map((u) => u.email)).toEqual(['new@example.com']);
  });

  it('rejects a socket without a valid token', async () => {
    const { base } = await start();
    const ws = new WebSocket(`ws://${base}/play?token=nope`);
    const code = await new Promise((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(4401);
  });

  it('matches two players, plays a game to the end and updates ratings', async () => {
    const { base } = await start();
    const [alice, bob] = await Promise.all([login(base, 'alice'), login(base, 'bob')]);
    const a = bot(base, alice.token);
    const b = bot(base, bob.token);
    const [ea, eb] = await Promise.all([a.ended, b.ended]);
    a.ws.close();
    b.ws.close();

    expect(a.seen.find((m) => m.type === 'match.found')).toMatchObject({ opponent: { username: 'bob', rating: 1200 } });
    expect(ea.gameId).toBe(eb.gameId);
    const outcomes = [ea.outcome, eb.outcome].sort();
    expect(outcomes).toEqual(ea.outcome === 'draw' ? ['draw', 'draw'] : ['loss', 'win']);

    const profile = (await (await fetch(`http://${base}/users/${alice.user.id}`)).json()) as {
      user: { rating: number; gamesPlayed: number };
      history: Array<{ outcome: string; ratingChange: number; opponent: { username: string } }>;
    };
    expect(profile.user.rating).toBe(ea.newRating);
    expect(profile.user.gamesPlayed).toBe(1);
    expect(profile.history[0]).toMatchObject({ outcome: ea.outcome, ratingChange: ea.ratingChange, opponent: { username: 'bob' } });
    expect(ea.newRating).toBe(ea.outcome === 'win' ? 1216 : ea.outcome === 'loss' ? 1184 : 1200);
  });

  it('handles a message sent before the server says hello', async () => {
    const { base } = await start({ slowStore: true });
    const alice = await login(base, 'alice');
    const ws = new WebSocket(`ws://${base}/play?token=${alice.token}`);
    const msgs: ServerMessage[] = [];
    ws.on('message', (raw) => msgs.push(JSON.parse(raw.toString())));
    ws.on('open', () => ws.send(JSON.stringify({ type: 'queue.join' })));
    await expect.poll(() => msgs.map((m) => m.type), { timeout: 2000 }).toEqual(['hello', 'queue.joined']);
    ws.close();
  });

  it('returns 404, not a server error, for a malformed profile id', async () => {
    const { base } = await start();
    expect((await fetch(`http://${base}/users/not-a-uuid`)).status).toBe(404);
  });

  it('resyncs a player who reconnects mid-game', async () => {
    const { base } = await start();
    const [alice, bob] = await Promise.all([login(base, 'alice'), login(base, 'bob')]);
    const open = (token: string) => {
      const ws = new WebSocket(`ws://${base}/play?token=${token}`);
      const msgs: ServerMessage[] = [];
      ws.on('message', (raw) => msgs.push(JSON.parse(raw.toString())));
      return { ws, msgs };
    };
    const a = open(alice.token);
    const b = open(bob.token);
    await new Promise((r) => a.ws.on('open', r));
    await new Promise((r) => b.ws.on('open', r));
    a.ws.send(JSON.stringify({ type: 'queue.join' }));
    b.ws.send(JSON.stringify({ type: 'queue.join' }));
    await expect.poll(() => a.msgs.some((m) => m.type === 'state'), { timeout: 2000 }).toBe(true);

    a.ws.close();
    const again = open(alice.token);
    await expect.poll(() => again.msgs.map((m) => m.type), { timeout: 2000 }).toEqual(['hello', 'match.found', 'state']);
    expect(again.msgs[0]).toMatchObject({ inGame: true });
    again.ws.close();
    b.ws.close();
  });
});
