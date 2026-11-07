'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@/components/ui';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/** Open an order by number (typed, or from a handheld scanner that types into the field). */
export function OrderForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = code.trim().replace(/^#/, '');
        if (v) router.push(`/pack/${encodeURIComponent(v)}`);
      }}
    >
      <Field
        id="order-code"
        label={t('orderNumber', lang)}
        mono
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('orderNumber', lang)}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        action={
          <Button type="submit" disabled={!code.trim()}>
            {t('open', lang)}
          </Button>
        }
      />
    </form>
  );
}
