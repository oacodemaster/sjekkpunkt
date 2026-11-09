import { notFound } from 'next/navigation';
import { HolioBar, HolioCard, HolioPayload } from '@/components/holio';
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
  if (!c) return '–';
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
      <HolioBar title={`Holio WMS (mock) · Retur ${view.ret.id}`} link={{ href: '/holio', label: 'Alle returer' }} />

      <HolioCard title="Retur">
        <dl className="holio-kv">
          <dt>Retur</dt>
          <dd className="holio-mono">{view.ret.id}</dd>
          <dt>Ordre</dt>
          <dd className="holio-mono">{view.order.id}</dd>
          <dt>Returårsak</dt>
          <dd>{view.ret.customerReasonNb}</dd>
          <dt>Bekreft retur</dt>
          <dd className={view.status === 'confirmed' ? 'holio-ok' : ''}>{STATUS_NB[view.status] ?? view.status}</dd>
          <dt>Pakkebevis</dt>
          <dd className="flex items-center gap-3">
            {view.packEvidence?.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.packEvidence.photoUrl} alt="Pakkebevis" className="h-16 w-16 rounded-[2px] object-cover" />
            )}
            {evidenceText}
          </dd>
        </dl>
      </HolioCard>

      {view.items.map((it) => {
        const d = it.committed;
        const e = itemEvent(it.orderedSku);
        const received = d?.receivedSku ?? it.orderedSku;
        return (
          <HolioCard key={it.id} title={`Vare ${it.index + 1}: ${pm.get(it.orderedSku)?.nameNb ?? it.orderedSku}`}>
            <dl className="holio-kv">
              <dt>Varenummer</dt>
              <dd className="holio-mono">
                {it.orderedSku}
                {d?.receivedSku && d.receivedSku !== it.orderedSku && <span className="holio-bad"> → mottatt {d.receivedSku}</span>}
              </dd>
              <dt>Lokasjon</dt>
              <dd className="holio-mono text-[20px] font-bold">{d?.locationCode ?? '–'}</dd>
              <dt>Grad</dt>
              <dd className="text-[20px] font-bold">{d?.grade ?? '–'}</dd>
              <dt>Tilstand</dt>
              <dd>{tilstandText(e?.tilstand)}</dd>
              <dt>Refusjon</dt>
              <dd>{d ? (d.refundNok === null ? 'Teamleder avgjør' : `${d.refundNok} kr`) : '–'}</dd>
              <dt>Sannsynlig årsak</dt>
              <dd>{d?.cause ? CAUSE_NB[d.cause] : '–'}</dd>
              <dt>Flagg</dt>
              <dd className="flex flex-wrap gap-2">
                {(d?.flags ?? []).length === 0
                  ? '–'
                  : d!.flags.map((f) => (
                      <span key={f} className={`holio-tag ${f === 'suspicious_note' ? 'holio-bad' : 'holio-warn'}`}>
                        {FLAG_NB[f] ?? f}
                      </span>
                    ))}
              </dd>
              <dt>Merknad</dt>
              <dd>{e?.merknad ?? '–'}</dd>
              <dt>Kundelapp</dt>
              <dd className="italic">{e?.kundelapp ? `«${e.kundelapp}» (lest som tekst)` : '–'}</dd>
              <dt>Status</dt>
              <dd>{it.status === 'decided' ? 'Bestemt' : it.status === 'escalated' ? 'Hos teamleder' : 'Ikke bestemt'}</dd>
              <dt>Bilder</dt>
              <dd className="flex flex-wrap gap-2">
                {it.photos.filter((p) => p.url).length === 0
                  ? '–'
                  : it.photos
                      .filter((p) => p.url)
                      .map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.photoId} src={p.url!} alt={p.purpose} title={p.purpose} className="h-20 w-20 rounded-[2px] object-cover" />
                      ))}
              </dd>
            </dl>
            {received !== it.orderedSku && <p className="holio-muted mb-0 mt-2">Returen er bokført mot varen som faktisk kom tilbake.</p>}
          </HolioCard>
        );
      })}

      <HolioCard title="Integrasjonshendelser (det Holio ville mottatt)">
        {(events ?? []).length === 0 ? (
          <p className="holio-muted">Ingen ennå.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <div className="holio-mono font-semibold">
                  {e.type} · {new Date(e.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}
                </div>
                <HolioPayload value={e.payload} />
              </li>
            ))}
          </ul>
        )}
      </HolioCard>
    </>
  );
}
