import { requireRole } from '@/lib/auth/dal';
import { PRIVACY } from '@/lib/i18n/privacy-strings';
import { LANG_NAMES } from '@/lib/i18n/strings';
import { chooseLanguage } from '@/lib/privacy/actions';
import { enabledLanguages } from '@/lib/privacy/server';

/** First launch, step 1: the language picker (enabled languages only). Step 2 is /privacy?first=1. */
export default async function WelcomePage() {
  const user = await requireRole(['packer', 'returns', 'lead', 'admin']);
  const languages = await enabledLanguages(user.warehouseId);
  const text = PRIVACY[user.lang];

  return (
    <main className="flex flex-1 items-center justify-center bg-frame p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold">{text.pickLanguage}</h1>
        <p className="mt-1 text-muted">{text.pickLanguageHelp}</p>
        <form action={chooseLanguage} className="mt-6 flex flex-col gap-3" data-testid="language-picker">
          {languages.map((l) => (
            <button key={l} name="lang" value={l} lang={l} className={l === user.lang ? 'btn-primary' : 'btn-secondary'}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
