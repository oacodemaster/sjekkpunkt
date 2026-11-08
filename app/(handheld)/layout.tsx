import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LimitBanner } from '@/components/limit-banner';
import { DeviceChip, HandheldHeader } from '@/components/ui';
import { signOut } from '@/lib/auth/actions';
import { getDeviceLabel, requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { spendStatus } from '@/lib/limits/server';
import { enabledLanguages } from '@/lib/privacy/server';

/**
 * Handheld shell: a white station screen, phone width, one hand, 56px targets. On a wider
 * screen (a lead at a desk) the handheld sits in a device frame on the graphite ground.
 */
export default async function HandheldLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole(['packer', 'returns', 'lead', 'admin']);
  const device = await getDeviceLabel();
  const worker = user.role === 'packer' || user.role === 'returns';
  // First launch: language picker, then the worker information (addendum section 7).
  if (worker && !user.privacyInfoReadAt) redirect('/welcome');
  if (!device && worker) redirect('/device');
  // Tap-only switch (M8): when today's budget is spent, every station says so up front.
  const [spend, languages] = await Promise.all([spendStatus(user.warehouseId), enabledLanguages(user.warehouseId)]);

  return (
    <div className="flex flex-1 justify-center bg-surface sm:bg-frame sm:py-6">
      <div className="sp-handheld sp-light flex w-full max-w-md flex-col overflow-hidden bg-surface text-ink sm:rounded-xl sm:shadow-device" lang={user.lang}>
        <HandheldHeader
          lang={<LanguageSwitcher lang={user.lang} languages={languages} />}
          device={<DeviceChip label={device ?? '—'} title={t('device', user.lang)} />}
          privacy={{ label: t('privacy', user.lang) }}
          signOut={
            <form action={signOut}>
              <button className="sp-hit">
                <span className="sp-logout">{t('signOut', user.lang)}</span>
              </button>
            </form>
          }
        />
        <LimitBanner vision={spend.vision.capped} voice={spend.elevenlabs.capped} lang={user.lang} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
