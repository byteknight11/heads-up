import type { Card } from '@heads-up/engine';
import { cardLabel } from '@/lib/cards';

export function CardView({ card, small }: { card: Card | null; small?: boolean }) {
  if (!card) return <div className={`card back${small ? ' small' : ''}`} aria-label="hidden card" />;
  const { rank, suit, red } = cardLabel(card);
  return (
    <div className={`card${red ? ' red' : ''}${small ? ' small' : ''}`} aria-label={card}>
      <span className="rank">{rank}</span>
      <span className="suit">{suit}</span>
    </div>
  );
}
