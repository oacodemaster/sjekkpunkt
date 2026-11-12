import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { landingMetadata } from '@/lib/landing/metadata';

export const metadata: Metadata = landingMetadata('en');

/** The landing page in English (docs/landing-page-brief.md); also the page for pl, uk, ro and lt visitors. */
export default function EnglishHome() {
  return <LandingPage lang="en" />;
}
