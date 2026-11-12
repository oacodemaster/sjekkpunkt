import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/landing/site';

/** Index the landing page and the public explainers; keep the app (stations, lead, admin, API) out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/en', '/guide', '/privacy', '/demo'],
      disallow: ['/api/', '/pack', '/return', '/lead', '/insights', '/admin', '/holio', '/device', '/welcome', '/login', '/play'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
