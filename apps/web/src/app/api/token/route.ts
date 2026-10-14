import { SignJWT } from 'jose';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

/** Issues a short-lived token the game server accepts on its socket. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const token = await new SignJWT({ name: session.user?.name ?? email.split('@')[0] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return NextResponse.json({ token }, { headers: { 'cache-control': 'no-store' } });
}
