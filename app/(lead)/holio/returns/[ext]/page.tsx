import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { productMap } from '@/lib/engine/catalog';
import { loadReturnView } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CAUSE_NB: Record<string, string> = {
  likely_warehouse_error: 'Sannsynlig pakkefeil',
  inconclusive: 'Uklar',
  unknown: 'Ukjent',
  customer_side: 'Kundens side',
  transit_damage: 'Transportskade',
};
const FLAG_NB: Record<string, string> = {
  suspicious_note: 'Mistenkelig kundelapp',
  wrong_item: 'Feil vare',
  late_return: 'For sen retur',
  carrier_claim: 'Transportørkrav',
};
const STATUS_NB: Record<string, string> = {
  pending: 'Venter',
  inspecting: 'Under kontroll',
  awaiting_confirm: 'Venter på bekreftelse',
  confirmed: 'Bekreftet',
  escalated: 'Hos teamleder',
};
const SEV_NB: Record<string, string> = { none: 'ingen', minor: 'litt', major: 'mye' };

interface Tilstand {
  damage: string;
  stains: string;
  packaging: string;
  tagsAttached: boolean | 'unknown';
  unusable: boolean;
}

function tilstandText(c: Tilstand | undefined): string {
  if (!c) return '—';
  const tags = c.tagsAttached === 'unknown' ? 'ukjent' : c.tagsAttached ? 'festet' : 'fjernet';
  return `Skade ${SEV_NB[c.damage]}, flekker ${SEV_NB[c.stains]}, merkelapp ${tags}, emballasje ${c.packaging}${c.unusable ? ', ubrukelig' : ''}`;
}

/** One return as Holio would show it, plus the fields Sjekkpunkt adds (addendum section 7). */
export default async function HolioReturnRecord({ params }: PageProps<'/holio/returns/[ext]'>) {
  const user = await requireRole(['lead', 'admin']);
  const { ext } = await params;
  const view = await loadReturnView(decodeURIComponent(ext), user.warehouseId);
  if (!view) notFound();

  const { data: events } = await createAdminClient()
    .from('integration_events')
    .select('id, type, payload, created_at')
    .eq('warehouse_id', user.warehouseId)
    .eq('payload->>retur', view.ret.id)
    .order('created_at', { ascending: true });
  const itemEvent = (sku: string) =>
    (events ?? []).filter((e) => e.type === 'return.item.decided' && e.payload?.bestiltSku === sku).at(-1)?.payload as
      | { tilstand?: Tilstand; merknad?: string | null; kundelapp?: string | null }
      | undefined;

  const pm = productMap(view.products);
  const ev = view.packEvidence?.check;
  const evidenceText = !ev
    ? 'Ingen'
    : ev.status === 'VERIFIED'
      ? `Verifisert${ev.sizeVerified ? ', størrelse lest' : ', størrelse ikke lest'}`
      : 'Manuelt bekreftet, størrelse ikke lest';

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Holio WMS (mock) · Retur {view.ret.id}</h1>
        <Link href="/holio" className="underline">
          Alle returer
        </Link>
      </div>

      <Card title="Retur">
        <dl className="grid grid-cols-[10rem_1fr] gap-x-6 gap-y-2 text-base">
          <dt className="text-muted">Retur</dt>
          <dd className="font-mono">{view.ret.id}</dd>
          <dt className="text-muted">Ordre</dt>
          <dd className="font-mono">{view.order.id}</dd>
          <dt className="text-muted">Returårsak</dt>
          <dd>{view.ret.customerReasonNb}</dd>
          <dt className="text-muted">Bekreft retur</dt>
          <dd className={view.status === 'confirmed' ? 'font-semibold text-ok' : ''}>{STATUS_NB[view.status] ?? view.status}</dd>
          <dt className="text-muted">Pakkebevis</dt>
          <dd className="flex items-center gap-3">
            {view.packEvidence?.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.packEvidence.photoUrl} alt="Pakkebevis" className="h-16 w-16 rounded object-cover" />
            )}
            {evidenceText}
          </dd>
        </dl>
      </Card>

      {view.items.map((it) => {
        const d = it.committed;
        const e = itemEvent(it.orderedSku);
        const received = d?.receivedSku ?? it.orderedSku;
        return (
          <Card key={it.id} title={`Vare ${it.index + 1}: ${pm.get(it.orderedSku)?.nameNb ?? it.orderedSku}`}>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-6 gap-y-2 text-base">
              <dt className="text-muted">Varenummer</dt>
              <dd className="font-mono">
                {it.orderedSku}
                {d?.receivedSku && d.receivedSku !== it.orderedSku && <span className="text-bad"> → mottatt {d.receivedSku}</span>}
              </dd>
              <dt className="text-muted">Lokasjon</dt>
              <dd className="font-mono text-xl font-bold">{d?.locationCode ?? '—'}</dd>
              <dt className="text-muted">Grad</dt>
              <dd className="text-xl font-bold">{d?.grade ?? '—'}</dd>
              <dt className="text-muted">Tilstand</dt>
              <dd>{tilstandText(e?.tilstand)}</dd>
              <dt className="text-muted">Refusjon</dt>
              <dd>{d ? (d.refundNok === null ? 'Teamleder avgjør' : `${d.refundNok} kr`) : '—'}</dd>
              <dt className="text-muted">Sannsynlig årsak</dt>
              <dd>{d?.cause ? CAUSE_NB[d.cause] : '—'}</dd>
              <dt className="text-muted">Flagg</dt>
              <dd className="flex flex-wrap gap-2">
                {(d?.flags ?? []).length === 0
                  ? '—'
                  : d!.flags.map((f) => (
                      <span key={f} className={`rounded-full px-3 py-0.5 text-sm font-semibold ${f === 'suspicious_note' ? 'bg-red-50 text-bad' : 'bg-amber-50 text-warn'}`}>
                        {FLAG_NB[f] ?? f}
                      </span>
                    ))}
              </dd>
              <dt className="text-muted">Merknad</dt>
              <dd>{e?.merknad ?? '—'}</dd>
              <dt className="text-muted">Kundelapp</dt>
              <dd className="italic">{e?.kundelapp ? `«${e.kundelapp}» (lest som tekst)` : '—'}</dd>
              <dt className="text-muted">Status</dt>
              <dd>{it.status === 'decided' ? 'Bestemt' : it.status === 'escalated' ? 'Hos teamleder' : 'Ikke bestemt'}</dd>
              <dt className="text-muted">Bilder</dt>
              <dd className="flex flex-wrap gap-2">
                {it.photos.filter((p) => p.url).length === 0
                  ? '—'
                  : it.photos
                      .filter((p) => p.url)
                      .map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.photoId} src={p.url!} alt={p.purpose} title={p.purpose} className="h-20 w-20 rounded object-cover" />
                      ))}
              </dd>
            </dl>
            {received !== it.orderedSku && <p className="mt-2 text-sm text-muted">Returen er bokført mot varen som faktisk kom tilbake.</p>}
          </Card>
        );
      })}

      <Card title="Integrasjonshendelser (det Holio ville mottatt)">
        {(events ?? []).length === 0 ? (
          <p className="text-muted">Ingen ennå.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <div className="font-mono text-sm font-semibold">
                  {e.type} · {new Date(e.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}
                </div>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(e.payload, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
