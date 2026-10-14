import { describe, expect, it } from 'vitest';
import { type Card, HandCategory, evaluate } from '../src/index.js';

const h = (s: string) => s.split(' ') as Card[];
const cat = (s: string) => evaluate(h(s)).category;
const score = (s: string) => evaluate(h(s)).score;

describe('evaluate', () => {
  it('finds each category', () => {
    expect(cat('As Ks Qs Js Ts 2c 3d')).toBe(HandCategory.StraightFlush);
    expect(cat('9c 9d 9h 9s 2c 3d 4h')).toBe(HandCategory.Quads);
    expect(cat('9c 9d 9h 2s 2c 3d 4h')).toBe(HandCategory.FullHouse);
    expect(cat('Ah 9h 7h 4h 2h Kc Qd')).toBe(HandCategory.Flush);
    expect(cat('5c 6d 7h 8s 9c Kd 2h')).toBe(HandCategory.Straight);
    expect(cat('9c 9d 9h 2s 5c Jd 4h')).toBe(HandCategory.Trips);
    expect(cat('9c 9d 2h 2s 5c Jd 4h')).toBe(HandCategory.TwoPair);
    expect(cat('9c 9d 2h 7s 5c Jd 4h')).toBe(HandCategory.Pair);
    expect(cat('9c Td 2h 7s 5c Jd 4h')).toBe(HandCategory.HighCard);
  });

  it('treats A-2-3-4-5 as the lowest straight', () => {
    expect(cat('Ac 2d 3h 4s 5c')).toBe(HandCategory.Straight);
    expect(score('Ac 2d 3h 4s 5c')).toBeLessThan(score('2c 3d 4h 5s 6c'));
  });

  it('breaks ties with kickers', () => {
    expect(score('Ac Ad Kh 7s 5c')).toBeGreaterThan(score('As Ah Qh 7d 5d'));
    expect(score('Kc Kd 2h 2s Ac')).toBeGreaterThan(score('Ks Kh 2d 2c Qc'));
    expect(score('Ac Ad Kh 7s 5c')).toBe(score('As Ah Kd 7d 5d'));
  });

  it('picks the best five of seven', () => {
    // Board plays: both have the same straight.
    expect(score('2c 3d 9h Ts Jc Qd Kh')).toBe(score('2h 4d 9h Ts Jc Qd Kh'));
    // Full house beats flush on a paired, three-flush board.
    expect(score('Kh Kd Ks 7s 2s 2d 9c')).toBeGreaterThan(score('As 4s Ks 7s 2s 2d 9c'));
  });
});
