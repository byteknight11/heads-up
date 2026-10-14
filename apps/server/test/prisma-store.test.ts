import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaStore } from '../src/prisma-store.js';

// Runs against a real Postgres when TEST_DATABASE_URL is set (with migrations applied).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PrismaStore', () => {
  let db: PrismaClient;
  let store: PrismaStore;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    store = new PrismaStore(db);
    await db.hand.deleteMany();
    await db.game.deleteMany();
    await db.user.deleteMany();
  });
  afterAll(() => db?.$disconnect());

  it('records a game, its hands and the rating change in one go', async () => {
    const a = await store.upsertUser('a@x', 'alice');
    const b = await store.upsertUser('b@x', 'bob');
    expect(await store.upsertUser('a@x', 'ignored')).toMatchObject({ id: a.id, username: 'alice', rating: 1200 });
    expect((await store.upsertUser('z@x', 'alice')).username).toMatch(/^alice_\d{4}$/);

    const gameId = await store.createGame(a.id, b.id);
    await store.saveHand(gameId, {
      number: 1,
      buttonPlayerId: a.id,
      holeCards: [['As', 'Ah'], ['7d', '2c']],
      board: ['Kd', '9s', '4h', '3c', 'Jh'],
      actions: [{ seat: 1, street: 'preflop', type: 'blind', chips: 2, to: 2, allIn: false }],
      player1StackAfter: 200,
      player2StackAfter: 0,
    });
    const finished = await store.finishGame(gameId, 'player1_win', 'threshold', 1);
    expect(finished.player1).toMatchObject({ ratingBefore: 1200, ratingAfter: 1216, change: 16 });
    expect(await store.findUserById(b.id)).toMatchObject({ rating: 1184, gamesPlayed: 1 });
    await expect(store.finishGame(gameId, 'draw', 'draw', 1)).rejects.toThrow('not active');

    const [h] = await store.history(b.id);
    expect(h).toMatchObject({ outcome: 'loss', ratingBefore: 1200, ratingChange: -16, opponent: { username: 'alice' }, endReason: 'threshold' });
  });

  it('aborts games left active by a restart', async () => {
    const [a, b] = await Promise.all([store.upsertUser('c@x', 'carol'), store.upsertUser('d@x', 'dave')]);
    const gameId = await store.createGame(a.id, b.id);
    expect(await store.abortActiveGames()).toBe(1);
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ status: 'aborted', player1RatingChange: null });
  });
});
