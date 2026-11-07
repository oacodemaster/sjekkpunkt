import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { ZodJitless } from '@/components/zod-jitless';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'latin-ext', 'cyrillic'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sjekkpunkt',
  description: 'Every item checked on the way out and on the way back.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Every page renders per request, so Next.js can put the CSP nonce from proxy.ts on its
  // scripts. A statically prerendered page would carry no nonce and be blocked (M8).
  await connection();
  return (
    <html lang="nb" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ZodJitless />
        {children}
      </body>
    </html>
  );
}
