import { PrismaClient } from '@prisma/client';
import { rateGame } from '@heads-up/engine';
import { type EndReason, type FinishedGame, type GameOutcome, type HandRecord, type Store, player1Score, toHistory } from './store.js';

export class PrismaStore implements Store {
  constructor(readonly db = new PrismaClient()) {}

  findUserById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  upsertUser(email: string, username: string) {
    return this.db.user.upsert({ where: { email }, update: {}, create: { email, username } });
  }

  async createGame(player1Id: string, player2Id: string) {
    const [p1, p2] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: player1Id } }),
      this.db.user.findUniqueOrThrow({ where: { id: player2Id } }),
    ]);
    const game = await this.db.game.create({
      data: { player1Id, player2Id, player1RatingBefore: p1.rating, player2RatingBefore: p2.rating },
    });
    return game.id;
  }

  async saveHand(gameId: string, hand: HandRecord) {
    await this.db.hand.create({
      data: {
        gameId,
        number: hand.number,
        buttonPlayerId: hand.buttonPlayerId,
        holeCards: hand.holeCards,
        board: hand.board,
        actions: hand.actions as object[],
        player1StackAfter: hand.player1StackAfter,
        player2StackAfter: hand.player2StackAfter,
      },
    });
  }

  finishGame(gameId: string, outcome: GameOutcome, endReason: EndReason, handsPlayed: number): Promise<FinishedGame> {
    return this.db.$transaction(async (tx) => {
      const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { player1: true, player2: true } });
      if (g.status !== 'active') throw new Error('game is not active');
      const r = rateGame(g.player1.rating, g.player2.rating, player1Score(outcome));
      await tx.game.update({
        where: { id: gameId },
        data: { status: 'finished', result: outcome, endReason, handsPlayed, player1RatingChange: r.changeA, player2RatingChange: r.changeB, endedAt: new Date() },
      });
      await tx.user.update({ where: { id: g.player1Id }, data: { rating: r.newA, gamesPlayed: { increment: 1 } } });
      await tx.user.update({ where: { id: g.player2Id }, data: { rating: r.newB, gamesPlayed: { increment: 1 } } });
      return {
        player1: { id: g.player1Id, ratingBefore: g.player1.rating, ratingAfter: r.newA, change: r.changeA },
        player2: { id: g.player2Id, ratingBefore: g.player2.rating, ratingAfter: r.newB, change: r.changeB },
      };
    });
  }

  async abortActiveGames() {
    const { count } = await this.db.game.updateMany({ where: { status: 'active' }, data: { status: 'aborted', endedAt: new Date() } });
    return count;
  }

  async history(userId: string, limit = 50) {
    const games = await this.db.game.findMany({
      where: { status: 'finished', OR: [{ player1Id: userId }, { player2Id: userId }] },
      include: { player1: { select: { username: true } }, player2: { select: { username: true } } },
      orderBy: { endedAt: 'desc' },
      take: limit,
    });
    return games.map((g) => toHistory(userId, g, (id) => (id === g.player1Id ? g.player1.username : g.player2.username)));
  }
}
