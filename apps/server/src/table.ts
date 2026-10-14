import {
  type Action,
  type GameState,
  IllegalActionError,
  type Seat,
  applyAction,
  createGame,
  forfeit,
  playerView,
  startHand,
  timeoutAction,
  toAct,
} from '@heads-up/engine';
import type { PublicPlayer, ServerMessage } from './protocol.js';
import type { EndReason, FinishedGame, GameOutcome, Store } from './store.js';

export const ACTION_MS = 30_000;
export const BETWEEN_HANDS_MS = 2_000;
export const MAX_TIMEOUTS = 3;

export interface TableOptions {
  gameId: string;
  /** Seat 0 is player 1, seat 1 is player 2. */
  players: [PublicPlayer, PublicPlayer];
  store: Store;
  send: (userId: string, msg: ServerMessage) => void;
  onEnd: (table: GameTable, finished: FinishedGame) => void;
  actionMs?: number;
  betweenHandsMs?: number;
  /** Overrides the shuffle; for tests. */
  game?: GameState;
}

/** Runs one live game: dealing, clocks, persistence and the final rating update. */
export class GameTable {
  readonly gameId: string;
  readonly players: [PublicPlayer, PublicPlayer];
  private state: GameState;
  private timer: NodeJS.Timeout | undefined;
  private deadline: number | null = null;
  private timeouts: [number, number] = [0, 0];
  /** Serializes all state changes so persistence stays in order. */
  private chain: Promise<void> = Promise.resolve();
  private readonly actionMs: number;
  private readonly betweenHandsMs: number;

  constructor(private readonly opts: TableOptions) {
    this.gameId = opts.gameId;
    this.players = opts.players;
    this.state = opts.game ?? createGame();
    this.actionMs = opts.actionMs ?? ACTION_MS;
    this.betweenHandsMs = opts.betweenHandsMs ?? BETWEEN_HANDS_MS;
  }

  get game(): GameState {
    return this.state;
  }

  seatOf(userId: string): Seat | null {
    return this.players[0].id === userId ? 0 : this.players[1].id === userId ? 1 : null;
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      for (const seat of [0, 1] as const) this.sendMatchFound(seat);
      this.dealHand();
    });
  }

  act(userId: string, action: Action): Promise<void> {
    return this.enqueue(async () => {
      const seat = this.seatOf(userId);
      if (seat === null || this.state.status !== 'in_hand') return;
      try {
        this.state = applyAction(this.state, seat, action);
      } catch (e) {
        if (e instanceof IllegalActionError) return this.opts.send(userId, { type: 'error', message: e.message });
        throw e;
      }
      this.timeouts[seat] = 0;
      await this.afterAction();
    });
  }

  resign(userId: string): Promise<void> {
    return this.enqueue(async () => {
      const seat = this.seatOf(userId);
      if (seat === null || this.state.status === 'finished') return;
      this.state = forfeit(this.state, seat);
      await this.finish();
    });
  }

  /** Re-sends everything a reconnecting player needs to redraw the table. */
  resync(userId: string): void {
    const seat = this.seatOf(userId);
    if (seat === null) return;
    this.sendMatchFound(seat);
    this.opts.send(userId, { type: 'state', view: playerView(this.state, seat), deadline: this.deadline });
  }

  /** Stops timers without rating the game (server shutdown). */
  stop(): void {
    clearTimeout(this.timer);
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn).catch((e) => console.error(`table ${this.gameId}:`, e));
    return this.chain;
  }

  private sendMatchFound(seat: Seat) {
    const you = this.players[seat];
    const opponent = this.players[seat === 0 ? 1 : 0];
    this.opts.send(you.id, { type: 'match.found', gameId: this.gameId, you, opponent, seat });
  }

  private dealHand() {
    this.state = startHand(this.state);
    for (const seat of [0, 1] as const) this.opts.send(this.players[seat].id, { type: 'hand.start', view: playerView(this.state, seat) });
    this.armClock();
    this.broadcastState();
  }

  private async afterAction() {
    if (this.state.status === 'in_hand') {
      this.armClock();
      this.broadcastState();
      return;
    }
    clearTimeout(this.timer);
    this.deadline = null;
    await this.recordHand();
    for (const seat of [0, 1] as const) this.opts.send(this.players[seat].id, { type: 'hand.end', view: playerView(this.state, seat) });
    if (this.state.status === 'finished') {
      await this.finish();
    } else {
      this.timer = setTimeout(
        () =>
          this.enqueue(async () => {
            if (this.state.status === 'between_hands') this.dealHand();
          }),
        this.betweenHandsMs,
      );
    }
  }

  private armClock() {
    clearTimeout(this.timer);
    this.deadline = Date.now() + this.actionMs;
    this.timer = setTimeout(() => this.enqueue(() => this.onTimeout()), this.actionMs);
  }

  private async onTimeout() {
    const seat = toAct(this.state);
    if (seat === null) return;
    this.timeouts[seat]++;
    if (this.timeouts[seat] >= MAX_TIMEOUTS) {
      this.state = forfeit(this.state, seat);
      return this.finish();
    }
    this.state = applyAction(this.state, seat, timeoutAction(this.state));
    await this.afterAction();
  }

  private broadcastState() {
    for (const seat of [0, 1] as const) {
      this.opts.send(this.players[seat].id, { type: 'state', view: playerView(this.state, seat), deadline: this.deadline });
    }
  }

  private async recordHand() {
    const h = this.state.lastHand!;
    await this.opts.store.saveHand(this.gameId, {
      number: h.number,
      buttonPlayerId: this.players[h.button].id,
      holeCards: h.holeCards,
      board: h.board,
      actions: h.actions,
      player1StackAfter: h.stacksAfter[0],
      player2StackAfter: h.stacksAfter[1],
    });
  }

  private async finish() {
    clearTimeout(this.timer);
    this.deadline = null;
    const result = this.state.result!;
    const outcome: GameOutcome = result.winner === null ? 'draw' : result.winner === 0 ? 'player1_win' : 'player2_win';
    const reason: EndReason = result.reason;
    const finished = await this.opts.store.finishGame(this.gameId, outcome, reason, result.handsPlayed);
    for (const seat of [0, 1] as const) {
      const mine = seat === 0 ? finished.player1 : finished.player2;
      this.opts.send(this.players[seat].id, {
        type: 'game.end',
        gameId: this.gameId,
        result,
        outcome: result.winner === null ? 'draw' : result.winner === seat ? 'win' : 'loss',
        ratingChange: mine.change,
        newRating: mine.ratingAfter,
      });
    }
    this.opts.onEnd(this, finished);
  }
}
