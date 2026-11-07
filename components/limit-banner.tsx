'use client';

import { usePathname } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/**
 * The tap-only switch (M8). When today's spend cap is reached the station says so before the
 * worker tries: photo checks give way to barcodes (packing) or the team lead (returns), and voice
 * gives way to the buttons.
 */
export function LimitBanner({ vision, voice, lang }: { vision: boolean; voice: boolean; lang: Lang }) {
  const path = usePathname();
  if (!vision && !voice) return null;
  const packing = path.startsWith('/pack');
  return (
    <div role="status" className="flex flex-col gap-1 border-b bg-amber-50 px-4 py-2 text-base text-warn" data-testid="limit-banner">
      {vision && <p>{t(packing ? 'visionCappedPack' : 'visionCappedReturn', lang)}</p>}
      {voice && <p>{t('voiceCapped', lang)}</p>}
    </div>
  );
}
