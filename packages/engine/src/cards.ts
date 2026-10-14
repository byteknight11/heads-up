export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** A card is two characters: rank then suit, e.g. "As", "Td", "2c". */
export type Card = `${Rank}${Suit}`;

/** Returns an integer in [0, n). */
export type RandomInt = (n: number) => number;

export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0] as Rank) + 2;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  return deck;
}

/** Cryptographically secure integer in [0, n), unbiased. */
export const secureRandomInt: RandomInt = (n) => {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const x = buf[0]!;
    if (x < limit) return x % n;
  }
};

/** Fisher-Yates shuffle of a fresh 52-card deck. */
export function shuffledDeck(randomInt: RandomInt = secureRandomInt): Card[] {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}
