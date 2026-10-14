'use client';

import { type Action, type Card, eliminationThreshold } from '@heads-up/engine';
import { useEffect, useState } from 'react';
import type { GameEnd, Match } from '@/lib/useGameSocket';
import type { PlayerView } from '@heads-up/server/protocol';
import { CardView } from './CardView';

interface Props {
  match: Match;
  view: PlayerView | null;
  deadline: number | null;
  ended: GameEnd | null;
  onAct: (a: Action) => void;
  onResign: () => void;
  onPlayAgain: () => void;
}

function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export function Table({ match, view, deadline, ended, onAct, onResign, onPlayAgain }: Props) {
  const me = match.seat;
  const opp = me === 0 ? 1 : 0;
  const hand = view?.hand ?? null;
  const last = view?.lastHand ?? null;
  const secondsLeft = useSecondsLeft(deadline);
  const myTurn = Boolean(view?.legal);
  const waitingOn = hand && hand.toAct !== null ? (hand.toAct === me ? 'you' : match.opponent.username) : null;

  // Between hands, show the finished hand's board and any shown cards.
  const board: Card[] = hand?.board ?? last?.board ?? [];
  const myCards = hand?.yourCards ?? last?.holeCards[me] ?? null;
  const oppCards = hand ? null : (last?.holeCards[opp] ?? null);
  const handNumber = view?.handNumber ?? 0;
  const threshold = eliminationThreshold(Math.max(handNumber, 1));

  return (
    <div className="table-wrap">
      <div className="table-meta">
        <span>Hand {handNumber}</span>
        <span>
          After this hand, {threshold === 0 ? '0 chips' : `${threshold} chips or fewer`} loses
        </span>
      </div>

      <Seat
        name={match.opponent.username}
        rating={match.opponent.rating}
        stack={view?.stacks[opp] ?? 100}
        bet={hand?.bets[opp] ?? 0}
        button={(hand?.button ?? last?.button) === opp}
        cards={oppCards ?? (hand || last ? [null, null] : [])}
        active={hand?.toAct === opp}
      />

      <div className="felt">
        <div className="board">
          {board.map((c) => (
            <CardView key={c} card={c} />
          ))}
          {Array.from({ length: 5 - board.length }, (_, i) => (
            <div key={i} className="card slot" />
          ))}
        </div>
        <div className="pot">{hand ? `Pot ${hand.pot}` : last ? resultLine(last, me, match.opponent.username) : ''}</div>
      </div>

      <Seat
        name={`${match.you.username} (you)`}
        rating={match.you.rating}
        stack={view?.stacks[me] ?? 100}
        bet={hand?.bets[me] ?? 0}
        button={(hand?.button ?? last?.button) === me}
        cards={myCards ?? []}
        active={hand?.toAct === me}
      />

      {!ended && (
        <div className="status">
          {waitingOn && secondsLeft !== null && (
            <div className={`clock${secondsLeft <= 5 ? ' low' : ''}`}>
              {waitingOn === 'you' ? 'Your turn' : `Waiting on ${waitingOn}`} · {secondsLeft}s
            </div>
          )}
        </div>
      )}

      {myTurn && view?.legal && !ended && <ActionBar legal={view.legal} pot={hand?.pot ?? 0} onAct={onAct} />}

      {!ended && (
        <button className="link resign" onClick={() => confirm('Resign this game? It counts as a loss.') && onResign()}>
          Resign
        </button>
      )}

      {ended && (
        <div className="panel result" role="dialog" aria-label="Game over">
          <h2>{ended.outcome === 'win' ? 'You won' : ended.outcome === 'loss' ? 'You lost' : 'Draw'}</h2>
          <p className="muted">{reasonText(ended)}</p>
          <p className="rating">
            {ended.newRating}{' '}
            <span className={ended.ratingChange! > 0 ? 'up' : ended.ratingChange! < 0 ? 'down' : ''}>
              ({ended.ratingChange! > 0 ? '+' : ''}
              {ended.ratingChange})
            </span>
          </p>
          <button className="primary" onClick={onPlayAgain}>
            Play again
          </button>
        </div>
      )}
    </div>
  );
}

function Seat(props: { name: string; rating: number; stack: number; bet: number; button: boolean; cards: Array<Card | null>; active: boolean }) {
  return (
    <div className={`seat${props.active ? ' active' : ''}`}>
      <div className="who">
        <strong>{props.name}</strong> <span className="muted">{props.rating}</span>
        {props.button && <span className="dealer" title="Button">D</span>}
      </div>
      <div className="hole">
        {props.cards.map((c, i) => (
          <CardView key={i} card={c} />
        ))}
      </div>
      <div className="chips">
        <span>{props.stack} chips</span>
        {props.bet > 0 && <span className="bet">bet {props.bet}</span>}
      </div>
    </div>
  );
}

function ActionBar({ legal, pot, onAct }: { legal: NonNullable<PlayerView['legal']>; pot: number; onAct: (a: Action) => void }) {
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  // `amount` is what the player typed; it is clamped to the legal range only when used,
  // so typing "25" isn't forced up to the minimum after the first keystroke.
  const [typed, setTyped] = useState(String(min ?? 0));
  useEffect(() => setTyped(String(min ?? 0)), [min, max]);
  const clamp = (n: number) =>
    min === null || max === null ? n : Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  const amount = clamp(Number(typed));
  const setAmount = (n: number) => setTyped(String(clamp(n)));

  return (
    <div className="actions">
      <div className="row">
        {legal.canCheck ? (
          <button onClick={() => onAct({ type: 'check' })}>Check</button>
        ) : (
          <button onClick={() => onAct({ type: 'fold' })}>Fold</button>
        )}
        {legal.callAmount !== null && <button onClick={() => onAct({ type: 'call' })}>Call {legal.callAmount}</button>}
        {min !== null && max !== null && (
          <button className="primary" onClick={() => onAct(amount === max ? { type: 'allin' } : { type: legal.raiseType, amount })}>
            {amount === max ? `All-in ${max}` : `${legal.raiseType === 'bet' ? 'Bet' : 'Raise to'} ${amount}`}
          </button>
        )}
      </div>
      {min !== null && max !== null && min < max && (
        <div className="row sizing">
          <input type="range" min={min} max={max} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Bet size" />
          <input
            type="number"
            min={min}
            max={max}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={() => setTyped(String(amount))}
            aria-label="Bet amount"
          />
          <button className="small" onClick={() => setAmount(clamp(pot / 2))}>½ pot</button>
          <button className="small" onClick={() => setAmount(clamp(pot))}>Pot</button>
        </div>
      )}
    </div>
  );
}

function resultLine(last: NonNullable<PlayerView['lastHand']>, me: 0 | 1, opponent: string): string {
  if (last.winners.length === 2) return `Split pot of ${last.pot}`;
  return last.winners[0] === me ? `You won ${last.pot}` : `${opponent} won ${last.pot}`;
}

function reasonText(e: GameEnd): string {
  if (e.result.reason === 'forfeit') return `By forfeit after ${e.result.handsPlayed} hands`;
  if (e.result.reason === 'draw') return `Both at 100 chips after hand ${e.result.handsPlayed}`;
  return `Elimination threshold reached after hand ${e.result.handsPlayed}`;
}
