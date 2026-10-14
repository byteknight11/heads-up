import { type Card, type RandomInt, secureRandomInt, shuffledDeck } from './cards.js';
import { evaluate } from './evaluator.js';

export type Seat = 0 | 1;
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export const STARTING_STACK = 100;
export const BLIND = 2;

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** Open the betting on a street; `amount` is the total bet. */
  | { type: 'bet'; amount: number }
  /** Raise to `amount` total for this street. */
  | { type: 'raise'; amount: number }
  /** Put every remaining chip in (resolves to call, bet or raise). */
  | { type: 'allin' };

export interface ActionRecord {
  seat: Seat;
  street: Street;
  type: 'blind' | 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /** Chips added to the pot by this action. */
  chips: number;
  /** The seat's total bet on this street after the action. */
  to: number;
  allIn: boolean;
}

export interface HandState {
  number: number;
  button: Seat;
  /** The seat that posts the blind (the non-button player). */
  blindSeat: Seat;
  holeCards: [[Card, Card], [Card, Card]];
  board: Card[];
  /** Undealt cards; never send to clients. */
  deck: Card[];
  street: Street;
  /** Chips each seat has bet on the current street. */
  bets: [number, number];
  /** Chips each seat has put in this hand. */
  committed: [number, number];
  currentBet: number;
  lastRaiseSize: number;
  /** Whether each seat may still raise on this street. */
  raiseOpen: [boolean, boolean];
  /** Seats that must still act on this street, in order. */
  pending: Seat[];
  actions: ActionRecord[];
}

export interface HandSummary {
  number: number;
  button: Seat;
  holeCards: [[Card, Card], [Card, Card]];
  board: Card[];
  actions: ActionRecord[];
  pot: number;
  /** Seats that won chips; both on a split pot. */
  winners: Seat[];
  /** True when the hand went to showdown and both hands were shown. */
  showdown: boolean;
  stacksAfter: [number, number];
}

export type GameStatus = 'between_hands' | 'in_hand' | 'finished';

export interface GameResult {
  /** null for a draw. */
  winner: Seat | null;
  reason: 'threshold' | 'forfeit' | 'draw';
  handsPlayed: number;
}

export interface GameState {
  status: GameStatus;
  stacks: [number, number];
  /** Number of the hand in progress, or of the last finished hand. */
  handNumber: number;
  /** Button for the next hand to start. */
  nextButton: Seat;
  hand: HandState | null;
  lastHand: HandSummary | null;
  result: GameResult | null;
}

export interface LegalActions {
  seat: Seat;
  canFold: boolean;
  canCheck: boolean;
  /** Chips needed to call, or null if calling is not an option. */
  callAmount: number | null;
  /** Bet or raise bounds as a total for the street, or null if not allowed. */
  minRaiseTo: number | null;
  maxRaiseTo: number | null;
  /** 'bet' when no one has bet this street, otherwise 'raise'. */
  raiseType: 'bet' | 'raise';
}

export class IllegalActionError extends Error {}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

/** After hand n, a player at or below this many chips loses. */
export function eliminationThreshold(handNumber: number): number {
  return 2 * (handNumber - 1);
}

export function createGame(opts: { firstButton?: Seat; randomInt?: RandomInt } = {}): GameState {
  const firstButton = opts.firstButton ?? ((opts.randomInt ?? secureRandomInt)(2) as Seat);
  return {
    status: 'between_hands',
    stacks: [STARTING_STACK, STARTING_STACK],
    handNumber: 0,
    nextButton: firstButton,
    hand: null,
    lastHand: null,
    result: null,
  };
}

/** Deals the next hand. `deck` overrides the shuffle (for tests and replays). */
export function startHand(state: GameState, opts: { deck?: Card[]; randomInt?: RandomInt } = {}): GameState {
  if (state.status !== 'between_hands') throw new IllegalActionError(`cannot start a hand while ${state.status}`);
  const s = structuredClone(state);
  const deck = opts.deck ? [...opts.deck] : shuffledDeck(opts.randomInt);
  const button = s.nextButton;
  const blindSeat = other(button);
  const holeCards: [[Card, Card], [Card, Card]] = [
    [deck[0]!, deck[2]!],
    [deck[1]!, deck[3]!],
  ];
  const hand: HandState = {
    number: s.handNumber + 1,
    button,
    blindSeat,
    holeCards,
    board: [],
    deck: deck.slice(4),
    street: 'preflop',
    bets: [0, 0],
    committed: [0, 0],
    currentBet: 0,
    lastRaiseSize: BLIND,
    raiseOpen: [true, true],
    pending: [],
    actions: [],
  };
  s.status = 'in_hand';
  s.handNumber = hand.number;
  s.nextButton = blindSeat;
  s.hand = hand;

  const posted = putIn(s, blindSeat, BLIND);
  hand.currentBet = posted;
  hand.actions.push({ seat: blindSeat, street: 'preflop', type: 'blind', chips: posted, to: posted, allIn: s.stacks[blindSeat] === 0 });
  // Button acts first preflop; the blind gets an option afterwards.
  hand.pending = [button, blindSeat].filter((seat) => s.stacks[seat] > 0);
  return s;
}

