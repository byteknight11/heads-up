import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Profile {
  user: { id: string; username: string; rating: number; gamesPlayed: number };
  history: Array<{
    gameId: string;
    endedAt: string;
    opponent: { id: string; username: string };
    outcome: 'win' | 'loss' | 'draw';
    ratingBefore: number;
    ratingChange: number;
    endReason: 'threshold' | 'forfeit' | 'draw';
    handsPlayed: number;
  }>;
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = process.env.GAME_SERVER_HTTP_URL ?? 'http://localhost:8080';
  const res = await fetch(`${base}/users/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`game server returned ${res.status}`);
  const { user, history } = (await res.json()) as Profile;
  const wins = history.filter((h) => h.outcome === 'win').length;
  const losses = history.filter((h) => h.outcome === 'loss').length;

  return (
    <div className="panel profile">
      <h1>{user.username}</h1>
      <p className="rating">{user.rating}</p>
      <p className="muted">
        {plural(user.gamesPlayed, 'game')} · {plural(wins, 'win')} · {plural(losses, 'loss', 'losses')}
      </p>
      <RatingChart history={history} current={user.rating} />
      {history.length === 0 ? (
        <p className="muted">No rated games yet.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>Result</th>
              <th>Opponent</th>
              <th>Rating</th>
              <th>Hands</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.gameId}>
                <td className={h.outcome}>{h.outcome === 'win' ? 'Win' : h.outcome === 'loss' ? 'Loss' : 'Draw'}{h.endReason === 'forfeit' ? ' (forfeit)' : ''}</td>
                <td>
                  <Link href={`/profile/${h.opponent.id}`}>{h.opponent.username}</Link>
                </td>
                <td>
                  {h.ratingBefore + h.ratingChange}{' '}
                  <span className={h.ratingChange > 0 ? 'up' : h.ratingChange < 0 ? 'down' : ''}>
                    ({h.ratingChange > 0 ? '+' : ''}
                    {h.ratingChange})
                  </span>
                </td>
                <td>{h.handsPlayed}</td>
                <td>{new Date(h.endedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Rating after each game, oldest to newest. */
function RatingChart({ history, current }: { history: Profile['history']; current: number }) {
  if (history.length < 2) return null;
  const points = [...history].reverse().map((h) => h.ratingBefore + h.ratingChange);
  const lo = Math.min(...points) - 10;
  const hi = Math.max(...points) + 10;
  const w = 600;
  const h = 120;
  const x = (i: number) => (i / (points.length - 1)) * (w - 20) + 10;
  const y = (r: number) => h - 10 - ((r - lo) / (hi - lo)) * (h - 20);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Rating history, now ${current}`}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points.map((r, i) => `${x(i)},${y(r)}`).join(' ')} />
      <text x={w - 10} y={14} textAnchor="end" fontSize="12" fill="currentColor">
        {hi - 10}
      </text>
      <text x={w - 10} y={h - 2} textAnchor="end" fontSize="12" fill="currentColor">
        {lo + 10}
      </text>
    </svg>
  );
}
