import { notFound } from 'next/navigation';
import { HolioBar, HolioCard, HolioPayload } from '@/components/holio';
import { requireRole } from '@/lib/auth/dal';
import { signedPhotoUrls } from '@/lib/db/common';
import { productMap } from '@/lib/engine/catalog';
import { loadPackContext } from '@/lib/pack/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUS_NB: Record<string, string> = { picked: 'Plukket', packed: 'Pakket', shipped: 'Sendt', returned_partial: 'Delvis returnert' };
const CHECK_NB: Record<string, string> = { VERIFIED: 'Verifisert', MANUAL_CONFIRM: 'Manuelt bekreftet', MISMATCH: 'Feil stoppet', NEEDS_LABEL_PHOTO: 'Etikett trengs' };
const METHOD_NB: Record<string, string> = { camera: 'kamera', barcode: 'strekkode', manual: 'manuelt' };
const REASON_NB: Record<string, string> = { polybag: 'plastpose', glare: 'gjenskinn', other: 'annet' };

/** One order as Holio would show it, plus the packing evidence Sjekkpunkt adds (addendum section 7). */
export default async function HolioOrderRecord({ params }: PageProps<'/holio/orders/[ext]'>) {
  const user = await requireRole(['lead', 'admin']);
  const { ext } = await params;
  const ctx = await loadPackContext({ ext: decodeURIComponent(ext) }, user.warehouseId);
  if (!ctx) notFound();
  const db = createAdminClient();
  const [{ data: checks }, { data: events }] = await Promise.all([
    db
      .from('pack_checks')
      .select('id, status, method, size_verified, confidence, manual_reason, created_at, photo_ref, photos:evidence_photo_id(storage_path)')
      .eq('order_id', ctx.orderId)
      .order('created_at', { ascending: false }),
    db
      .from('integration_events')
      .select('id, type, payload, created_at')
      .eq('warehouse_id', user.warehouseId)
      .in('type', ['pack.verified', 'pack.manual_confirm'])
      .eq('payload->>ordre', ctx.order.id)
      .order('created_at', { ascending: true }),
  ]);
  const pathOf = (c: { photos: unknown }) => {
    const p = Array.isArray(c.photos) ? c.photos[0] : c.photos;
    return (p as { storage_path?: string | null } | null)?.storage_path ?? null;
  };
  const urls = await signedPhotoUrls((checks ?? []).map(pathOf));
  const pm = productMap(ctx.products);

  return (
    <>
      <HolioBar title={`Holio WMS (mock) · Ordre ${ctx.order.id}`} link={{ href: '/holio', label: 'Oversikt' }} />

      <HolioCard title="Ordre">
        <dl className="holio-kv">
          <dt>Ordre</dt>
          <dd className="holio-mono">{ctx.order.id}</dd>
          <dt>Kunde</dt>
          <dd>{ctx.order.customerRef}</dd>
          <dt>Status</dt>
          <dd className={ctx.order.status === 'packed' ? 'holio-ok' : ''}>{STATUS_NB[ctx.order.status] ?? ctx.order.status}</dd>
          <dt>Linjer</dt>
          <dd>
            <ul className="m-0 list-none p-0">
              {ctx.order.lines.map((l) => (
                <li key={l.sku}>
                  {l.qty} × {pm.get(l.sku)?.nameNb ?? l.sku} <span className="holio-mono holio-muted">{l.sku}</span>
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </HolioCard>

      <HolioCard title="Pakkebevis">
        {(checks ?? []).length === 0 ? (
          <p className="holio-muted">Ikke pakket ennå.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(checks ?? []).map((c) => {
              const url = pathOf(c) ? urls.get(pathOf(c)!) : c.photo_ref?.endsWith('.svg') ? `/demo/${c.photo_ref}` : undefined;
              return (
                <li key={c.id} className="flex items-center gap-4 rounded-[3px] border border-[#c5d0dc] p-3" data-testid="pack-check-row">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="Pakkebevis" className="h-20 w-20 rounded-[2px] object-cover" />
                  ) : (
                    <div className="holio-muted flex h-20 w-20 items-center justify-center rounded-[2px] bg-[#e9eef3]">—</div>
                  )}
                  <div>
                    <div className={c.status === 'MISMATCH' ? 'holio-bad' : c.status === 'VERIFIED' ? 'holio-ok' : 'holio-warn'}>{CHECK_NB[c.status] ?? c.status}</div>
                    <div>
                      {METHOD_NB[c.method] ?? c.method} · størrelse {c.size_verified ? 'lest' : 'ikke lest'} · sikkerhet {Number(c.confidence).toFixed(2)}
                      {c.manual_reason && <> · grunn: {REASON_NB[c.manual_reason] ?? c.manual_reason}</>}
                    </div>
                    <div className="holio-muted">{new Date(c.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </HolioCard>

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
