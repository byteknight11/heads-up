export const STARTING_RATING = 1200;
export const K_FACTOR = 32;
export const RATING_FLOOR = 100;

/** Expected score of a player rated `rating` against `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/**
 * New ratings after a game. `scoreA` is 1 if A won, 0.5 for a draw, 0 if A lost.
 * Changes are rounded to whole points; ratings never drop below the floor.
 */
export function rateGame(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, k = K_FACTOR) {
  const changeA = Math.round(k * (scoreA - expectedScore(ratingA, ratingB)));
  // B's change mirrors A's so rounding never creates or destroys a point.
  const changeB = -changeA;
  const newA = Math.max(RATING_FLOOR, ratingA + changeA);
  const newB = Math.max(RATING_FLOOR, ratingB + changeB);
  return { newA, newB, changeA: newA - ratingA, changeB: newB - ratingB };
}
