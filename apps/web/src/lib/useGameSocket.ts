'use client';

import type { Action } from '@heads-up/engine';
import type { PlayerView, PublicPlayer, ServerMessage } from '@heads-up/server/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

const REPLACED = 'Heads Up is open in another tab. Reload this page to play here.';

export type Phase = 'connecting' | 'idle' | 'queued' | 'playing' | 'ended';

export interface Match {
  gameId: string;
  seat: 0 | 1;
  you: PublicPlayer;
  opponent: PublicPlayer;
}

export type GameEnd = Extract<ServerMessage, { type: 'game.end' }>;

export interface GameSocket {
  phase: Phase;
  me: PublicPlayer | null;
  match: Match | null;
  view: PlayerView | null;
  deadline: number | null;
  ended: GameEnd | null;
  error: string | null;
  /** Why the connection keeps failing, while it retries. */
  connectProblem: string | null;
  joinQueue(): void;
  leaveQueue(): void;
  act(action: Action): void;
  resign(): void;
}

/** Holds the connection to the game server and the latest state it sent. */
export function useGameSocket(serverUrl: string): GameSocket {
  const ws = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [me, setMe] = useState<PublicPlayer | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [ended, setEnded] = useState<GameEnd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectProblem, setConnectProblem] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    const onMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'hello':
          setMe(msg.user);
          if (!msg.inGame && phaseRef.current === 'playing') {
            // The game ended while we were disconnected: leave the stale table.
            setError('Your game ended while you were away. Check your profile for the result.');
            setPhase('idle');
          } else if (phaseRef.current === 'connecting') {
            setPhase('idle');
          }
          break;
        case 'queue.joined':
          setEnded(null);
          setPhase('queued');
          break;
        case 'queue.left':
          setPhase('idle');
          break;
        case 'match.found':
          setMatch({ gameId: msg.gameId, seat: msg.seat, you: msg.you, opponent: msg.opponent });
          setEnded(null);
          setPhase('playing');
          break;
        case 'hand.start':
        case 'hand.end':
          setView(msg.view);
          setDeadline(null);
          break;
        case 'state':
          setView(msg.view);
          setDeadline(msg.deadline);
          break;
        case 'game.end':
          setEnded(msg);
          setDeadline(null);
          setMe((m) => (m ? { ...m, rating: msg.newRating } : m));
          setPhase('ended');
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    };

    async function connect() {
      try {
        const res = await fetch('/api/token');
        if (!res.ok) throw new Error('not signed in');
        const { token } = (await res.json()) as { token: string };
        if (closed) return;
        const socket = new WebSocket(`${serverUrl}/play?token=${encodeURIComponent(token)}`);
        ws.current = socket;
        socket.onopen = () => {
          retry = 0;
          setConnectProblem(null);
        };
        socket.onmessage = (e) => onMessage(JSON.parse(e.data as string) as ServerMessage);
        socket.onclose = (e) => {
          if (closed) return;
          if (e.code === 4000) {
            setError(REPLACED);
            return;
          }
          if (e.code === 4401) setConnectProblem('The game server did not accept this sign-in. Retrying…');
          else if (retry >= 2) setConnectProblem("Can't reach the game server. Retrying…");
          setPhase((p) => (p === 'queued' ? 'idle' : p));
          timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10_000));
        };
      } catch {
        if (retry >= 2) setConnectProblem("Can't get a game token from this site. Retrying…");
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10_000));
      }
    }

    void connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [serverUrl]);

  useEffect(() => {
    // The replaced-by-another-tab message stays: this tab can't play until it reloads.
    if (!error || error === REPLACED) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  return {
    phase,
    me,
    match,
    view,
    deadline,
    ended,
    error,
    connectProblem,
    joinQueue: () => send({ type: 'queue.join' }),
    leaveQueue: () => send({ type: 'queue.leave' }),
    act: (action) => send({ type: 'action', action }),
    resign: () => send({ type: 'resign' }),
  };
}
