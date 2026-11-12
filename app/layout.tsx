import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { ZodJitless } from '@/components/zod-jitless';
import { Golos_Text, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// The design system's faces, self-hosted by next/font at build time (no request to Google, so no
// new CSP origin). The CSS carries every subset Google has (Latin Extended for pl, ro, lt,
// Cyrillic for uk), each behind its unicode-range, so a browser downloads only what a page shows.
// `subsets` picks only what is preloaded: Latin, which every page needs (nb and en). Preloading
// all four subsets of both families cost eight files on every first visit (docs/decisions.md).
// The variables are the ones app/tokens.css puts first in each family.
const golos = Golos_Text({ variable: '--font-golos-text', subsets: ['latin'], display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ variable: '--font-jetbrains-mono', subsets: ['latin'], display: 'swap' });

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
