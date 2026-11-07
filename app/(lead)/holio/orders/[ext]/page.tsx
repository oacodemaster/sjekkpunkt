import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/desk-shell';
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
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Holio WMS (mock) · Ordre {ctx.order.id}</h1>
        <Link href="/holio" className="underline">
          Oversikt
        </Link>
      </div>

      <Card title="Ordre">
        <dl className="grid grid-cols-[10rem_1fr] gap-x-6 gap-y-2 text-base">
          <dt className="text-muted">Ordre</dt>
          <dd className="font-mono">{ctx.order.id}</dd>
          <dt className="text-muted">Kunde</dt>
          <dd>{ctx.order.customerRef}</dd>
          <dt className="text-muted">Status</dt>
          <dd className={ctx.order.status === 'packed' ? 'font-semibold text-ok' : ''}>{STATUS_NB[ctx.order.status] ?? ctx.order.status}</dd>
          <dt className="text-muted">Linjer</dt>
          <dd>
            <ul>
              {ctx.order.lines.map((l) => (
                <li key={l.sku}>
                  {l.qty} × {pm.get(l.sku)?.nameNb ?? l.sku} <span className="font-mono text-sm text-muted">{l.sku}</span>
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </Card>

      <Card title="Pakkebevis">
        {(checks ?? []).length === 0 ? (
          <p className="text-muted">Ikke pakket ennå.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(checks ?? []).map((c) => {
              const url = pathOf(c) ? urls.get(pathOf(c)!) : c.photo_ref?.endsWith('.svg') ? `/demo/${c.photo_ref}` : undefined;
              return (
                <li key={c.id} className="flex items-center gap-4 rounded-xl border p-3" data-testid="pack-check-row">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="Pakkebevis" className="h-20 w-20 rounded object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded bg-slate-100 text-sm text-muted">—</div>
                  )}
                  <div>
                    <div className={`text-lg font-semibold ${c.status === 'MISMATCH' ? 'text-bad' : c.status === 'VERIFIED' ? 'text-ok' : 'text-warn'}`}>{CHECK_NB[c.status] ?? c.status}</div>
                    <div className="text-sm">
                      {METHOD_NB[c.method] ?? c.method} · størrelse {c.size_verified ? 'lest' : 'ikke lest'} · sikkerhet {Number(c.confidence).toFixed(2)}
                      {c.manual_reason && <> · grunn: {REASON_NB[c.manual_reason] ?? c.manual_reason}</>}
                    </div>
                    <div className="text-sm text-muted">{new Date(c.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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
