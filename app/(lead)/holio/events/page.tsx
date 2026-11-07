import Link from 'next/link';
import { HolioBar, HolioCard, HolioPayload } from '@/components/holio';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

// Every event Sjekkpunkt would send to Holio (addendum section 7), newest first. The payloads
// use Holio's vocabulary; this list is how the pitch shows "it writes into Holio" without an API.

const TYPES = ['pack.verified', 'pack.manual_confirm', 'return.item.decided', 'return.confirmed', 'stock.adjustment.approved'] as const;
type EventType = (typeof TYPES)[number];

const TYPE_NB: Record<EventType, string> = {
  'pack.verified': 'Pakke verifisert',
  'pack.manual_confirm': 'Pakke manuelt bekreftet',
  'return.item.decided': 'Returvare avgjort',
  'return.confirmed': 'Retur bekreftet',
  'stock.adjustment.approved': 'Lagerjustering godkjent',
};

const LIMIT = 100;

function summary(type: string, p: Record<string, unknown>): string {
  switch (type) {
    case 'pack.verified':
    case 'pack.manual_confirm':
      return `Ordre ${p.ordre} · ${p.metode}${p.manuellGrunn ? ` · ${p.manuellGrunn}` : ''}`;
    case 'return.item.decided':
      return `Retur ${p.retur} · ${p.mottattSku ?? p.bestiltSku} · grad ${p.grad} · ${p.lokasjon}${p.overstyrt ? ' · overstyrt' : ''}`;
    case 'return.confirmed':
      return `Retur ${p.retur} · ${Array.isArray(p.varer) ? p.varer.length : 0} vare(r)`;
    case 'stock.adjustment.approved':
      return `${p.sku ?? ''} ${typeof p.endring === 'number' && p.endring > 0 ? '+' : ''}${p.endring ?? ''}${p.aarsak ? ` · ${p.aarsak}` : ''}`.trim();
    default:
      return '';
  }
}

function recordHref(type: string, p: Record<string, unknown>): string | null {
  if (type.startsWith('pack.') && typeof p.ordre === 'string') return `/holio/orders/${p.ordre}`;
  if (type.startsWith('return.') && typeof p.retur === 'string') return `/holio/returns/${p.retur}`;
  return null;
}

export default async function HolioEventsPage({ searchParams }: PageProps<'/holio/events'>) {
  await requireRole(['lead', 'admin']);
  const raw = (await searchParams).type;
  const type = TYPES.find((t) => t === raw) ?? null;

  const supabase = await createClient();
  let q = supabase.from('integration_events').select('id, type, payload, created_at').order('created_at', { ascending: false }).limit(LIMIT);
  if (type) q = q.eq('type', type);
  const { data: events, error } = await q;
  if (error) throw new Error(`integration events: ${error.message}`);

  const chip = (t: EventType | null, label: string) => (
    <Link
      key={t ?? 'all'}
      href={t ? `/holio/events?type=${t}` : '/holio/events'}
      aria-current={t === type ? 'page' : undefined}
      className="holio-chip"
    >
      {label}
    </Link>
  );

  return (
    <>
      <HolioBar title="Holio WMS (mock) · Integrasjon" link={{ href: '/holio', label: 'Oversikt' }} />
      <p className="holio-muted m-0">
        Hendelsene Sjekkpunkt ville sendt til Holio, med Holios feltnavn. Det finnes ikke noe åpent Holio-API ennå, så de lagres her.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Hendelsestype">
        {chip(null, 'Alle')}
        {TYPES.map((t) => chip(t, t))}
      </nav>
      <HolioCard title={`${type ? TYPE_NB[type] : 'Alle hendelser'} (nyeste ${LIMIT})`}>
        {(events ?? []).length === 0 ? (
          <p className="holio-muted">Ingen hendelser.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0" data-testid="integration-events">
            {(events ?? []).map((e) => {
              const p = (e.payload ?? {}) as Record<string, unknown>;
              const href = recordHref(e.type, p);
              return (
                <li key={e.id} className="border-t border-[#c5d0dc] py-2 first:border-t-0" data-type={e.type}>
                  <details>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="holio-mono font-semibold">{e.type}</span>
                      <span>{summary(e.type, p)}</span>
                      <span className="holio-muted ml-auto">{new Date(e.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}</span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {href && <Link href={href}>Åpne i Holio (mock)</Link>}
                      <HolioPayload value={e.payload} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </HolioCard>
    </>
  );
}
