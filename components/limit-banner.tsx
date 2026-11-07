'use client';

import { usePathname } from 'next/navigation';
import { Banner } from '@/components/ui';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/**
 * The tap-only switch (M8). When today's spend cap is reached the station says so before the
 * worker tries: photo checks give way to barcodes (packing) or the team lead (returns), and voice
 * gives way to the buttons. Directly under the header, amber, persistent, no close button.
 */
export function LimitBanner({ vision, voice, lang }: { vision: boolean; voice: boolean; lang: Lang }) {
  const path = usePathname();
  if (!vision && !voice) return null;
  const packing = path.startsWith('/pack');
  return (
    <div className="px-3 pb-3.5 pt-3" data-testid="limit-banner">
      <Banner tone="warn">
        {vision && <span className="block">{t(packing ? 'visionCappedPack' : 'visionCappedReturn', lang)}</span>}
        {voice && <span className="block">{t('voiceCapped', lang)}</span>}
      </Banner>
    </div>
  );
}
