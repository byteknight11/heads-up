'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function SignIn({ google, dev }: { google: boolean; dev: boolean }) {
  const [username, setUsername] = useState('');
  return (
    <div className="panel signin">
      <h1>Heads Up</h1>
      <p className="muted">Ranked heads-up No-Limit Hold&apos;em. 100 chips each, no real money.</p>
      {google && (
        <button className="primary" onClick={() => signIn('google')}>
          Sign in with Google
        </button>
      )}
      {dev && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn('dev', { username, callbackUrl: '/' });
          }}
        >
          <label htmlFor="username">Development sign-in</label>
          <div className="row">
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" pattern="[A-Za-z0-9_]{3,20}" required />
            <button type="submit">Sign in</button>
          </div>
        </form>
      )}
      {!google && !dev && <p className="muted">No sign-in method is configured.</p>}
    </div>
  );
}
