'use server';

import { headers } from 'next/headers';
import type { LeadState } from './schema';
import { submitLead } from './submit';

/**
 * The landing page form's server action (useActionState). It works without JavaScript too: the
 * form posts, the page renders again with the answer. Next.js runs a server action only when it
 * is posted from this site's own pages (Origin against Host).
 */
export async function sendLead(prev: LeadState, form: FormData): Promise<LeadState> {
  const attempt = prev.status === 'error' ? prev.attempt + 1 : 1;
  return submitLead(form, await headers(), attempt);
}
