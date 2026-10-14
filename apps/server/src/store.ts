import { randomUUID } from 'node:crypto';
import { type ActionRecord, type Card, STARTING_RATING, rateGame } from '@heads-up/engine';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  rating: number;
  gamesPlayed: number;
  createdAt: Date;
}

export interface HandRecord {
  number: number;
  buttonPlayerId: string;
  holeCards: [[Card, Card], [Card, Card]];
  board: Card[];
  actions: ActionRecord[];
  player1StackAfter: number;
  player2StackAfter: number;
}

export type GameOutcome = 'player1_win' | 'player2_win' | 'draw';
export type EndReason = 'threshold' | 'forfeit' | 'draw';

export interface FinishedGame {
  player1: { id: string; ratingBefore: number; ratingAfter: number; change: number };
  player2: { id: string; ratingBefore: number; ratingAfter: number; change: number };
}

export interface HistoryEntry {
  gameId: string;
  endedAt: Date;
  opponent: { id: string; username: string };
  outcome: 'win' | 'loss' | 'draw';
  ratingBefore: number;
  ratingChange: number;
  endReason: EndReason;
  handsPlayed: number;
}

export interface Store {
  findUserById(id: string): Promise<UserRecord | null>;
  /** Finds the user with this email, creating them if new. */
  upsertUser(email: string, username: string): Promise<UserRecord>;
  /** Records a new active game and both players' current ratings. */
  createGame(player1Id: string, player2Id: string): Promise<string>;
  saveHand(gameId: string, hand: HandRecord): Promise<void>;
  /** Ends a game and applies both rating changes in one transaction. */
  finishGame(gameId: string, outcome: GameOutcome, endReason: EndReason, handsPlayed: number): Promise<FinishedGame>;
  /** Marks every active game aborted and unrated (run at startup). */
  abortActiveGames(): Promise<number>;
  history(userId: string, limit?: number): Promise<HistoryEntry[]>;
}

/** Score for player 1 in Elo terms. */
export const player1Score = (outcome: GameOutcome) => (outcome === 'player1_win' ? 1 : outcome === 'draw' ? 0.5 : 0);

interface MemGame {
  id: string;
  player1Id: string;
  player2Id: string;
  status: 'active' | 'finished' | 'aborted';
  result: GameOutcome | null;
  endReason: EndReason | null;
  handsPlayed: number;
  player1RatingBefore: number;
  player2RatingBefore: number;
  player1RatingChange: number | null;
  player2RatingChange: number | null;
  endedAt: Date | null;
  hands: HandRecord[];
}

/** In-memory store for tests and local play without a database. */
export class MemoryStore implements Store {
  users = new Map<string, UserRecord>();
  games = new Map<string, MemGame>();

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async upsertUser(email: string, username: string) {
    for (const u of this.users.values()) if (u.email === email) return u;
    for (const u of this.users.values()) if (u.username === username) throw new Error('username taken');
    const user: UserRecord = { id: randomUUID(), username, email, rating: STARTING_RATING, gamesPlayed: 0, createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }

  async createGame(player1Id: string, player2Id: string) {
    const id = randomUUID();
    this.games.set(id, {
      id, player1Id, player2Id, status: 'active', result: null, endReason: null, handsPlayed: 0,
      player1RatingBefore: this.users.get(player1Id)!.rating,
      player2RatingBefore: this.users.get(player2Id)!.rating,
      player1RatingChange: null, player2RatingChange: null, endedAt: null, hands: [],
    });
    return id;
  }

  async saveHand(gameId: string, hand: HandRecord) {
    this.games.get(gameId)!.hands.push(structuredClone(hand));
  }

  async finishGame(gameId: string, outcome: GameOutcome, endReason: EndReason, handsPlayed: number): Promise<FinishedGame> {
    const g = this.games.get(gameId)!;
    if (g.status !== 'active') throw new Error('game is not active');
    const p1 = this.users.get(g.player1Id)!;
    const p2 = this.users.get(g.player2Id)!;
    const r = rateGame(p1.rating, p2.rating, player1Score(outcome));
    const before = [p1.rating, p2.rating] as const;
    Object.assign(g, { status: 'finished', result: outcome, endReason, handsPlayed, player1RatingChange: r.changeA, player2RatingChange: r.changeB, endedAt: new Date() });
    p1.rating = r.newA;
    p2.rating = r.newB;
    p1.gamesPlayed++;
    p2.gamesPlayed++;
    return {
      player1: { id: p1.id, ratingBefore: before[0], ratingAfter: r.newA, change: r.changeA },
      player2: { id: p2.id, ratingBefore: before[1], ratingAfter: r.newB, change: r.changeB },
    };
  }

  async abortActiveGames() {
    let n = 0;
    for (const g of this.games.values()) if (g.status === 'active') { g.status = 'aborted'; n++; }
    return n;
  }

  async history(userId: string, limit = 50): Promise<HistoryEntry[]> {
    return [...this.games.values()]
      .filter((g) => g.status === 'finished' && (g.player1Id === userId || g.player2Id === userId))
      .sort((a, b) => b.endedAt!.getTime() - a.endedAt!.getTime())
      .slice(0, limit)
      .map((g) => toHistory(userId, g, (id) => this.users.get(id)!.username));
  }
}

export function toHistory(
  userId: string,
  g: Pick<MemGame, 'id' | 'player1Id' | 'player2Id' | 'result' | 'endReason' | 'handsPlayed' | 'player1RatingBefore' | 'player2RatingBefore' | 'player1RatingChange' | 'player2RatingChange' | 'endedAt'>,
  usernameOf: (id: string) => string,
): HistoryEntry {
  const isP1 = g.player1Id === userId;
  const opponentId = isP1 ? g.player2Id : g.player1Id;
  const won = g.result === (isP1 ? 'player1_win' : 'player2_win');
  return {
    gameId: g.id,
    endedAt: g.endedAt!,
    opponent: { id: opponentId, username: usernameOf(opponentId) },
    outcome: g.result === 'draw' ? 'draw' : won ? 'win' : 'loss',
    ratingBefore: isP1 ? g.player1RatingBefore : g.player2RatingBefore,
    ratingChange: (isP1 ? g.player1RatingChange : g.player2RatingChange) ?? 0,
    endReason: g.endReason!,
    handsPlayed: g.handsPlayed,
  };
}