/** Seat whose turn it is, or null. */
export function toAct(state: GameState): Seat | null {
  return state.status === 'in_hand' ? (state.hand?.pending[0] ?? null) : null;
}

export function legalActions(state: GameState): LegalActions | null {
  const seat = toAct(state);
  if (seat === null) return null;
  const h = state.hand!;
  const stack = state.stacks[seat];
  const owed = h.currentBet - h.bets[seat];
  const maxTo = h.bets[seat] + stack;
  const opponentHasChips = state.stacks[other(seat)] > 0;
  const canRaise = h.raiseOpen[seat] && opponentHasChips && maxTo > h.currentBet;
  const minTo = h.currentBet === 0 ? BLIND : Math.max(h.currentBet, BLIND) + h.lastRaiseSize;
  return {
    seat,
    canFold: true,
    canCheck: owed === 0,
    callAmount: owed > 0 ? Math.min(owed, stack) : null,
    minRaiseTo: canRaise ? Math.min(minTo, maxTo) : null,
    maxRaiseTo: canRaise ? maxTo : null,
    raiseType: h.currentBet === 0 ? 'bet' : 'raise',
  };
}

/** What the server does when a player's clock runs out: check if legal, otherwise fold. */
export function timeoutAction(state: GameState): Action {
  return legalActions(state)?.canCheck ? { type: 'check' } : { type: 'fold' };
}

export function applyAction(state: GameState, seat: Seat, action: Action): GameState {
  const legal = legalActions(state);
  if (!legal) throw new IllegalActionError('no action expected');
  if (legal.seat !== seat) throw new IllegalActionError('not your turn');

  const s = structuredClone(state);
  const h = s.hand!;
  const record = (type: ActionRecord['type'], chips: number) =>
    h.actions.push({ seat, street: h.street, type, chips, to: h.bets[seat], allIn: s.stacks[seat] === 0 });

  if (action.type === 'allin') {
    if (legal.maxRaiseTo !== null) {
      action = { type: legal.raiseType, amount: legal.maxRaiseTo };
    } else if (legal.callAmount !== null) {
      action = { type: 'call' };
    } else {
      throw new IllegalActionError('cannot go all-in now');
    }
  }

  switch (action.type) {
    case 'fold': {
      record('fold', 0);
      h.pending = [];
      return finishHand(s, other(seat));
    }
    case 'check': {
      if (!legal.canCheck) throw new IllegalActionError('cannot check facing a bet');
      record('check', 0);
      h.raiseOpen[seat] = false;
      h.pending.shift();
      break;
    }
    case 'call': {
      if (legal.callAmount === null) throw new IllegalActionError('nothing to call');
      record('call', putIn(s, seat, legal.callAmount));
      h.raiseOpen[seat] = false;
      h.pending.shift();
      break;
    }
    case 'bet':
    case 'raise': {
      if (action.type !== legal.raiseType) throw new IllegalActionError(`use ${legal.raiseType}, not ${action.type}`);
      if (legal.minRaiseTo === null || legal.maxRaiseTo === null) throw new IllegalActionError(`cannot ${action.type} now`);
      const to = action.amount;
      if (!Number.isInteger(to)) throw new IllegalActionError('amount must be a whole number of chips');
      if (to > legal.maxRaiseTo) throw new IllegalActionError(`maximum is ${legal.maxRaiseTo}`);
      if (to < legal.minRaiseTo) throw new IllegalActionError(`minimum is ${legal.minRaiseTo}`);
      const fullRaise = to - h.currentBet >= h.lastRaiseSize || (h.currentBet === 0 && to >= BLIND);
      const chips = putIn(s, seat, to - h.bets[seat]);
      if (fullRaise) {
        if (h.currentBet > 0) h.lastRaiseSize = to - h.currentBet;
        else h.lastRaiseSize = Math.max(to, BLIND);
        h.raiseOpen[other(seat)] = true;
      }
      // An all-in short of a full raise does not reopen raising for a player who already acted.
      h.currentBet = to;
      h.raiseOpen[seat] = false;
      record(action.type, chips);
      h.pending = s.stacks[other(seat)] > 0 ? [other(seat)] : [];
      break;
    }
  }

  // A player facing an all-in opponent with nothing left to call has no decision to make.
  h.pending = h.pending.filter(
    (p) => s.stacks[p] > 0 && !(s.stacks[other(p)] === 0 && h.bets[p] >= h.bets[other(p)]),
  );
  return h.pending.length === 0 ? endStreet(s) : s;
}

