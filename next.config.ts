import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './lib/security/csp';

const nextConfig: NextConfig = {
  // Cache Components is off: nearly every screen is per-user and request-time
  // (Supabase session cookie), so it would only add Suspense boundaries everywhere.
  // See docs/decisions.md.
  //
  // Security headers on every response, static files included. The CSP itself is set per
  // request in proxy.ts, because it carries a nonce (M8).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
