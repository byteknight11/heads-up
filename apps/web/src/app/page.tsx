import { getServerSession } from 'next-auth';
import { Play } from '@/components/Play';
import { SignIn } from '@/components/SignIn';
import { authOptions, devLoginEnabled, googleEnabled } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <SignIn google={googleEnabled} dev={devLoginEnabled} />;
  return <Play serverUrl={process.env.GAME_SERVER_WS_URL ?? 'ws://localhost:8080'} />;
}
