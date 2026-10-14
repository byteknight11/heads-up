import { describe, expect, it } from 'vitest';
import { cardLabel } from '../src/lib/cards';

describe('cardLabel', () => {
  it('spells ranks and suits for display', () => {
    expect(cardLabel('Td')).toEqual({ rank: '10', suit: '♦', red: true });
    expect(cardLabel('As')).toEqual({ rank: 'A', suit: '♠', red: false });
  });
});
