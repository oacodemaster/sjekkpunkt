import { Button } from '@/components/ui';
import { SignedOutShell } from '@/components/ui/signed-out-shell';
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
    <SignedOutShell lang={user.lang}>
      <div className="flex flex-col gap-2">
        <h1 className="type-title m-0">{text.pickLanguage}</h1>
        <p className="type-body m-0 text-ink-2">{text.pickLanguageHelp}</p>
      </div>
      <form action={chooseLanguage} className="flex flex-col gap-3" data-testid="language-picker">
        {languages.map((l) => (
          <Button key={l} type="submit" name="lang" value={l} lang={l} block variant={l === user.lang ? 'primary' : 'secondary'} aria-current={l === user.lang ? 'true' : undefined}>
            <span className="sp-mono w-8 text-left text-[16px]" aria-hidden>
              {l.toUpperCase()}
            </span>
            <span className="flex-1 text-left">{LANG_NAMES[l]}</span>
          </Button>
        ))}
      </form>
    </SignedOutShell>
  );
}
