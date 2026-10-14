import type { Card } from '@heads-up/engine';

const SUIT_SYMBOL = { c: '♣', d: '♦', h: '♥', s: '♠' } as const;

export function cardLabel(card: Card): { rank: string; suit: string; red: boolean } {
  const rank = card[0] === 'T' ? '10' : card[0]!;
  const s = card[1] as keyof typeof SUIT_SYMBOL;
  return { rank, suit: SUIT_SYMBOL[s], red: s === 'd' || s === 'h' };
}
