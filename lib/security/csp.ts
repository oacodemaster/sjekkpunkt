// Content Security Policy and security headers (M8, addendum section 10). Pure: proxy.ts builds
// the policy per request with a fresh nonce, and a unit test pins what it allows.

/** ElevenLabs Agents over WebRTC: the API (token, signalling) and its LiveKit servers. */
const ELEVENLABS = ['https://api.elevenlabs.io', 'wss://api.elevenlabs.io', 'https://livekit.rtc.elevenlabs.io', 'wss://livekit.rtc.elevenlabs.io'];

/** `https` is false only for the local http server (dev and e2e), where upgrading would break every request. */
export function buildCsp({ nonce, dev, supabaseUrl, https = true }: { nonce: string; dev: boolean; supabaseUrl: string; https?: boolean }): string {
  const sb = new URL(supabaseUrl);
  const supabase = [sb.origin, `wss://${sb.host}`];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js puts the nonce on its inline scripts; chunks come from /_next/static ('self').
    // The voice SDK's audio worklets are self-hosted in /elevenlabs/ (no blob: or data: scripts).
    // Dev only: React needs eval for its debug stacks.
    'script-src': ["'self'", `'nonce-${nonce}'`, ...(dev ? ["'unsafe-eval'"] : [])],
    // Tailwind ships a stylesheet; inline style attributes (bar widths) need 'unsafe-inline'.
    // Styles cannot run code, so this is the usual trade-off.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Photos are blob: previews and short-lived signed Supabase URLs.
    'img-src': ["'self'", 'blob:', 'data:', sb.origin],
    // Spoken summaries are signed Supabase URLs; demo audio is in /audio.
    'media-src': ["'self'", 'blob:', 'data:', sb.origin],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...supabase, ...ELEVENLABS],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (https) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** A nonce: 128 random bits, base64. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Headers for every response, static files included (next.config.ts). */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera and microphone for this origin only; nothing else the app does not use.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];
