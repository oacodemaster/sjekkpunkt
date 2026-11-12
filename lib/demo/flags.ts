// Which demo pieces are on (landing page brief, section 3: free versus paid demo).
//
// - Free, scripted pieces cost nothing per visitor: the landing page's packing check, /demo (the
//   scripted run on the demo adapter) and /play without voice (the practice camera runs in the
//   browser). They are on unless NEXT_PUBLIC_SCRIPTED_DEMO is exactly "false".
// - Paid or password-free pieces stay behind DEMO_ENABLED=true: the /play voice token, the one-tap
//   sign-in on /login and the demo reset in /admin. Production keeps it false.
//
// NEXT_PUBLIC_ is inlined at build time, so the free flag is read the same on server and client.

/** Scripted demos that make no paid call: /demo, /play without voice, the landing page demo. */
export function scriptedDemoOn(env: Record<string, string | undefined> = { NEXT_PUBLIC_SCRIPTED_DEMO: process.env.NEXT_PUBLIC_SCRIPTED_DEMO }): boolean {
  return env.NEXT_PUBLIC_SCRIPTED_DEMO !== 'false';
}

/** Anything that can spend money or skips the password: voice for strangers, one-tap sign-in, reset. Server only. */
export function paidDemoOn(env: Record<string, string | undefined> = { DEMO_ENABLED: process.env.DEMO_ENABLED }): boolean {
  return env.DEMO_ENABLED === 'true';
}
