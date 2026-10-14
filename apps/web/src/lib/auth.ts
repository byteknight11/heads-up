import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const devLoginEnabled = process.env.DEV_LOGIN === '1';

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    ...(googleEnabled
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
      : []),
    ...(devLoginEnabled
      ? [
          // Local development only: anyone can sign in as any username.
          CredentialsProvider({
            id: 'dev',
            name: 'Username',
            credentials: { username: { label: 'Username', type: 'text' } },
            authorize(credentials) {
              const username = credentials?.username?.trim() ?? '';
              if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return null;
              return { id: username, name: username, email: `${username.toLowerCase()}@dev.local` };
            },
          }),
        ]
      : []),
  ],
};
