'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { sendLead } from '@/lib/leads/actions';
import { checkLead, LEAD_INTERESTS, LEAD_ROLES, LEAD_VOLUMES, leadInput, type LeadField, type LeadState } from '@/lib/leads/schema';
import type { LandingCopy, LandingLang } from '@/lib/landing/copy';

/**
 * «Be om en pilot, eller bare spør» (landing page brief, section 9). The browser checks the
 * fields first with the same rules as the server, so a typo never costs a round trip; the server
 * checks everything again. Without JavaScript the form still posts and the page answers.
 * Errors sit under each field (aria-describedby) and are summed up in an alert; the first bad
 * field gets the focus.
 */
export function LeadForm({ lang, copy, token, links }: { lang: LandingLang; copy: LandingCopy['form']; token: string; links: { privacy: string; try: string; demo: string } }) {
  const [state, action, pending] = useActionState<LeadState, FormData>(sendLead, { status: 'idle', token });
  const [local, setLocal] = useState<LeadField[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  const serverFields = state.status === 'error' ? state.fields : [];
  const fields = local ?? serverFields;
  const formError = state.status === 'error' && !local ? state.form : undefined;
  const values = state.status === 'error' ? state.values : {};

  // After an answer: the first bad field, or the thank-you, gets the focus.
  useEffect(() => {
    if (state.status === 'sent') sentRef.current?.focus();
    else if (state.status === 'error' && state.fields[0]) formRef.current?.querySelector<HTMLElement>(`[name="${state.fields[0]}"]`)?.focus();
  }, [state]);

  if (state.status === 'sent') {
    return (
      <div ref={sentRef} tabIndex={-1} className="lp-form lp-form--sent sp-light" role="status" data-testid="lead-sent">
        <span className="lp-form__ok" aria-hidden>
          <Icon name="ok" />
        </span>
        <h3 className="lp-form__sent-title">{copy.sentTitle.replace('{name}', state.firstName)}</h3>
        <p className="m-0">
          {copy.sentBefore}
          <a href={links.try} className="sp-link">
            {copy.sentTry}
          </a>
          {copy.sentOr}
          <Link href={links.demo} className="sp-link">
            {copy.sentDemo}
          </Link>
          {copy.sentAfter}
        </p>
      </div>
    );
  }

  const err = (f: LeadField) => (fields.includes(f) ? copy.errors[f] : undefined);
  const describe = (f: LeadField, help?: boolean) => (fields.includes(f) ? `lead-${f}-error` : help ? `lead-${f}-help` : undefined);
  const label = (f: LeadField, optional: boolean) => (
    <label className="sp-field__label" htmlFor={`lead-${f}`}>
      {copy.labels[f]}
      {optional && <span className="lp-form__opt"> ({copy.optional})</span>}
    </label>
  );
  const errorLine = (f: LeadField) =>
    err(f) && (
      <span className="sp-field__error" id={`lead-${f}-error`}>
        <Icon name="stop" />
        {err(f)}
      </span>
    );
  const input = (f: 'name' | 'email' | 'company', type: string, autoComplete: string) => (
    <div className="sp-field">
      {label(f, false)}
      <input
        id={`lead-${f}`}
        name={f}
        type={type}
        autoComplete={autoComplete}
        required
        maxLength={f === 'email' ? 254 : f === 'company' ? 160 : 120}
        defaultValue={values[f]}
        className="sp-input"
        aria-invalid={fields.includes(f) || undefined}
        aria-describedby={describe(f)}
      />
      {errorLine(f)}
    </div>
  );
  const select = (f: 'role' | 'volume', options: readonly string[], names: Record<string, string>) => (
    <div className="sp-field">
      {label(f, true)}
      <select id={`lead-${f}`} name={f} defaultValue={values[f] ?? ''} className="sp-input" aria-invalid={fields.includes(f) || undefined} aria-describedby={describe(f)}>
        <option value="">{copy.choose}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {names[o]}
          </option>
        ))}
      </select>
      {errorLine(f)}
    </div>
  );

  const summary = formError ? copy.errors[formError] : fields.length ? copy.errorSummary : null;

  return (
    <form
      ref={formRef}
      key={state.status === 'error' ? state.attempt : 0}
      action={action}
      noValidate
      className="lp-form sp-light"
      data-testid="lead-form"
      onSubmit={(e) => {
        // Same rules as the server, before anything is sent.
        const r = checkLead(leadInput(new FormData(e.currentTarget)));
        if (!r.ok) {
          e.preventDefault();
          setLocal(r.fields);
          e.currentTarget.querySelector<HTMLElement>(`[name="${r.fields[0]}"]`)?.focus();
        } else setLocal(null);
      }}
    >
      {summary && (
        <p className="lp-form__alert" role="alert" data-testid="lead-error">
          <Icon name={formError === 'rateLimited' || formError === 'tooFast' ? 'warn' : 'stop'} />
          {summary}
        </p>
      )}
      <input type="hidden" name="t" value={state.token} />
      <input type="hidden" name="lang" value={lang} />
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div className="lp-form__hp" aria-hidden="true">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="lp-form__grid">
        {input('name', 'text', 'name')}
        {input('email', 'email', 'email')}
        {input('company', 'text', 'organization')}
        {select('role', LEAD_ROLES, copy.roles)}
        {select('volume', LEAD_VOLUMES, copy.volumes)}
        <fieldset className="lp-form__choices" aria-describedby={describe('interest')}>
          <legend className="sp-field__label">
            {copy.labels.interest} <span className="lp-form__opt">({copy.optional})</span>
          </legend>
          <div className="lp-form__radios">
            {LEAD_INTERESTS.map((i) => (
              <label key={i} className="lp-radio">
                <input type="radio" name="interest" value={i} defaultChecked={values.interest === i} />
                <span>{copy.interests[i]}</span>
              </label>
            ))}
          </div>
          {errorLine('interest')}
        </fieldset>
        <div className="sp-field lp-form__wide">
          {label('message', true)}
          <textarea
            id="lead-message"
            name="message"
            rows={4}
            maxLength={2000}
            defaultValue={values.message}
            className="sp-input sp-textarea"
            aria-invalid={fields.includes('message') || undefined}
            aria-describedby={describe('message', true)}
          />
          {!err('message') && (
            <span className="sp-field__help" id="lead-message-help">
              {copy.messageHint}
            </span>
          )}
          {errorLine('message')}
        </div>
      </div>

      <p className="lp-form__consent">
        {copy.consentBefore}
        <Link href={links.privacy} className="sp-link">
          {copy.consentLink}
        </Link>
        {copy.consentAfter}
      </p>
      <Button type="submit" variant="primary" iconAfter="arrow-right" disabled={pending} data-testid="lead-submit" className="lp-form__submit">
        {pending ? copy.sending : copy.submit}
      </Button>
    </form>
  );
}
