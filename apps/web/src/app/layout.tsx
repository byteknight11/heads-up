import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { SignOut } from '@/components/SignOut';
import { authOptions } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = { title: 'Heads Up', description: 'Ranked heads-up poker, no real money.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1a14' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" className="brand">
            Heads Up
          </Link>
          {session?.user && <SignOut />}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
