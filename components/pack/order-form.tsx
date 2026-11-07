'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/** Open an order by number (typed, or from a handheld scanner that types into the field). */
export function OrderForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <form
      className="grid grid-cols-[1fr_auto] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = code.trim().replace(/^#/, '');
        if (v) router.push(`/pack/${encodeURIComponent(v)}`);
      }}
    >
      <label className="sr-only" htmlFor="order-code">
        {t('orderNumber', lang)}
      </label>
      <input
        id="order-code"
        inputMode="numeric"
        autoComplete="off"
        className="min-h-14 min-w-0 rounded-xl border-2 border-gray-300 px-4 text-xl"
        placeholder={t('orderNumber', lang)}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button className="btn-primary" disabled={!code.trim()}>
        {t('open', lang)}
      </button>
    </form>
  );
}
