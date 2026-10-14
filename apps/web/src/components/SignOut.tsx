'use client';

import { signOut } from 'next-auth/react';

export function SignOut() {
  return (
    <button className="link" onClick={() => signOut({ callbackUrl: '/' })}>
      Sign out
    </button>
  );
}
