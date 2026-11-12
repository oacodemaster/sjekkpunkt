import type { Metadata } from 'next';
import { LANDING, landingPath, type LandingLang } from './copy';
import { SITE_URL } from './site';

/** Title, description, canonical, the nb/en hreflang pair and the share images for one language. */
export function landingMetadata(lang: LandingLang): Metadata {
  const c = LANDING[lang];
  const image = { url: `/og/sjekkpunkt-${lang}.png`, width: 1200, height: 630, alt: c.meta.ogAlt };
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: c.meta.title },
    description: c.meta.description,
    alternates: { canonical: landingPath(lang), languages: { nb: '/', en: '/en', 'x-default': '/' } },
    openGraph: {
      type: 'website',
      url: landingPath(lang),
      siteName: 'Sjekkpunkt',
      title: c.meta.title,
      description: c.meta.description,
      locale: lang === 'nb' ? 'nb_NO' : 'en_GB',
      alternateLocale: lang === 'nb' ? ['en_GB'] : ['nb_NO'],
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: c.meta.title, description: c.meta.description, images: [image] },
    robots: { index: true, follow: true },
  };
}