/** Ends the game immediately; `seat` loses. */
export function forfeit(state: GameState, seat: Seat): GameState {
  if (state.status === 'finished') throw new IllegalActionError('game is over');
  const s = structuredClone(state);
  s.status = 'finished';
  s.result = { winner: other(seat), reason: 'forfeit', handsPlayed: s.handNumber };
  return s;
}

/** Moves chips from a stack into the current bet; returns the chips actually moved. */
function putIn(s: GameState, seat: Seat, chips: number): number {
  const h = s.hand!;
  const moved = Math.min(chips, s.stacks[seat]);
  s.stacks[seat] -= moved;
  h.bets[seat] += moved;
  h.committed[seat] += moved;
  return moved;
}

/** Returns any uncalled part of a bet to its owner. */
function returnUncalled(s: GameState): void {
  const h = s.hand!;
  const diff = h.bets[0] - h.bets[1];
  if (diff !== 0) {
    const over: Seat = diff > 0 ? 0 : 1;
    const excess = Math.abs(diff);
    s.stacks[over] += excess;
    h.bets[over] -= excess;
    h.committed[over] -= excess;
  }
}

function endStreet(s: GameState): GameState {
  const h = s.hand!;
  returnUncalled(s);

  const someoneAllIn = s.stacks[0] === 0 || s.stacks[1] === 0;
  if (h.street === 'river' || someoneAllIn) {
    while (h.board.length < 5) h.board.push(h.deck.shift()!);
    return showdown(s);
  }

  h.street = h.street === 'preflop' ? 'flop' : h.street === 'flop' ? 'turn' : 'river';
  h.board.push(...h.deck.splice(0, h.street === 'flop' ? 3 : 1));
  h.bets = [0, 0];
  h.currentBet = 0;
  h.lastRaiseSize = BLIND;
  h.raiseOpen = [true, true];
  // The blind player acts first after the flop.
  h.pending = [h.blindSeat, h.button];
  return s;
}

function showdown(s: GameState): GameState {
  const h = s.hand!;
  const v0 = evaluate([...h.holeCards[0], ...h.board]).score;
  const v1 = evaluate([...h.holeCards[1], ...h.board]).score;
  return finishHand(s, v0 > v1 ? 0 : v1 > v0 ? 1 : null, true);
}

/** Awards the pot (winner null = split) and applies the elimination threshold. */
function finishHand(s: GameState, winner: Seat | null, showdown = false): GameState {
  const h = s.hand!;
  // After a fold, the winner's uncalled bet is theirs, not part of the pot.
  returnUncalled(s);
  const pot = h.committed[0] + h.committed[1];
  let winners: Seat[];
  if (winner === null) {
    const half = Math.floor(pot / 2);
    s.stacks[0] += half;
    s.stacks[1] += half;
    // An odd chip goes to the blind player.
    s.stacks[h.blindSeat] += pot - 2 * half;
    winners = [0, 1];
  } else {
    s.stacks[winner] += pot;
    winners = [winner];
  }

  s.lastHand = {
    number: h.number,
    button: h.button,
    holeCards: h.holeCards,
    board: h.board,
    actions: h.actions,
    pot,
    winners,
    showdown,
    stacksAfter: [s.stacks[0], s.stacks[1]],
  };
  s.hand = null;

  const threshold = eliminationThreshold(h.number);
  const out0 = s.stacks[0] <= threshold;
  const out1 = s.stacks[1] <= threshold;
  if (out0 && out1) {
    s.status = 'finished';
    s.result = { winner: null, reason: 'draw', handsPlayed: h.number };
  } else if (out0 || out1) {
    s.status = 'finished';
    s.result = { winner: out0 ? 1 : 0, reason: 'threshold', handsPlayed: h.number };
  } else {
    s.status = 'between_hands';
  }
  return s;
}

/** What one player may see: no deck, and the opponent's cards only after a showdown. */
export function playerView(state: GameState, seat: Seat) {
  const h = state.hand;
  const last = state.lastHand;
  return {
    status: state.status,
    stacks: state.stacks,
    handNumber: state.handNumber,
    threshold: eliminationThreshold(Math.max(state.handNumber, 1)),
    result: state.result,
    hand: h && {
      number: h.number,
      button: h.button,
      street: h.street,
      board: h.board,
      bets: h.bets,
      pot: h.committed[0] + h.committed[1],
      yourCards: h.holeCards[seat],
      toAct: toAct(state),
      actions: h.actions,
    },
    legal: toAct(state) === seat ? legalActions(state) : null,
    lastHand: last && {
      ...last,
      holeCards: last.showdown ? last.holeCards : seat === 0 ? [last.holeCards[0], null] : [null, last.holeCards[1]],
    },
  };
}
