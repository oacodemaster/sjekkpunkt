import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/auth/actions';
import { getDeviceLabel, requireRole } from '@/lib/auth/dal';
import { LANG_NAMES, t } from '@/lib/i18n/strings';

/** Handheld shell: phone-width, one hand, big targets. */
export default async function HandheldLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole(['packer', 'returns', 'lead', 'admin']);
  const device = await getDeviceLabel();
  if (!device && (user.role === 'packer' || user.role === 'returns')) redirect('/device');

  return (
    <div className="flex flex-1 justify-center bg-frame sm:py-6">
      <div className="flex w-full max-w-md flex-col overflow-hidden bg-white sm:rounded-[2rem] sm:shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Sjekkpunkt
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold" title={LANG_NAMES[user.lang]}>
              {user.lang.toUpperCase()}
            </span>
            <Link href="/device" className="rounded-full bg-slate-100 px-3 py-1 font-mono" title={t('device', user.lang)}>
              {device ?? '—'}
            </Link>
            <form action={signOut}>
              <button className="rounded-full px-3 py-1 text-muted underline">{t('signOut', user.lang)}</button>
            </form>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
