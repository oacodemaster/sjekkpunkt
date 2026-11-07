'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import type { Lang } from '@/lib/engine/types';
import { LANGS } from '@/lib/i18n/strings';
import { createAdminClient } from '@/lib/supabase/admin';
import { enabledLanguages } from './server';

// First launch (addendum section 7): language picker, then the privacy information screen.
// Profiles are written only here, for the signed-in user's own row.

const LangField = z.enum(LANGS as [Lang, ...Lang[]]);

export async function chooseLanguage(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const lang = LangField.safeParse(formData.get('lang'));
  const enabled = await enabledLanguages(user.warehouseId);
  if (!lang.success || !enabled.includes(lang.data)) redirect('/welcome');
  const { error } = await createAdminClient().from('profiles').update({ preferred_lang: lang.data }).eq('user_id', user.userId);
  if (error) throw new Error(`profile: ${error.message}`);
  redirect(user.privacyInfoReadAt ? HOME[user.role] : '/privacy?first=1');
}

/** "Jeg har lest dette" — an acknowledgement that the information was shown, not consent. */
export async function acknowledgePrivacy() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.privacyInfoReadAt) {
    const { error } = await createAdminClient().from('profiles').update({ privacy_info_read_at: new Date().toISOString() }).eq('user_id', user.userId);
    if (error) throw new Error(`profile: ${error.message}`);
  }
  redirect(HOME[user.role]);
}
