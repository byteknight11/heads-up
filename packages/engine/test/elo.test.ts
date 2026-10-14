import { describe, expect, it } from 'vitest';
import { expectedScore, rateGame } from '../src/index.js';

describe('elo', () => {
  it('gives equal players an expected score of 0.5', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
    expect(rateGame(1200, 1200, 1)).toEqual({ newA: 1216, newB: 1184, changeA: 16, changeB: -16 });
  });

  it('rewards an upset more than an expected win', () => {
    expect(rateGame(1400, 1200, 1).changeA).toBe(8);
    expect(rateGame(1200, 1400, 1).changeA).toBe(24);
  });

  it('moves a draw toward the lower-rated player', () => {
    const r = rateGame(1400, 1200, 0.5);
    expect(r.changeA).toBe(-8);
    expect(r.changeB).toBe(8);
  });

  it('never drops below the floor', () => {
    expect(rateGame(110, 110, 0)).toMatchObject({ newA: 100, changeA: -10 });
  });
});
