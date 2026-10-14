import { SignJWT, jwtVerify } from 'jose';

/**
 * Socket auth tokens. The web app signs one after Auth.js sign-in, using the
 * shared AUTH_SECRET; the server only verifies it.
 */
export interface TokenClaims {
  /** User id (uuid). */
  sub: string;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signToken(claims: TokenClaims, secret: string, expiresIn = '12h'): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(claims.sub).setIssuedAt().setExpirationTime(expiresIn).sign(key(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return payload.sub ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}
