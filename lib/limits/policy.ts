// Rate limits and cost estimates for the paid AI calls (M8, addendum sections 6 and 10).
// Pure: no React, Next or Supabase. The server side is lib/limits/server.ts.

export type LimitedRoute = 'vision' | 'voice_token' | 'translate' | 'tts';
export type Provider = 'vision' | 'elevenlabs';

export interface Window {
  /** seconds */
  window: number;
  limit: number;
}

/**
 * Per user and, on a handheld, per device. Sized for a busy shift with room to spare: a return
 * takes 2-4 photos and a parcel 1-3, a worker rarely shoots more than 6 a minute; a caption line
 * is translated once; a voice session restarts on a language change. Above these, something is
 * looping or someone is scripting the API.
 */
export const RATE_LIMITS: Record<LimitedRoute, Window[]> = {
  vision: [
    { window: 60, limit: 20 },
    { window: 3600, limit: 400 },
  ],
  voice_token: [
    { window: 60, limit: 6 },
    { window: 3600, limit: 60 },
  ],
  translate: [
    { window: 60, limit: 60 },
    { window: 3600, limit: 1500 },
  ],
  tts: [
    { window: 60, limit: 15 },
    { window: 3600, limit: 200 },
  ],
};

/**
 * The public practice demo (/play) mints voice sessions without a login, so it is limited per
 * visitor (hashed IP) and in total across all visitors, on top of the daily ElevenLabs cap. The
 * total keeps one busy day of visitors from using up the stations' budget.
 */
export const PLAY_VOICE_LIMITS: { perVisitor: Window[]; total: Window[] } = {
  perVisitor: [
    { window: 60, limit: 3 },
    { window: 3600, limit: 10 },
  ],
  total: [
    { window: 3600, limit: 40 },
    { window: 86400, limit: 150 },
  ],
};

/**
 * The one-tap demo sign-in on /login (packer, returns, lead) needs no password, so it is limited
 * per visitor (hashed IP) and in total. Signing in costs nothing by itself; what the visitor does
 * next is limited per user and by the daily caps like any signed-in call. The total also keeps
 * the sign-ins well under Supabase Auth's own per-IP limits, which all count against the server.
 */
export const QUICK_SIGNIN_LIMITS: { perVisitor: Window[]; total: Window[] } = {
  perVisitor: [
    { window: 60, limit: 6 },
    { window: 3600, limit: 30 },
  ],
  total: [
    { window: 60, limit: 30 },
    { window: 3600, limit: 200 },
  ],
};

/** Which daily budget a route spends from. */
export const ROUTE_PROVIDER: Record<LimitedRoute, Provider> = {
  vision: 'vision',
  translate: 'vision',
  voice_token: 'elevenlabs',
  tts: 'elevenlabs',
};

/**
 * Estimated cost per call in øre. These are deliberately rough and on the high side: the cap is a
 * guard against runaway use, not an invoice. Today both providers run on free or prepaid tiers;
 * adjust when the paid plans are fixed (docs/decisions.md, M8).
 */
export const COST_ORE = {
  /** one fast-model vision attempt (image + up to 4 references) */
  visionFast: 10,
  /** one strong-model vision attempt */
  visionStrong: 30,
  /** one translation call */
  translate: 2,
  /** one ElevenLabs conversation session, about 3 minutes */
  voiceSession: 300,
  /** spoken summary, per character of text */
  ttsPerChar: 1,
} as const;

/** Cost of a two-stage vision run from its attempts. Fixtures and unknown models cost nothing. */
export function visionCostOre(attempts: { model: string }[], models: { fast: string; strong: string }): number {
  return attempts.reduce(
    (sum, a) => sum + (a.model === models.strong ? COST_ORE.visionStrong : a.model === models.fast ? COST_ORE.visionFast : 0),
    0,
  );
}

/** Spend is capped when today's estimate has reached the cap. A cap of 0 turns the provider off. */
export function overCap(spentOre: number, capNok: number): boolean {
  return spentOre >= capNok * 100;
}
