// Client-side calls to the admin routes. Errors come back as a code for the Norwegian message table.

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; status: number; body: Record<string, unknown> };

export async function send<T = Record<string, unknown>>(method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, ...(json as T) };
    return { ok: false, error: (json.error as string) ?? 'failed', status: res.status, body: json };
  } catch {
    return { ok: false, error: 'offline', status: 0, body: {} };
  }
}

export const ADMIN_ERROR_NB: Record<string, string> = {
  invalid_body: 'Noen felt er ugyldige.',
  forbidden: 'Du har ikke tilgang.',
  offline: 'Ingen nettforbindelse. Prøv igjen.',
  failed: 'Noe gikk galt. Prøv igjen.',
  sku_exists: 'SKU-en finnes allerede.',
  sku_taken: 'SKU-en finnes allerede.',
  barcode_taken: 'Strekkoden brukes av en annen vare.',
  not_stock_location: 'Lokasjonen er ikke en lagerhylle (outlet, reparasjon og kassering kan ikke være en vares hylle).',
  not_found: 'Fant ikke varen.',
  too_many_photos: 'Maks fire referansebilder per vare.',
  too_large: 'Bildet er for stort.',
  not_jpeg: 'Bare JPEG-bilder.',
  invalid_rows: 'Filen har feil. Ingenting er importert.',
  order_exists: 'Ordren finnes allerede.',
  return_exists: 'Returen finnes allerede.',
  unknown_sku: 'Ukjent SKU.',
  unknown_order: 'Ukjent ordre.',
  sku_not_in_order: 'SKU-en er ikke i ordren.',
  demo_disabled: 'Demomodus er slått av på denne installasjonen.',
  seed_not_loaded: 'Startdata mangler i databasen. Kjør pnpm db:seed én gang.',
};
