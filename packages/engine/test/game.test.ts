import { describe, expect, it } from 'vitest';
import {
  type Card,
  type GameState,
  type Seat,
  IllegalActionError,
  applyAction,
  createGame,
  eliminationThreshold,
  forfeit,
  fullDeck,
  legalActions,
  playerView,
  startHand,
  timeoutAction,
} from '../src/index.js';

/** Deck whose first cards are: seat0 c1, seat1 c1, seat0 c2, seat1 c2, then the board. */
function deck(first: string): Card[] {
  const top = first.split(' ') as Card[];
  return [...top, ...fullDeck().filter((c) => !top.includes(c))];
}

// Seat 0 holds aces, seat 1 holds 7-2; the board gives seat 0 the win.
const ACES_WIN = deck('As 7d Ah 2c Kd 9s 4h 3c Jh');
// Same board, identical strength: both play the board (a royal flush).
const CHOP = deck('2s 3s 4d 5d Ah Kh Qh Jh Th');

function play(state: GameState, ...moves: Array<[Seat, Parameters<typeof applyAction>[2]]>) {
  for (const [seat, action] of moves) state = applyAction(state, seat, action);
  return state;
}

describe('blinds and order', () => {
  it('has the non-button post 2 and the button act first preflop', () => {
    const g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    expect(g.stacks).toEqual([100, 98]);
    expect(g.hand!.blindSeat).toBe(1);
    expect(legalActions(g)).toMatchObject({ seat: 0, canCheck: false, callAmount: 2, minRaiseTo: 4, maxRaiseTo: 100 });
  });

  it('gives the blind an option after a call, then the blind acts first postflop', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'call' });
    expect(legalActions(g)).toMatchObject({ seat: 1, canCheck: true, minRaiseTo: 4 });
    g = applyAction(g, 1, { type: 'check' });
    expect(g.hand!.street).toBe('flop');
    expect(g.hand!.board).toEqual(['Kd', '9s', '4h']);
    expect(legalActions(g)).toMatchObject({ seat: 1, raiseType: 'bet', minRaiseTo: 2 });
  });

  it('alternates the button each hand', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'fold' });
    g = startHand(g, { deck: ACES_WIN });
    expect(g.hand!.button).toBe(1);
    expect(g.hand!.blindSeat).toBe(0);
  });

  it('rejects out-of-turn and illegal actions', () => {
    const g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    expect(() => applyAction(g, 1, { type: 'check' })).toThrow(IllegalActionError);
    expect(() => applyAction(g, 0, { type: 'check' })).toThrow(IllegalActionError);
    expect(() => applyAction(g, 0, { type: 'raise', amount: 3 })).toThrow(/minimum is 4/);
    expect(() => applyAction(g, 0, { type: 'raise', amount: 101 })).toThrow(/maximum is 100/);
    expect(() => applyAction(g, 0, { type: 'bet', amount: 10 })).toThrow(/use raise/);
  });
});

describe('betting', () => {
  it('sets the min re-raise from the last raise size', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'raise', amount: 8 }); // raise of 6
    expect(legalActions(g)).toMatchObject({ seat: 1, callAmount: 6, minRaiseTo: 14 });
  });

  it('a fold gives the pot to the other player', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = play(g, [0, { type: 'raise', amount: 6 }], [1, { type: 'fold' }]);
    expect(g.stacks).toEqual([102, 98]);
    expect(g.lastHand).toMatchObject({ winners: [0], pot: 8, showdown: false });
  });

  it('costs the button nothing to fold preflop', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'fold' });
    expect(g.stacks).toEqual([100, 100]);
  });

  it('plays a full hand to showdown', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = play(g,
      [0, { type: 'raise', amount: 6 }], [1, { type: 'call' }],
      [1, { type: 'check' }], [0, { type: 'bet', amount: 10 }], [1, { type: 'call' }],
      [1, { type: 'check' }], [0, { type: 'check' }],
      [1, { type: 'check' }], [0, { type: 'check' }],
    );
    expect(g.lastHand).toMatchObject({ showdown: true, winners: [0], pot: 32 });
    expect(g.stacks).toEqual([116, 84]);
    expect(g.lastHand!.board).toHaveLength(5);
  });

  it('splits a chopped pot evenly', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: CHOP });
    g = play(g, [0, { type: 'allin' }], [1, { type: 'call' }]);
    expect(g.lastHand!.winners).toEqual([0, 1]);
    expect(g.stacks).toEqual([100, 100]);
  });

  it('runs out the board when a player is all-in', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = play(g, [0, { type: 'allin' }], [1, { type: 'call' }]);
    expect(g.status).toBe('finished');
    expect(g.stacks).toEqual([200, 0]);
    expect(g.result).toEqual({ winner: 0, reason: 'threshold', handsPlayed: 1 });
  });

  it('returns the uncalled part of a bet', () => {
    // Seat 0 short-stacked at 30, seat 1 shoves 100: seat 1 gets 70 back.
    let g: GameState = { ...createGame({ firstButton: 1 }), stacks: [30, 170] };
    g = startHand(g, { deck: ACES_WIN }); // seat 0 posts the blind
    g = play(g, [1, { type: 'allin' }], [0, { type: 'call' }]);
    expect(g.lastHand!.pot).toBe(60);
    expect(g.stacks).toEqual([60, 140]);
  });

  it('skips the blind when a short button calls all-in', () => {
    // Button has 1 chip and calls the 2-chip blind all-in: nothing is left to decide.
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [1, 199], handNumber: 1 };
    g = startHand(g, { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'call' });
    expect(g.status).not.toBe('in_hand');
    expect(g.lastHand).toMatchObject({ pot: 2, winners: [0], showdown: true });
    expect(g.stacks).toEqual([2, 198]);
  });

  it('does not reopen raising after a short all-in', () => {
    // Seat 1 (blind) has 9 chips. Button raises to 6, blind shoves to 9 (a raise of 3 < 4).
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [191, 9] };
    g = startHand(g, { deck: ACES_WIN });
    g = play(g, [0, { type: 'raise', amount: 6 }], [1, { type: 'allin' }]);
    expect(legalActions(g)).toMatchObject({ seat: 0, callAmount: 3, minRaiseTo: null });
  });

  it('times out to a check when free, otherwise a fold', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    expect(timeoutAction(g)).toEqual({ type: 'fold' });
    g = applyAction(g, 0, { type: 'call' });
    expect(timeoutAction(g)).toEqual({ type: 'check' });
  });
});

