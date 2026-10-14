import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import type { ServerMessage } from '../src/protocol.js';
import { MemoryStore } from '../src/store.js';

const SECRET = 'test-secret';
let close: (() => Promise<unknown>) | undefined;
afterEach(async () => close?.());

async function start() {
  const store = new MemoryStore();
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
    again.ws.close();
    b.ws.close();
  });
});
