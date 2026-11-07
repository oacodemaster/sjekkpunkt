'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { fileToJpeg } from '@/lib/camera/image';
import { ADMIN_ERROR_NB, send } from './api';

export interface ProductFormValues {
  sku: string;
  name_nb: string;
  name_en: string;
  category: 'apparel' | 'accessory';
  color: string;
  size: string;
  price_nok: number;
  location_code: string;
  variant_group: string;
  barcode: string;
}

const FIELD_NB: Record<string, string> = {
  sku: 'SKU',
  name_nb: 'Navn (norsk)',
  name_en: 'Navn (engelsk)',
  color: 'Farge',
  size: 'Størrelse',
  price_nok: 'Pris',
  location_code: 'Hylle',
  variant_group: 'Variantgruppe',
  barcode: 'Strekkode',
};

export function ProductForm({ mode, initial, locations, groups }: { mode: 'create' | 'edit'; initial: ProductFormValues; locations: string[]; groups: string[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text?: string }>({ kind: 'idle' });
  const set = (k: keyof ProductFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: k === 'price_nok' ? Number(e.target.value || 0) : k === 'sku' ? e.target.value.toUpperCase() : e.target.value }));

  const save = async () => {
    setState({ kind: 'saving' });
    const { sku, ...rest } = v;
    const r = mode === 'create' ? await send('POST', '/api/admin/products', v) : await send('PATCH', `/api/admin/products/${encodeURIComponent(sku)}`, rest);
    if (!r.ok) {
      const fields = (r.body.issues as string[] | undefined)?.map((f) => FIELD_NB[f] ?? f).join(', ');
      return setState({ kind: 'error', text: `${ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed}${fields ? ` Sjekk: ${fields}.` : ''}` });
    }
    setState({ kind: 'saved', text: 'Lagret.' });
    if (mode === 'create') router.push(`/admin/products/${encodeURIComponent(sku)}`);
    else router.refresh();
  };

  const input = (k: keyof ProductFormValues, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{FIELD_NB[k]}</span>
      <input name={k} value={v[k]} onChange={set(k)} className="rounded-lg border border-slate-300 px-3 py-2 text-base" {...props} />
    </label>
  );

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="product-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {input('sku', { readOnly: mode === 'edit', required: true, pattern: '[A-Z0-9][A-Z0-9-]{1,39}', className: `rounded-lg border border-slate-300 px-3 py-2 font-mono text-base ${mode === 'edit' ? 'bg-slate-100' : ''}` })}
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Kategori</span>
          <select name="category" value={v.category} onChange={set('category')} className="rounded-lg border border-slate-300 px-3 py-2 text-base">
            <option value="apparel">Klær</option>
            <option value="accessory">Tilbehør</option>
          </select>
        </label>
        {input('name_nb', { required: true })}
        {input('name_en', { required: true })}
        {input('color', { required: true })}
        {input('size')}
        {input('price_nok', { type: 'number', min: 0, step: 1, required: true })}
        {input('location_code', { list: 'locations', required: true, className: 'rounded-lg border border-slate-300 px-3 py-2 font-mono text-base' })}
        {input('variant_group', { list: 'groups' })}
        {input('barcode', { inputMode: 'numeric', className: 'rounded-lg border border-slate-300 px-3 py-2 font-mono text-base' })}
      </div>
      <datalist id="locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <datalist id="groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <p className="text-sm text-muted">
        Varianter av samme vare (for eksempel størrelser eller farger) deler variantgruppe; det er de bildeanalysen må skille fra hverandre. En ny hylle blir opprettet som lagerhylle.
      </p>
      <div className="flex items-center gap-4">
        <button className="btn-primary" disabled={state.kind === 'saving'}>
          {state.kind === 'saving' ? 'Lagrer…' : mode === 'create' ? 'Opprett vare' : 'Lagre endringer'}
        </button>
        {state.text && (
          <span role="status" data-testid="product-status" className={state.kind === 'error' ? 'text-bad' : 'text-ok'}>
            {state.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function ReferencePhotos({ sku, photos }: { sku: string; photos: { id: string; url: string | null }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const jpeg = await fileToJpeg(file); // ~1024 px, EXIF dropped
      const fd = new FormData();
      fd.append('photo', jpeg, 'reference.jpg');
      const r = await send('POST', `/api/admin/products/${encodeURIComponent(sku)}/photos`, fd);
      setMsg(r.ok ? { bad: false, text: 'Bildet er lagt til.' } : { bad: true, text: ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed });
      router.refresh();
    } catch {
      setMsg({ bad: true, text: 'Kunne ikke lese bildet.' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    const r = await send('DELETE', `/api/admin/products/${encodeURIComponent(sku)}/photos/${id}`);
    setBusy(false);
    setMsg(r.ok ? { bad: false, text: 'Bildet er fjernet.' } : { bad: true, text: ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="reference-photos">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id} className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            {p.url ? <img src={p.url} alt={`Referansebilde ${i + 1}`} className="aspect-square w-full rounded-lg bg-slate-100 object-cover" /> : <div className="aspect-square rounded-lg bg-slate-100" />}
            <span className="flex items-center justify-between text-sm">
              <span className="text-muted">{i === 0 ? 'Brukes av bildeanalysen' : `Bilde ${i + 1}`}</span>
              <button className="text-bad underline" disabled={busy} onClick={() => void remove(p.id)}>
                Fjern
              </button>
            </span>
          </li>
        ))}
      </ul>
      {photos.length < 4 && (
        <label className="btn-secondary w-fit cursor-pointer">
          {busy ? 'Laster opp…' : 'Legg til referansebilde'}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            data-testid="reference-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
      {msg && (
        <span role="status" className={msg.bad ? 'text-bad' : 'text-ok'}>
          {msg.text}
        </span>
      )}
      <p className="text-sm text-muted">Bare varen, ingen personer. Bildet skaleres ned og stedsdata fjernes før opplasting. Referansebilder slettes ikke automatisk.</p>
    </div>
  );
}
