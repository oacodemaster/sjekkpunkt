import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/landing/site';

/** The public pages worth finding: the landing page in both languages, the guide, the privacy notice. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { nb: `${SITE_URL}/`, en: `${SITE_URL}/en` };
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1, alternates: { languages } },
    { url: `${SITE_URL}/en`, changeFrequency: 'monthly', priority: 0.9, alternates: { languages } },
    { url: `${SITE_URL}/guide`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
