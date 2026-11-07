'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Banner, Button, GRADE_WORD_NB, GradeBadge, StatusChip } from '@/components/ui';
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
      className="sp-btn sp-btn--secondary sp-btn--desk"
      disabled={state === 'loading' || state === 'capped'}
      aria-label="Spill av oppsummering"
      title={state === 'capped' ? 'Opplesning er satt på pause til midnatt (dagens kostnadsgrense er nådd).' : undefined}
      data-testid="play-summary"
    >
      {state === 'loading' ? 'Lager lyd …' : state === 'playing' ? 'Stopp' : state === 'error' ? 'Prøv igjen' : state === 'capped' ? 'Opplesning på pause' : 'Spill av'}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
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
  const field = 'sp-input sp-input--desk';
  return (
    <li
      id={`esc-${card.id}`}
      onClick={onFocus}
      className={`sp-card sp-card--desk gap-3 p-5 ${resolved ? 'opacity-70' : focused ? 'border-2 border-ink' : ''}`}
      data-testid="escalation-card"
      data-reason={card.reason}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!resolved && <span className="sp-chip sp-chip--desk sp-mono">#{number}</span>}
        <StatusChip desk tone={resolved ? undefined : 'warn'}>
          {REASON_NB[card.reason] ?? card.reason}
        </StatusChip>
        {card.href ? (
          <Link href={card.href} className="sp-link type-code-dense" onClick={(e) => e.stopPropagation()}>
            {card.refLabel}
          </Link>
        ) : (
          <span className="type-code-dense">{card.refLabel}</span>
        )}
        <time className="type-code-dense text-ink-2">{time(card.createdAt)}</time>
        <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
          {card.summaryNb && <PlayButton id={card.id} />}
        </span>
      </div>
      <p className="type-dense m-0">{card.summaryNb}</p>

      {resolved && card.resolution && (
        <p className="type-dense m-0 text-ink-2">
          {card.resolution.action === 'override' ? 'Overstyrt' : card.resolution.action === 'reject' ? 'Avvist' : 'Godkjent'}
          {card.resolution.grade ? ` · grad ${card.resolution.grade}, ${card.resolution.locationCode}, ${nok(card.resolution.refundNok)}` : ''}
          {card.resolution.note ? ` · «${card.resolution.note}»` : ''}
        </p>
      )}

      {i && !resolved && (
        <div className="flex flex-col gap-3">
          <dl className="type-dense m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Fact label="Bestilt">{i.orderedName}</Fact>
            {i.receivedSku && i.receivedSku !== i.orderedSku && <Fact label="Mottatt">{i.receivedName}</Fact>}
            <Fact label={current ? 'Beslutning' : 'Motorens forslag'}>
              {current ? (
                <span data-testid="card-decision" className="flex flex-wrap items-center gap-2">
                  <GradeBadge desk grade={current.grade} kicker={`Grad ${current.grade}`} word={GRADE_WORD_NB[current.grade]} />
                  <span className="type-code-dense">{current.locationCode}</span>
                  {current.refundNok === null ? <b className="text-warn">refusjon: du avgjør</b> : <span className="type-code-dense">{nok(current.refundNok)}</span>}
                  {current.isOverride && <StatusChip desk>Overstyrt</StatusChip>}
                </span>
              ) : (
                // What the engine proposes: dashed until the lead decides.
                <span className="inline-block rounded-md border-2 border-dashed border-ink-2 px-2 py-1">
                  {i.proposal.grade ? `Grad ${i.proposal.grade} · ${i.proposal.locationCode} · ${i.proposal.refundNok === null ? 'refusjon: du avgjør' : nok(i.proposal.refundNok)}` : 'Ingen grad ennå'}
                </span>
              )}
            </Fact>
            {(current?.cause ?? i.proposal.cause) && <Fact label="Sannsynlig årsak">{CAUSE_NB[(current?.cause ?? i.proposal.cause)!]}</Fact>}
            <Fact label="Ordreverdi">
              <span className="type-code-dense">{nok(i.lineValueNok)}</span> (maks refusjon)
            </Fact>
            {i.suspiciousNote && (
              <Fact label="Kundelapp">
                <StatusChip desk tone="stop">
                  Inneholder instruksjoner, lest som tekst
                </StatusChip>
              </Fact>
            )}
            {i.workerNote && (
              <Fact label="Medarbeider sa">
                <span className="block">
                  «{i.workerNote.original}» <span className="text-ink-2">({LANG_NB[i.workerNote.lang ?? ''] ?? i.workerNote.lang})</span>
                </span>
                {i.workerNote.nb && i.workerNote.lang !== 'nb' && <span className="block italic text-ink-2">Norsk: «{i.workerNote.nb}»</span>}
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
              <figure key={p.photoId} className="m-0 w-28 text-[13px] leading-tight">
                <div className="sp-stage p-1">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={PURPOSE_NB[p.purpose] ?? p.purpose} className="block aspect-square w-full rounded-[4px] object-contain" />
                    </a>
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-ink-2-on-dark">{p.facesDiscarded ? 'Slettet' : '—'}</div>
                  )}
                </div>
                <figcaption className="mt-1">
                  {PURPOSE_NB[p.purpose] ?? p.purpose}
                  {p.sizeRead ? ` · ${p.sizeRead}` : ''}
                  {p.confidence !== null && (
                    <span className="sp-mono block text-ink-2">
                      {Math.round(p.confidence * 100)} % · {p.model?.replace(/^gemini-/, '')}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
            {i.packEvidence?.photoUrl && (
              <figure className="m-0 w-28 text-[13px] leading-tight">
                <div className="sp-stage p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.packEvidence.photoUrl} alt="Pakkebevis" className="block aspect-square w-full rounded-[4px] object-contain" />
                </div>
                <figcaption className="mt-1">Pakkebevis</figcaption>
              </figure>
            )}
          </div>
        </div>
      )}

      {card.order && !resolved && (
        <dl className="type-dense m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Fact label="Pakkesjekk">
            {EVIDENCE_NB[card.order.status] ?? card.order.status}
            {card.order.manualReason ? ` (${MANUAL_NB[card.order.manualReason] ?? card.order.manualReason})` : ''}, størrelse {card.order.sizeVerified ? 'lest' : 'ikke lest'}
          </Fact>
        </dl>
      )}

      {!resolved && (
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2">
            <Button desk icon="ok" disabled={busy || !card.actions.approve} onClick={() => submit({ action: 'approve' })} title={card.actions.refundRequired ? 'Refusjonen må settes først' : undefined}>
              Godkjenn
            </Button>
            {card.actions.override && (
              <Button desk variant="secondary" aria-expanded={form === 'override'} className={form === 'override' ? 'bg-surface-2' : ''} disabled={busy} onClick={() => setForm(form === 'override' ? null : 'override')}>
                Overstyr
              </Button>
            )}
            {card.actions.reject && (
              <Button desk variant="secondary" aria-expanded={form === 'reject'} className={form === 'reject' ? 'bg-surface-2' : ''} disabled={busy} onClick={() => setForm(form === 'reject' ? null : 'reject')}>
                {i ? 'Avvis refusjon' : 'Avvis'}
              </Button>
            )}
            {card.actions.refundRequired && <span className="type-dense text-warn">Refusjonen avgjøres av deg: bruk Overstyr.</span>}
          </div>

          {form && (
            <form
              className="grid gap-3 rounded-lg border-2 border-line bg-surface-2 p-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (form === 'reject') void submit({ action: 'reject', reason });
                else void submit({ action: 'override', grade, locationCode: shelf || undefined, refundNok: refund === '' ? undefined : Number(refund), reason });
              }}
            >
              {form === 'override' && i && (
                <>
                  <label className="type-dense-strong flex flex-col gap-1">
                    Grad
                    <select value={grade} onChange={(e) => setGrade(e.target.value as 'A')} className={field} name="grade">
                      {(['A', 'B', 'C', 'D'] as const).map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label className="type-dense-strong flex flex-col gap-1">
                    Hylle
                    <select value={shelf} onChange={(e) => setShelf(e.target.value)} className={`${field} sp-input--mono`} name="shelf">
                      <option value="">Etter grad (automatisk)</option>
                      {locations.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="type-dense-strong flex flex-col gap-1">
                    Refusjon (maks {nok(i.lineValueNok)})
                    <input type="number" min={0} max={i.lineValueNok} value={refund} onChange={(e) => setRefund(e.target.value)} className={`${field} sp-input--mono`} name="refund" />
                  </label>
                </>
              )}
              {form === 'reject' && <p className="type-dense m-0 sm:col-span-3">{i ? 'Refusjonen settes til 0 kr. Grad og hylle beholdes.' : 'Saken lukkes som avvist.'}</p>}
              <label className="type-dense-strong flex flex-col gap-1 sm:col-span-3">
                Grunn (påkrevd)
                <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} className={field} name="reason" placeholder="Hvorfor?" />
              </label>
              <div className="sm:col-span-3">
                <Button type="submit" desk variant={form === 'reject' ? 'destructive' : 'primary'} disabled={busy || !reason.trim()}>
                  {form === 'reject' ? 'Avvis' : 'Lagre overstyring'}
                </Button>
              </div>
            </form>
          )}
          {error && (
            <Banner tone="error" role="alert">
              {error}
            </Banner>
          )}
        </div>
      )}
    </li>
  );
}
