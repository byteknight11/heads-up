import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { Hub } from '../src/hub.js';
import type { ServerMessage } from '../src/protocol.js';
import { MemoryStore } from '../src/store.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: ServerMessage[] = [];
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  say(msg: object) {
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
}

let hubs: Hub[] = [];
afterEach(() => hubs.forEach((h) => h.close()));

async function setup(store: MemoryStore) {
  const hub = new Hub({ store, matchIntervalMs: 60_000 });
  hubs.push(hub);
  const users = await Promise.all([store.upsertUser('a@x', 'alice'), store.upsertUser('b@x', 'bob')]);
  const sockets = users.map((u) => {
    const ws = new FakeSocket();
    hub.connect(u, ws as unknown as WebSocket);
    ws.say({ type: 'queue.join' });
    return ws;
  });
  await expect.poll(() => hub.matchmaker.size).toBe(2);
  return { hub, users, sockets };
}

describe('Hub', () => {
  it('survives a failed game start and lets both players queue again', async () => {
    const store = new MemoryStore();
    store.createGame = async () => {
      throw new Error('database down');
    };
    const { hub, sockets } = await setup(store);
    await hub.matchPlayers();
    for (const ws of sockets) expect(ws.sent.at(-1)).toEqual({ type: 'error', message: 'could not start the game, please queue again' });
    sockets[0]!.say({ type: 'queue.join' });
    await expect.poll(() => hub.matchmaker.size).toBe(1);
  });

  it('does not let a paired player queue again while their game starts', async () => {
    const store = new MemoryStore();
    const create = store.createGame.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    store.createGame = async (a, b) => (await gate, create(a, b));
    const { hub, users, sockets } = await setup(store);

    const matching = hub.matchPlayers();
    await expect.poll(() => hub.matchmaker.size).toBe(0);
    sockets[0]!.say({ type: 'queue.join' });
    await expect.poll(() => sockets[0]!.sent.at(-1)).toEqual({ type: 'error', message: 'already in a game' });
    expect(hub.matchmaker.size).toBe(0);

    release();
    await matching;
    expect(hub.tableOf(users[0]!.id)).toBeDefined();
    hub.tableOf(users[0]!.id)!.stop();
  });
});
