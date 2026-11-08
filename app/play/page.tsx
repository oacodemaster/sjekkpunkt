import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayApp } from '@/components/play/play-app';
import { requestLang } from '@/lib/i18n/server';
import { agentIdFor } from '@/lib/voice/server';

export const metadata: Metadata = {
  title: 'Prøv selv · Sjekkpunkt',
  description: 'Pakk en pakke selv: velg varer fra hylla, legg dem i esken og se hva Sjekkpunkt sier.',
};

/**
 * The practice demo: anyone can pack the sample parcels on screen, with the real engine and,
 * when voice is set up, the real packing coach. No login, no camera, nothing stored.
 * Same flag as /demo.
 */
export default async function PlayPage({ searchParams }: PageProps<'/play'>) {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true') notFound();
  const sp = await searchParams;
  const lang = await requestLang(undefined, sp.lang);
  const voice = process.env.DEMO_ENABLED === 'true' && !!agentIdFor('pack') && !!process.env.ELEVENLABS_API_KEY;
  return <PlayApp lang={lang} voice={voice} />;
}
