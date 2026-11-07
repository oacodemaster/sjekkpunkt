'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { livePort } from '@/lib/returns/live-port';
import type { ReturnView } from '@/lib/returns/types';
import { ReturnStationView } from './return-station';
import { useReturnStation } from './use-return-station';

export function LiveReturnStation({ view, lang }: { view: ReturnView; lang: Lang }) {
  const router = useRouter();
  const port = useMemo(() => livePort(), []);
  const station = useReturnStation(view, port);
  return (
    <ReturnStationView
      station={station}
      lang={lang}
      captureMode="camera"
      onBackToQueue={() => {
        router.push('/return');
        router.refresh();
      }}
    />
  );
}