describe('elimination threshold', () => {
  it('is 2(n-1) after hand n', () => {
    expect([1, 2, 10, 50, 51].map(eliminationThreshold)).toEqual([0, 2, 18, 98, 100]);
  });

  it('ends the game when a player falls to the threshold', () => {
    // Before hand 10: seat 1 has 19 and will lose 2 chips, leaving 17 <= 18.
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [181, 19], handNumber: 9 };
    g = startHand(g, { deck: ACES_WIN });
    g = play(g, [0, { type: 'raise', amount: 4 }], [1, { type: 'fold' }]);
    expect(g.stacks).toEqual([183, 17]);
    expect(g.result).toEqual({ winner: 0, reason: 'threshold', handsPlayed: 10 });
  });

  it('keeps going while both players are above the threshold', () => {
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [100, 100], handNumber: 49 };
    g = startHand(g, { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'fold' }); // 100 vs 100 after hand 50; threshold 98
    expect(g.status).toBe('between_hands');
  });

  it('ends at hand 50 when a player drops to 98', () => {
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [100, 100], handNumber: 49 };
    g = startHand(g, { deck: ACES_WIN });
    g = play(g, [0, { type: 'raise', amount: 4 }], [1, { type: 'fold' }]);
    expect(g.result).toEqual({ winner: 0, reason: 'threshold', handsPlayed: 50 });
  });

  it('is a draw at 100-100 after hand 51', () => {
    let g: GameState = { ...createGame({ firstButton: 0 }), stacks: [100, 100], handNumber: 50 };
    g = startHand(g, { deck: CHOP });
    g = play(g, [0, { type: 'call' }], [1, { type: 'check' }],
      [1, { type: 'check' }], [0, { type: 'check' }],
      [1, { type: 'check' }], [0, { type: 'check' }],
      [1, { type: 'check' }], [0, { type: 'check' }]);
    expect(g.stacks).toEqual([100, 100]);
    expect(g.result).toEqual({ winner: null, reason: 'draw', handsPlayed: 51 });
  });

  it('cannot start a hand after the game ends', () => {
    const g = forfeit(startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN }), 0);
    expect(g.result).toEqual({ winner: 1, reason: 'forfeit', handsPlayed: 1 });
    expect(() => startHand(g)).toThrow(IllegalActionError);
  });
});

describe('playerView', () => {
  it('hides the deck and the opponent cards', () => {
    const g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    const v = playerView(g, 1);
    expect(v.hand!.yourCards).toEqual(['7d', '2c']);
    expect(JSON.stringify(v)).not.toContain('As');
    expect(v.legal).toBeNull();
  });

  it('hides a folded opponent hand afterwards', () => {
    let g = startHand(createGame({ firstButton: 0 }), { deck: ACES_WIN });
    g = applyAction(g, 0, { type: 'fold' });
    expect(playerView(g, 1).lastHand!.holeCards).toEqual([null, ['7d', '2c']]);
  });
});

describe('random games', () => {
  it('conserves 200 chips and always ends by hand 51', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let game = 0; game < 300; game++) {
      let g = createGame({ randomInt: rnd });
      while (g.status !== 'finished') {
        g = startHand(g, { randomInt: rnd });
        while (g.status === 'in_hand') {
          const l = legalActions(g)!;
          const r = rnd(10);
          let a: Parameters<typeof applyAction>[2];
          if (r === 0) a = { type: 'fold' };
          else if (r < 3 && l.minRaiseTo !== null) a = { type: l.raiseType, amount: l.minRaiseTo + rnd(l.maxRaiseTo! - l.minRaiseTo + 1) };
          else a = l.canCheck ? { type: 'check' } : { type: 'call' };
          g = applyAction(g, l.seat, a);
          expect(g.stacks[0] + g.stacks[1] + (g.hand ? g.hand.committed[0] + g.hand.committed[1] : 0)).toBe(200);
        }
      }
      expect(g.result!.handsPlayed).toBeLessThanOrEqual(51);
    }
  });
});
