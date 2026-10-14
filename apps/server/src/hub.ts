import type { WebSocket } from 'ws';
import { Matchmaker } from './matchmaker.js';
import { ClientMessage, type PublicPlayer, type ServerMessage } from './protocol.js';
import type { Store, UserRecord } from './store.js';
import { GameTable, type TableOptions } from './table.js';

export interface HubOptions {
  store: Store;
  matchIntervalMs?: number;
  /** Passed through to every table; for tests. */
  tableOptions?: Pick<TableOptions, 'actionMs' | 'betweenHandsMs'>;
}

const publicPlayer = (u: UserRecord): PublicPlayer => ({ id: u.id, username: u.username, rating: u.rating });

/** Owns live connections, the matchmaking queue and every running table. */
export class Hub {
  private sockets = new Map<string, WebSocket>();
  private tables = new Map<string, GameTable>();
  /** Players paired by the matchmaker whose table is still being set up. */
  private starting = new Set<string>();
  readonly matchmaker = new Matchmaker();
  private interval: NodeJS.Timeout;

  constructor(private readonly opts: HubOptions) {
    this.interval = setInterval(() => void this.matchPlayers(), opts.matchIntervalMs ?? 1_000);
  }

  tableOf(userId: string): GameTable | undefined {
    return this.tables.get(userId);
  }

  send(userId: string, msg: ServerMessage): void {
    const ws = this.sockets.get(userId);
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }

  connect(user: UserRecord, ws: WebSocket, early: string[] = []): void {
    // One socket per player: a new tab replaces the old one.
    this.sockets.get(user.id)?.close(4000, 'replaced by a new connection');
    this.sockets.set(user.id, ws);
    this.send(user.id, { type: 'hello', user: publicPlayer(user), inGame: this.tables.has(user.id) });
    this.tables.get(user.id)?.resync(user.id);

    ws.on('message', (data) => void this.onMessage(user.id, data.toString()));
    for (const raw of early) void this.onMessage(user.id, raw);
    ws.on('close', () => {
      if (this.sockets.get(user.id) !== ws) return;
      this.sockets.delete(user.id);
      // A player who is gone can't be matched; a live game keeps its clock running.
      this.matchmaker.leave(user.id);
    });
  }

  private async onMessage(userId: string, raw: string) {
    let msg: ClientMessage;
    try {
      msg = ClientMessage.parse(JSON.parse(raw));
    } catch {
      return this.send(userId, { type: 'error', message: 'invalid message' });
    }
    const table = this.tables.get(userId);
    switch (msg.type) {
      case 'queue.join': {
        if (table || this.starting.has(userId)) return this.send(userId, { type: 'error', message: 'already in a game' });
        const user = await this.opts.store.findUserById(userId);
        if (!user) return;
        this.matchmaker.join(userId, user.rating, Date.now());
        return this.send(userId, { type: 'queue.joined' });
      }
      case 'queue.leave':
        this.matchmaker.leave(userId);
        return this.send(userId, { type: 'queue.left' });
      case 'action':
        if (!table) return this.send(userId, { type: 'error', message: 'not in a game' });
        return table.act(userId, msg.action);
      case 'resign':
        return table?.resign(userId);
    }
  }

  /** Pairs queued players and starts their tables. */
  async matchPlayers(now = Date.now()): Promise<void> {
    for (const [a, b] of this.matchmaker.tick(now)) {
      this.starting.add(a.userId).add(b.userId);
      try {
        await this.startTable(a.userId, b.userId);
      } catch (e) {
        // A failed start must not crash the server; both players can queue again.
        console.error('could not start a game:', e);
        for (const id of [a.userId, b.userId]) this.send(id, { type: 'error', message: 'could not start the game, please queue again' });
      } finally {
        this.starting.delete(a.userId);
        this.starting.delete(b.userId);
      }
    }
  }

  private async startTable(id1: string, id2: string): Promise<void> {
    const [u1, u2] = await Promise.all([this.opts.store.findUserById(id1), this.opts.store.findUserById(id2)]);
    if (!u1 || !u2) return;
    const gameId = await this.opts.store.createGame(u1.id, u2.id);
    const table = new GameTable({
      ...this.opts.tableOptions,
      gameId,
      players: [publicPlayer(u1), publicPlayer(u2)],
      store: this.opts.store,
      send: (id, msg) => this.send(id, msg),
      onEnd: (t) => {
        for (const p of t.players) if (this.tables.get(p.id) === t) this.tables.delete(p.id);
      },
    });
    this.tables.set(u1.id, table);
    this.tables.set(u2.id, table);
    await table.start();
  }

  close(): void {
    clearInterval(this.interval);
    for (const t of new Set(this.tables.values())) t.stop();
    for (const ws of this.sockets.values()) ws.close(1001, 'server shutting down');
  }
}
