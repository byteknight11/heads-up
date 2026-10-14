import { SignJWT, jwtVerify } from 'jose';

/**
 * Socket auth tokens. The web app signs one after sign-in, using the shared
 * AUTH_SECRET; the server verifies it and finds or creates the player by email.
 */
export interface TokenClaims {
  email: string;
  /** Display name, used to pick a username for a new player. */
  name: string;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signToken(claims: TokenClaims, secret: string, expiresIn = '12h'): Promise<string> {
  return new SignJWT({ name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.email)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.name !== 'string') return null;
    return { email: payload.sub, name: payload.name };
  } catch {
    return null;
  }
}
