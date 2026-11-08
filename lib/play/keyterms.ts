import { PLAY_PRODUCTS } from './catalog';

/**
 * Speech-to-text keyterms for the practice coach: the shelf's product names, no database read.
 * The ASR keyword override takes at most 50 entries (lib/voice/server.ts MAX_KEYTERMS).
 */
export const PLAY_KEYTERMS: string[] = [
  'Sjekk',
  'Sjekkpunkt',
  ...new Set(PLAY_PRODUCTS.flatMap((p) => [p.nameNb.split(',')[0].trim(), p.nameEn.split(',')[0].trim()])),
].slice(0, 50);
