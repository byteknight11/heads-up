import { z } from 'zod';
import type { GameResult, playerView } from '@heads-up/engine';

/** Messages a client may send over the socket. */
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queue.join') }),
  z.object({ type: z.literal('queue.leave') }),
  z.object({
    type: z.literal('action'),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('fold') }),
      z.object({ type: z.literal('check') }),
      z.object({ type: z.literal('call') }),
      z.object({ type: z.literal('bet'), amount: z.number().int().positive() }),
      z.object({ type: z.literal('raise'), amount: z.number().int().positive() }),
      z.object({ type: z.literal('allin') }),
    ]),
  }),
  /** Leave the game; counts as a forfeit. */
  z.object({ type: z.literal('resign') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface PublicPlayer {
  id: string;
  username: string;
  rating: number;
}

export type PlayerView = ReturnType<typeof playerView>;

/** Messages the server sends. */
export type ServerMessage =
  /** `inGame` tells a reconnecting client whether its game is still running. */
  | { type: 'hello'; user: PublicPlayer; inGame: boolean }
  | { type: 'queue.joined' }
  | { type: 'queue.left' }
  | { type: 'match.found'; gameId: string; you: PublicPlayer; opponent: PublicPlayer; seat: 0 | 1 }
  | { type: 'hand.start'; view: PlayerView }
  | { type: 'state'; view: PlayerView; deadline: number | null }
  | { type: 'hand.end'; view: PlayerView }
  | {
      type: 'game.end';
      gameId: string;
      result: GameResult;
      /** 'win' | 'loss' | 'draw' from this player's point of view. */
      outcome: 'win' | 'loss' | 'draw';
      ratingChange: number | null;
      newRating: number;
    }
  | { type: 'error'; message: string };
