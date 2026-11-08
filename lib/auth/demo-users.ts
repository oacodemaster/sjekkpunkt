// The role test users (`pnpm db:users`) and which of them the one-tap demo sign-in may use.
// Pure data: the seeding script and the server action both read it.

export const SEED_USERS = [
  { role: 'packer', email: 'packer@sjekkpunkt.test', lang: 'pl', name: 'Pakker 1' },
  { role: 'returns', email: 'returns@sjekkpunkt.test', lang: 'uk', name: 'Retur 1' },
  { role: 'lead', email: 'lead@sjekkpunkt.test', lang: 'nb', name: 'Teamleder' },
  { role: 'admin', email: 'admin@sjekkpunkt.test', lang: 'nb', name: 'Admin' },
] as const;

/**
 * Roles with a one-tap button on /login when DEMO_ENABLED=true. Never admin: admin can reset the
 * data, change settings and push the grading guide to the live voice agents.
 */
export const QUICK_ROLES = ['packer', 'returns', 'lead'] as const;
export type QuickRole = (typeof QUICK_ROLES)[number];

/** The handheld a one-tap worker lands on when the browser has no device yet (the demo uses device-07). */
export const QUICK_DEVICE: Partial<Record<QuickRole, string>> = { packer: 'device-07', returns: 'device-03' };
