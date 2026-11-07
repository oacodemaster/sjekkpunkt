import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components is off: nearly every screen is per-user and request-time
  // (Supabase session cookie), so it would only add Suspense boundaries everywhere.
  // See docs/decisions.md.
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
