'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminSettings } from '@/lib/admin/schemas';
import type { Lang } from '@/lib/engine/types';
import { LANG_NAMES, LANGS } from '@/lib/i18n/strings';
import { ADMIN_ERROR_NB, send } from './api';

type NumKey = Exclude<keyof AdminSettings, 'enabled_languages' | 'daily_spend_cap_nok' | 'grading_guide'>;

const FIELDS: { key: NumKey; label: string; help: string; step: number; min: number; max: number; unit?: string }[] = [
  { key: 'pack_confidence_min', label: 'Sikkerhet ved pakking', help: 'Under dette ber pakkestasjonen om etikettfoto (P3).', step: 0.01, min: 0.5, max: 0.99 },
  { key: 'return_confidence_min', label: 'Sikkerhet ved retur', help: 'Under dette ber returstasjonen om nytt bilde (R9).', step: 0.01, min: 0.5, max: 0.99 },
  { key: 'max_retakes', label: 'Maks nye bilder', help: 'Deretter manuell bekreftelse eller teamleder.', step: 1, min: 1, max: 5 },
  { key: 'confusion_threshold', label: 'Forvekslinger før varsel', help: 'Så mange forvekslinger av samme par åpner et pakkevarsel.', step: 1, min: 2, max: 10 },
  { key: 'confusion_window_days', label: 'Varselvindu', help: 'Forvekslingene telles innenfor så mange dager.', step: 1, min: 1, max: 90, unit: 'dager' },
  { key: 'return_window_days', label: 'Returfrist', help: 'Senere returer går til teamleder.', step: 1, min: 7, max: 365, unit: 'dager' },
  { key: 'photo_retention_days', label: 'Lagring av bilder', help: 'Bilder slettes etter så mange dager. Gjelder også bilder som allerede er lagret.', step: 1, min: 1, max: 365, unit: 'dager' },
  { key: 'wrong_parcel_cost_nok', label: 'Kostnad per feil pakke', help: 'Brukes i innsiktens estimat.', step: 1, min: 0, max: 10_000, unit: 'kr' },
];

export function SettingsForm({ initial }: { initial: AdminSettings }) {
  const router = useRouter();
  const [s, setS] = useState<AdminSettings>(initial);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text?: string }>({ kind: 'idle' });

  const changed = (Object.keys(s) as (keyof AdminSettings)[]).filter((k) => k !== 'grading_guide' && JSON.stringify(s[k]) !== JSON.stringify(initial[k]));

  const save = async () => {
    setState({ kind: 'saving' });
    const patch = Object.fromEntries(changed.map((k) => [k, s[k]]));
    const r = await send<{ changed: string[] }>('PATCH', '/api/admin/settings', patch);
    if (!r.ok) {
      const fields = (r.body.issues as string[] | undefined)?.join(', ');
      return setState({ kind: 'error', text: `${ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed}${fields ? ` (${fields})` : ''}` });
    }
    setState({ kind: 'saved', text: r.changed.length ? `Lagret: ${r.changed.join(', ')}` : 'Ingen endringer.' });
    router.refresh();
  };

  const toggleLang = (l: Lang) =>
    setS((x) => ({ ...x, enabled_languages: x.enabled_languages.includes(l) ? x.enabled_languages.filter((y) => y !== l) : LANGS.filter((y) => y === l || x.enabled_languages.includes(y)) }));

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="font-semibold">{f.label}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                name={f.key}
                step={f.step}
                min={f.min}
                max={f.max}
                value={s[f.key]}
                onChange={(e) => setS((x) => ({ ...x, [f.key]: e.target.value === '' ? x[f.key] : Number(e.target.value) }))}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-base tabular-nums"
              />
              {f.unit && <span className="text-muted">{f.unit}</span>}
            </span>
            <span className="text-sm text-muted">{f.help}</span>
          </label>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Språk på stasjonene</legend>
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <label key={l} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5">
              <input type="checkbox" name={`lang-${l}`} checked={s.enabled_languages.includes(l)} disabled={l === 'nb'} onChange={() => toggleLang(l)} />
              {LANG_NAMES[l]}
            </label>
          ))}
        </div>
        <span className="text-sm text-muted">Norsk er alltid på (teamleder og oversettelser). Språkvalget ved første oppstart og personvernsiden viser bare disse.</span>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Daglig kostnadstak</legend>
        <div className="flex flex-wrap gap-4">
          {(['vision', 'elevenlabs'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <span>{k === 'vision' ? 'Bildeanalyse' : 'Stemme (ElevenLabs)'}</span>
              <input
                type="number"
                name={`cap-${k}`}
                min={0}
                max={100_000}
                step={1}
                value={s.daily_spend_cap_nok[k]}
                onChange={(e) => setS((x) => ({ ...x, daily_spend_cap_nok: { ...x.daily_spend_cap_nok, [k]: Number(e.target.value || 0) } }))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-base tabular-nums"
              />
              <span className="text-muted">kr</span>
            </label>
          ))}
        </div>
        <span className="text-sm text-muted">Håndheves fra M8: når taket er nådd, går stasjonene over til bare knapper.</span>
      </fieldset>

      <div className="flex items-center gap-4">
        <button className="btn-primary" disabled={changed.length === 0 || state.kind === 'saving'}>
          {state.kind === 'saving' ? 'Lagrer…' : 'Lagre innstillinger'}
        </button>
        {state.text && (
          <span role="status" className={state.kind === 'error' ? 'text-bad' : 'text-ok'} data-testid="settings-status">
            {state.text}
          </span>
        )}
      </div>
    </form>
  );
}
