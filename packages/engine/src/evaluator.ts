import { type Card, rankValue, suitOf } from './cards.js';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export interface HandValue {
  category: HandCategory;
  /** Higher is better; comparable across all hands. */
  score: number;
  cards: Card[];
}

function encode(category: HandCategory, kickers: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (kickers[i] ?? 0);
  return score;
}

/** Highest card of a straight in these distinct descending ranks, or 0. */
function straightHigh(ranks: number[]): number {
  if (ranks.length !== 5) return 0;
  if (ranks[0]! - ranks[4]! === 4) return ranks[0]!;
  // Wheel: A-2-3-4-5
  if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) return 5;
  return 0;
}

export function evaluateFive(cards: Card[]): HandValue {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Group ranks by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.map(([r]) => r);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const high = straightHigh(ordered);

  let category: HandCategory;
  let kickers = ordered;
  if (high && flush) {
    category = HandCategory.StraightFlush;
    kickers = [high];
  } else if (groups[0]![1] === 4) category = HandCategory.Quads;
  else if (groups[0]![1] === 3 && groups[1]![1] === 2) category = HandCategory.FullHouse;
  else if (flush) category = HandCategory.Flush;
  else if (high) {
    category = HandCategory.Straight;
    kickers = [high];
  } else if (groups[0]![1] === 3) category = HandCategory.Trips;
  else if (groups[0]![1] === 2 && groups[1]![1] === 2) category = HandCategory.TwoPair;
  else if (groups[0]![1] === 2) category = HandCategory.Pair;
  else category = HandCategory.HighCard;

  return { category, score: encode(category, kickers), cards };
}

/** Best five-card hand out of five to seven cards. */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluate needs 5 to 7 cards');
  let best: HandValue | undefined;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluateFive([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}
