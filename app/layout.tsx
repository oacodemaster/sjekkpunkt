import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { ZodJitless } from '@/components/zod-jitless';
import { Golos_Text, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// The design system's faces, self-hosted by next/font at build time (no request to Google, so no
// new CSP origin). Every subset the six station languages need: Latin Extended for pl, ro, lt
// and Cyrillic for uk. The variables are the ones app/tokens.css puts first in each family.
const golos = Golos_Text({ variable: '--font-golos-text', subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'], display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ variable: '--font-jetbrains-mono', subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Sjekkpunkt',
  description: 'Every item checked on the way out and on the way back.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111210', // frame
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Every page renders per request, so Next.js can put the CSP nonce from proxy.ts on its
  // scripts. A statically prerendered page would carry no nonce and be blocked (M8).
  await connection();
  return (
    <html lang="nb" className={`${golos.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ZodJitless />
        {children}
      </body>
    </html>
  );
}
