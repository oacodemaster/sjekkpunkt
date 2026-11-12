import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayApp } from '@/components/play/play-app';
import { requestLang } from '@/lib/i18n/server';
import { agentIdFor } from '@/lib/voice/server';
import { paidDemoOn, scriptedDemoOn } from '@/lib/demo/flags';

export const metadata: Metadata = {
  title: 'Prøv selv · Sjekkpunkt',
  description: 'Pakk en pakke selv: velg varer fra hylla, legg dem i esken og se hva Sjekkpunkt sier.',
};

/**
 * The practice demo: anyone can pack the sample parcels on screen, with the real engine and,
 * when voice is set up, the real packing coach. No login, no camera, nothing stored.
 * Without voice it makes no paid call, so it is on with the free flag like /demo; the coach (a
 * paid voice session) only with DEMO_ENABLED=true (lib/demo/flags.ts).
 */
export default async function PlayPage({ searchParams }: PageProps<'/play'>) {
  if (!scriptedDemoOn()) notFound();
  const sp = await searchParams;
  const lang = await requestLang(undefined, sp.lang);
  const voice = paidDemoOn() && !!agentIdFor('pack') && !!process.env.ELEVENLABS_API_KEY;
  // ?parcel=4102 opens that parcel at once (the front page links each sample parcel's photo).
  const parcel = typeof sp.parcel === 'string' ? sp.parcel : undefined;
  return <PlayApp lang={lang} voice={voice} initialParcel={parcel} />;
}
