export interface QueueEntry {
  userId: string;
  rating: number;
  joinedAt: number;
}

export const INITIAL_WINDOW = 100;
export const WINDOW_STEP = 50;
export const STEP_MS = 5_000;
export const UNLIMITED_AFTER_MS = 30_000;

/** Rating difference a player who has waited `waitedMs` will accept. */
export function ratingWindow(waitedMs: number): number {
  if (waitedMs >= UNLIMITED_AFTER_MS) return Infinity;
  return INITIAL_WINDOW + WINDOW_STEP * Math.floor(waitedMs / STEP_MS);
}

/** Pairs waiting players with the closest rating, widening the window over time. */
export class Matchmaker {
  private queue: QueueEntry[] = [];

  join(userId: string, rating: number, now: number): void {
    if (!this.has(userId)) this.queue.push({ userId, rating, joinedAt: now });
  }

  leave(userId: string): boolean {
    const before = this.queue.length;
    this.queue = this.queue.filter((e) => e.userId !== userId);
    return this.queue.length < before;
  }

  has(userId: string): boolean {
    return this.queue.some((e) => e.userId === userId);
  }

  get size(): number {
    return this.queue.length;
  }

  /** Removes and returns every pair that can be matched now, longest waiters first. */
  tick(now: number): Array<[QueueEntry, QueueEntry]> {
    const pairs: Array<[QueueEntry, QueueEntry]> = [];
    const waiting = [...this.queue].sort((a, b) => a.joinedAt - b.joinedAt);
    const taken = new Set<string>();
    for (const a of waiting) {
      if (taken.has(a.userId)) continue;
      let best: QueueEntry | undefined;
      for (const b of waiting) {
        if (b === a || taken.has(b.userId)) continue;
        const diff = Math.abs(a.rating - b.rating);
        const window = Math.max(ratingWindow(now - a.joinedAt), ratingWindow(now - b.joinedAt));
        if (diff > window) continue;
        if (!best || diff < Math.abs(a.rating - best.rating)) best = b;
      }
      if (best) {
        taken.add(a.userId).add(best.userId);
        pairs.push([a, best]);
      }
    }
    this.queue = this.queue.filter((e) => !taken.has(e.userId));
    return pairs;
  }
}
