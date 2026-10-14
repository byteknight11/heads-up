import { describe, expect, it } from 'vitest';
import { Matchmaker, ratingWindow } from '../src/matchmaker.js';

const ids = (pairs: ReturnType<Matchmaker['tick']>) => pairs.map(([a, b]) => [a.userId, b.userId]);

describe('ratingWindow', () => {
  it('starts at 100, grows 50 every 5 seconds, and opens fully at 30 seconds', () => {
    expect([0, 4_999, 5_000, 12_000, 29_999, 30_000].map(ratingWindow)).toEqual([100, 100, 150, 200, 350, Infinity]);
  });
});

describe('Matchmaker', () => {
  it('pairs players within the window', () => {
    const m = new Matchmaker();
    m.join('a', 1200, 0);
    m.join('b', 1290, 0);
    expect(ids(m.tick(0))).toEqual([['a', 'b']]);
    expect(m.size).toBe(0);
  });

  it('waits until the window covers the gap', () => {
    const m = new Matchmaker();
    m.join('a', 1200, 0);
    m.join('b', 1420, 0);
    expect(m.tick(9_000)).toEqual([]);
    expect(ids(m.tick(15_000))).toEqual([['a', 'b']]); // window 250
  });

  it('matches anyone after 30 seconds', () => {
    const m = new Matchmaker();
    m.join('a', 800, 0);
    m.join('b', 2000, 29_000);
    expect(ids(m.tick(30_000))).toEqual([['a', 'b']]);
  });

  it('prefers the closest rating', () => {
    const m = new Matchmaker();
    m.join('a', 1200, 0);
    m.join('far', 1290, 1);
    m.join('near', 1210, 2);
    expect(ids(m.tick(3))).toEqual([['a', 'near']]);
    expect(m.has('far')).toBe(true);
  });

  it('does not queue a player twice, and lets them leave', () => {
    const m = new Matchmaker();
    m.join('a', 1200, 0);
    m.join('a', 1200, 0);
    expect(m.size).toBe(1);
    expect(m.leave('a')).toBe(true);
    expect(m.tick(0)).toEqual([]);
  });
});
