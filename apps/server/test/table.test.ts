import { afterEach, describe, expect, it } from 'vitest';
import { type ServerMessage } from '../src/protocol.js';
import { MemoryStore } from '../src/store.js';
import { GameTable } from '../src/table.js';

async function setup(opts: { actionMs?: number } = {}) {
  const store = new MemoryStore();
  const a = await store.upsertUser('a@x', 'alice');
  const b = await store.upsertUser('b@x', 'bob');
  const gameId = await store.createGame(a.id, b.id);
  const inbox: Record<string, ServerMessage[]> = { [a.id]: [], [b.id]: [] };
  let ended!: () => void;
  const done = new Promise<void>((r) => (ended = r));
  const table = new GameTable({
    gameId,
    players: [a, b],
    store,
    send: (id, msg) => inbox[id]!.push(msg),
    onEnd: () => ended(),
    actionMs: opts.actionMs ?? 10_000,
    betweenHandsMs: 5,
  });
  return { store, a, b, gameId, inbox, table, done };
}

let tables: GameTable[] = [];
afterEach(() => tables.forEach((t) => t.stop()));

describe('GameTable', () => {
  it('deals a hand and tells each player only their own cards', async () => {
    const s = await setup();
    tables.push(s.table);
    await s.table.start();
    const start = s.inbox[s.a.id]!.find((m) => m.type === 'hand.start');
    expect(start?.type === 'hand.start' && start.view.hand!.yourCards).toEqual(s.table.game.hand!.holeCards[0]);
    expect(JSON.stringify(s.inbox[s.a.id])).not.toContain(s.table.game.hand!.holeCards[1].join('","'));
  });

  it('rejects an action out of turn with an error message', async () => {
    const s = await setup();
    tables.push(s.table);
    await s.table.start();
    const notToAct = s.table.game.hand!.blindSeat === 0 ? s.a : s.b;
    await s.table.act(notToAct.id, { type: 'check' });
    expect(s.inbox[notToAct.id]!.at(-1)).toEqual({ type: 'error', message: 'not your turn' });
  });

  it('forfeits a player after three timeouts in a row and rates the game', async () => {
    const s = await setup({ actionMs: 15 });
    tables.push(s.table);
    await s.table.start();
    const firstButton = s.table.game.hand!.button;
    await s.done;
    // Each preflop timeout folds the button for free, so the first button times out on hands 1, 3 and 5.
    expect(s.table.game.result).toEqual({ winner: firstButton === 0 ? 1 : 0, reason: 'forfeit', handsPlayed: 5 });
    const game = s.store.games.get(s.gameId)!;
    expect(game).toMatchObject({ status: 'finished', endReason: 'forfeit', handsPlayed: 5 });
    expect(game.hands).toHaveLength(4);
    const loser = firstButton === 0 ? s.a : s.b;
    expect(s.inbox[loser.id]!.at(-1)).toMatchObject({ type: 'game.end', outcome: 'loss', ratingChange: -16, newRating: 1184 });
  });

  it('ends the game on resign', async () => {
    const s = await setup();
    tables.push(s.table);
    await s.table.start();
    await s.table.resign(s.b.id);
    await s.done;
    expect(s.store.users.get(s.a.id)!.rating).toBe(1216);
    expect(s.store.users.get(s.b.id)!.rating).toBe(1184);
    expect(s.inbox[s.b.id]!.at(-1)).toMatchObject({ type: 'game.end', outcome: 'loss' });
  });
});
