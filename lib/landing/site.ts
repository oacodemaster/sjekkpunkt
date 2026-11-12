// The public address of the site, for canonical URLs, hreflang, Open Graph and the sitemap.
// NEXT_PUBLIC_SITE_URL overrides it (a custom domain later); no trailing slash.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sjekkpunkt.vercel.app').replace(/\/$/, '');
