'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { REASON_NB } from '@/lib/lead/plan';
import type { LeadAction, LeadCard } from '@/lib/lead/types';

const nok = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('nb-NO').replace(/\s/g, ' ')} kr`);
const time = (iso: string) => new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const PURPOSE_NB: Record<string, string> = { front: 'Front', label: 'Etikett', damage: 'Skade', customer_note: 'Kundelapp', packaging: 'Emballasje' };
const CAUSE_NB: Record<string, string> = {
  likely_warehouse_error: 'Sannsynlig pakkefeil',
  inconclusive: 'Uklar',
  unknown: 'Ukjent',
  customer_side: 'Kundens side',
  transit_damage: 'Transportskade',
};
const EVIDENCE_NB: Record<string, string> = { VERIFIED: 'Verifisert', MANUAL_CONFIRM: 'Manuelt bekreftet' };
const MANUAL_NB: Record<string, string> = { polybag: 'plastpose', glare: 'gjenskinn', other: 'annet' };
const LANG_NB: Record<string, string> = { nb: 'norsk', en: 'engelsk', pl: 'polsk', uk: 'ukrainsk', ro: 'rumensk', lt: 'litauisk' };

export const ERROR_NB: Record<string, string> = {
  reason_required: 'Skriv en grunn.',
  refund_required: 'Refusjonen må settes. Bruk Overstyr og skriv beløpet.',
  not_ready: 'Motoren har ikke nok til et forslag. Bruk Overstyr og velg grad.',
  not_applicable: 'Denne saken kan ikke overstyres.',
  bad_location: 'Ukjent hylle.',
  shelf_required: 'Varen er ikke identifisert, så velg hylle selv.',
  grade_required: 'Velg en grad.',
  already_resolved: 'Saken er allerede behandlet.',
  already_decided: 'Allerede avgjort.',
  already_active: 'Det finnes allerede et aktivt varsel for dette paret.',
  already_cleared: 'Varselet er allerede fjernet.',
  same_sku: 'Velg to ulike varer.',
  unknown_sku: 'Ukjent vare.',
  tts_unavailable: 'Opplesning er ikke tilgjengelig nå.',
  spend_cap: 'Opplesning er satt på pause til midnatt (dagens kostnadsgrense er nådd).',
  rate_limited: 'For mange forsøk på kort tid. Vent litt.',
  forbidden: 'Du har ikke tilgang.',
  offline: 'Ingen nettforbindelse. Prøv igjen.',
  failed: 'Noe gikk galt. Prøv igjen.',
};

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? ({ ok: true, ...json } as { ok: true } & T) : { ok: false, error: (json.error as string) ?? 'failed' };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** Plays the cached Norwegian summary (generated on the first press). */
function PlayButton({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error' | 'capped'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async () => {
    if (state === 'playing') {
      audio.current?.pause();
      setState('idle');
      return;
    }
    setState('loading');
    const r = await postJson<{ url: string }>('/api/tts/summary', { escalationId: id });
    if (!r.ok) return setState(r.error === 'spend_cap' ? 'capped' : 'error');
    const a = new Audio(r.url);
    audio.current = a;
    a.onended = () => setState('idle');
    a.play().then(() => setState('playing')).catch(() => setState('error'));
  };
  return (
    <button
      onClick={play}
      className="rounded-full bg-frame px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      disabled={state === 'loading' || state === 'capped'}
      aria-label="Spill av oppsummering"
      title={state === 'capped' ? 'Opplesning er satt på pause til midnatt (dagens kostnadsgrense er nådd).' : undefined}
      data-testid="play-summary"
    >
      {state === 'loading' ? 'Lager lyd…' : state === 'playing' ? '■ Stopp' : state === 'error' ? '▶ Prøv igjen' : state === 'capped' ? 'Opplesning på pause' : '▶ Spill av'}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export interface ResolveBody {
  action: LeadAction;
  grade?: 'A' | 'B' | 'C' | 'D';
  locationCode?: string;
  refundNok?: number;
  reason?: string;
  note?: string;
}

export function EscalationCard({
  card,
  number,
  focused,
  locations,
  onFocus,
  onResolve,
}: {
  card: LeadCard;
  number: number;
  focused: boolean;
  locations: { code: string; kind: string }[];
  onFocus: () => void;
  onResolve: (card: LeadCard, body: ResolveBody) => Promise<string | null>;
}) {
  const [form, setForm] = useState<null | 'override' | 'reject'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i = card.item;
  const current = i?.decision ?? null;
  const [grade, setGrade] = useState<'A' | 'B' | 'C' | 'D'>((current?.grade ?? i?.proposal.grade ?? 'A') as 'A');
  const [shelf, setShelf] = useState('');
  const [refund, setRefund] = useState<string>(String(current?.refundNok ?? i?.proposal.refundNok ?? i?.lineValueNok ?? ''));
  const [reason, setReason] = useState('');

  const submit = async (body: ResolveBody) => {
    setBusy(true);
    setError(null);
    const err = await onResolve(card, body);
    setBusy(false);
    if (err) setError(ERROR_NB[err] ?? err);
    else setForm(null);
  };

  const resolved = card.status === 'resolved';
  return (
    <li
      id={`esc-${card.id}`}
      onClick={onFocus}
      className={`rounded-2xl border-2 bg-white p-4 shadow-sm transition ${resolved ? 'border-slate-200 opacity-70' : focused ? 'border-accent ring-4 ring-blue-100' : 'border-warn'}`}
      data-testid="escalation-card"
      data-reason={card.reason}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!resolved && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-sm">#{number}</span>}
        <span className={`font-semibold ${resolved ? 'text-muted' : 'text-warn'}`}>{REASON_NB[card.reason] ?? card.reason}</span>
        {card.href ? (
          <Link href={card.href} className="font-mono text-sm underline" onClick={(e) => e.stopPropagation()}>
            {card.refLabel}
          </Link>
        ) : (
          <span className="font-mono text-sm">{card.refLabel}</span>
        )}
        <time className="text-sm text-muted">{time(card.createdAt)}</time>
        <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
          {card.summaryNb && <PlayButton id={card.id} />}
        </span>
      </div>
      <p className="mt-2 text-base leading-snug">{card.summaryNb}</p>

      {resolved && card.resolution && (
        <p className="mt-2 text-sm text-muted">
          {card.resolution.action === 'override' ? 'Overstyrt' : card.resolution.action === 'reject' ? 'Avvist' : 'Godkjent'}
          {card.resolution.grade ? ` · grad ${card.resolution.grade}, ${card.resolution.locationCode}, ${nok(card.resolution.refundNok)}` : ''}
          {card.resolution.note ? ` · «${card.resolution.note}»` : ''}
        </p>
      )}

      {i && !resolved && (
        <div className="mt-3 flex flex-col gap-3">
          <dl className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-base">
            <Fact label="Bestilt">{i.orderedName}</Fact>
            {i.receivedSku && i.receivedSku !== i.orderedSku && <Fact label="Mottatt">{i.receivedName}</Fact>}
            <Fact label={current ? 'Beslutning' : 'Motorens forslag'}>
              {current ? (
                <span data-testid="card-decision">
                  Grad <b>{current.grade}</b> · <span className="font-mono">{current.locationCode}</span> · {current.refundNok === null ? <b className="text-warn">refusjon: du avgjør</b> : nok(current.refundNok)}
                  {current.isOverride && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-sm font-semibold text-accent">Overstyrt</span>}
                </span>
              ) : (
                <span>
                  {i.proposal.grade ? `Grad ${i.proposal.grade} · ${i.proposal.locationCode} · ${i.proposal.refundNok === null ? 'refusjon: du avgjør' : nok(i.proposal.refundNok)}` : 'Ingen grad ennå'}
                </span>
              )}
            </Fact>
            {(current?.cause ?? i.proposal.cause) && <Fact label="Sannsynlig årsak">{CAUSE_NB[(current?.cause ?? i.proposal.cause)!]}</Fact>}
            <Fact label="Ordreverdi">{nok(i.lineValueNok)} (maks refusjon)</Fact>
            {i.suspiciousNote && (
              <Fact label="Kundelapp">
                <span className="font-semibold text-bad">Inneholder instruksjoner, lest som tekst</span>
              </Fact>
            )}
            {i.workerNote && (
              <Fact label="Medarbeider sa">
                <span className="block">«{i.workerNote.original}» <span className="text-sm text-muted">({LANG_NB[i.workerNote.lang ?? ''] ?? i.workerNote.lang})</span></span>
                {i.workerNote.nb && i.workerNote.lang !== 'nb' && <span className="block text-sm text-muted">Norsk: «{i.workerNote.nb}»</span>}
              </Fact>
            )}
            {i.packEvidence && (
              <Fact label="Pakkebevis">
                {EVIDENCE_NB[i.packEvidence.status] ?? i.packEvidence.status}, størrelse {i.packEvidence.sizeVerified ? 'lest' : 'ikke lest'}
              </Fact>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            {i.photos.map((p) => (
              <figure key={p.photoId} className="w-24 text-center text-xs">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={PURPOSE_NB[p.purpose] ?? p.purpose} className="h-24 w-24 rounded-lg object-cover" />
                  </a>
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-slate-100 text-muted">{p.facesDiscarded ? 'Slettet' : '—'}</div>
                )}
                <figcaption className="mt-0.5 leading-tight">
                  {PURPOSE_NB[p.purpose] ?? p.purpose}
                  {p.sizeRead ? ` · ${p.sizeRead}` : ''}
                  {p.confidence !== null && <span className="block text-muted">{Math.round(p.confidence * 100)} % · {p.model?.replace(/^gemini-/, '')}</span>}
                </figcaption>
              </figure>
            ))}
            {i.packEvidence?.photoUrl && (
              <figure className="w-24 text-center text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.packEvidence.photoUrl} alt="Pakkebevis" className="h-24 w-24 rounded-lg object-cover ring-2 ring-slate-300" />
                <figcaption className="mt-0.5">Pakkebevis</figcaption>
              </figure>
            )}
          </div>
        </div>
      )}

      {card.order && !resolved && (
        <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-base">
          <Fact label="Pakkesjekk">
            {EVIDENCE_NB[card.order.status] ?? card.order.status}
            {card.order.manualReason ? ` (${MANUAL_NB[card.order.manualReason] ?? card.order.manualReason})` : ''}, størrelse {card.order.sizeVerified ? 'lest' : 'ikke lest'}
          </Fact>
        </dl>
      )}

      {!resolved && (
        <div className="mt-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary px-4" disabled={busy || !card.actions.approve} onClick={() => submit({ action: 'approve' })} title={card.actions.refundRequired ? 'Refusjonen må settes først' : undefined}>
              Godkjenn
            </button>
            {card.actions.override && (
              <button className={`btn-secondary px-4 ${form === 'override' ? 'ring-2 ring-accent' : ''}`} disabled={busy} onClick={() => setForm(form === 'override' ? null : 'override')}>
                Overstyr
              </button>
            )}
            {card.actions.reject && (
              <button className={`btn-secondary px-4 text-bad ${form === 'reject' ? 'ring-2 ring-bad' : ''}`} disabled={busy} onClick={() => setForm(form === 'reject' ? null : 'reject')}>
                {i ? 'Avvis refusjon' : 'Avvis'}
              </button>
            )}
            {card.actions.refundRequired && <span className="self-center text-sm text-warn">Refusjonen avgjøres av deg: bruk Overstyr.</span>}
          </div>

          {form && (
            <form
              className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (form === 'reject') void submit({ action: 'reject', reason });
                else void submit({ action: 'override', grade, locationCode: shelf || undefined, refundNok: refund === '' ? undefined : Number(refund), reason });
              }}
            >
              {form === 'override' && i && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    Grad
                    <select value={grade} onChange={(e) => setGrade(e.target.value as 'A')} className="min-h-11 rounded-lg border px-2 text-base" name="grade">
                      {(['A', 'B', 'C', 'D'] as const).map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Hylle
                    <select value={shelf} onChange={(e) => setShelf(e.target.value)} className="min-h-11 rounded-lg border px-2 text-base" name="shelf">
                      <option value="">Etter grad (automatisk)</option>
                      {locations.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Refusjon (maks {nok(i.lineValueNok)})
                    <input type="number" min={0} max={i.lineValueNok} value={refund} onChange={(e) => setRefund(e.target.value)} className="min-h-11 rounded-lg border px-2 text-base" name="refund" />
                  </label>
                </>
              )}
              {form === 'reject' && <p className="text-sm sm:col-span-3">{i ? 'Refusjonen settes til 0 kr. Grad og hylle beholdes.' : 'Saken lukkes som avvist.'}</p>}
              <label className="flex flex-col gap-1 text-sm sm:col-span-3">
                Grunn (påkrevd)
                <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} className="min-h-11 rounded-lg border px-2 text-base" name="reason" placeholder="Hvorfor?" />
              </label>
              <div className="sm:col-span-3">
                <button type="submit" className="btn-primary px-4" disabled={busy || !reason.trim()}>
                  {form === 'reject' ? 'Avvis' : 'Lagre overstyring'}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="text-base font-semibold text-bad">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
