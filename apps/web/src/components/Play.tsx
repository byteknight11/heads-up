'use client';

import Link from 'next/link';
import { useGameSocket } from '@/lib/useGameSocket';
import { Table } from './Table';

export function Play({ serverUrl }: { serverUrl: string }) {
  const g = useGameSocket(serverUrl);

  if (g.phase === 'connecting') {
    return (
      <div className="panel">
        Connecting…
        {g.connectProblem && <p className="muted">{g.connectProblem}</p>}
      </div>
    );
  }

  if ((g.phase === 'playing' || g.phase === 'ended') && g.match) {
    return (
      <>
        {g.error && <div className="toast">{g.error}</div>}
        <Table match={g.match} view={g.view} deadline={g.deadline} ended={g.ended} onAct={g.act} onResign={g.resign} onPlayAgain={g.joinQueue} />
      </>
    );
  }

  return (
    <div className="panel lobby">
      {g.error && <div className="toast">{g.error}</div>}
      {g.me && (
        <p>
          <strong>{g.me.username}</strong> · rating <strong>{g.me.rating}</strong> ·{' '}
          <Link href={`/profile/${g.me.id}`}>profile</Link>
        </p>
      )}
      {g.phase === 'queued' ? (
        <>
          <p className="searching">Looking for an opponent…</p>
          <button onClick={g.leaveQueue}>Cancel</button>
        </>
      ) : (
        <button className="primary big" onClick={g.joinQueue}>
          Find a game
        </button>
      )}
      <p className="muted small">
        Each player starts with 100 chips. After hand n, anyone with 2(n−1) chips or fewer loses.
      </p>
    </div>
  );
}
