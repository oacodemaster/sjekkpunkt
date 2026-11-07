'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { checkImport, IMPORT_TEMPLATES, ISSUE_NB, type ImportIssue } from '@/lib/admin/csv';
import { IMPORT_COLUMNS, type ImportKind } from '@/lib/admin/schemas';
import { ADMIN_ERROR_NB, send } from './api';

const KIND_NB: Record<ImportKind, string> = { products: 'Varer', orders: 'Ordrer', returns: 'Returer' };
const UNIT_NB: Record<ImportKind, [string, string]> = { products: ['varer', 'varer'], orders: ['ordrer', 'linjer'], returns: ['returer', 'varer'] };

type Result =
  | { kind: 'issues'; issues: ImportIssue[] }
  | { kind: 'ready'; entities: number; lines: number }
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string };

/** Pick a CSV, check it (file rules in the browser, then the server's database checks), then import. */
export function ImportForm() {
  const router = useRouter();
  const [kind, setKind] = useState<ImportKind>('products');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (dryRun: boolean) => {
    if (!file) return;
    // Same rules as the server, so most problems show without a round trip.
    const local = checkImport(kind, file.text);
    if (!local.plan) return setResult({ kind: 'issues', issues: local.issues });
    setBusy(true);
    const r = await send<{ entities?: number; lines?: number; created?: number; updated?: number }>('POST', '/api/admin/import', { kind, csv: file.text, dryRun, fileName: file.name });
    setBusy(false);
    if (!r.ok) {
      if (r.error === 'invalid_rows') return setResult({ kind: 'issues', issues: (r.body.issues as ImportIssue[]) ?? [] });
      return setResult({ kind: 'error', text: `${ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed}${r.body.ref ? ` (${r.body.ref})` : ''} Ingenting er importert.` });
    }
    if (dryRun) return setResult({ kind: 'ready', entities: r.entities ?? 0, lines: r.lines ?? 0 });
    const [u1, u2] = UNIT_NB[kind];
    setResult({
      kind: 'done',
      text: kind === 'products' ? `Importert: ${r.created} nye ${u1}, ${r.updated} oppdatert.` : `Importert: ${r.created} ${u1} med ${r.lines} ${u2}.`,
    });
    setFile(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4" data-testid="import-form">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Hva importeres</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ImportKind);
              setResult(null);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base"
            name="kind"
          >
            {(Object.keys(KIND_NB) as ImportKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_NB[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">CSV-fil</span>
          <input
            type="file"
            accept=".csv,text/csv"
            data-testid="import-file"
            className="text-base"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(null);
              setFile(f ? { name: f.name, text: await f.text() } : null);
            }}
          />
        </label>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATES[kind])}`}
          download={`sjekkpunkt-${kind}-mal.csv`}
          className="pb-2 text-accent underline"
        >
          Last ned mal
        </a>
      </div>
      <p className="text-sm text-muted">
        Kolonner: <span className="font-mono">{IMPORT_COLUMNS[kind].join(', ')}</span>. Komma eller semikolon. Én rad per {kind === 'products' ? 'vare' : kind === 'orders' ? 'ordrelinje' : 'returvare'}; rader med samme {kind === 'orders' ? 'ordre' : 'retur'} blir én {kind === 'orders' ? 'ordre' : 'retur'}.
        {kind === 'products' ? ' Finnes SKU-en, oppdateres varen.' : ' Nye ordrer og returer må ha nye numre.'}
      </p>
      <div className="flex gap-3">
        <button className="btn-secondary" disabled={!file || busy} onClick={() => void call(true)}>
          Sjekk filen
        </button>
        <button className="btn-primary" disabled={!file || busy || result?.kind !== 'ready'} onClick={() => void call(false)}>
          {busy ? 'Jobber…' : 'Importer'}
        </button>
      </div>

      {result?.kind === 'issues' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4" data-testid="import-issues">
          <p className="font-semibold text-bad">Filen har {result.issues.length} feil. Ingenting er importert.</p>
          <ul className="mt-2 max-h-72 overflow-y-auto text-base">
            {result.issues.slice(0, 100).map((i, k) => (
              <li key={k}>
                Linje {i.line}
                {i.column ? ` · ${i.column}` : ''}: {ISSUE_NB[i.code] ?? i.code}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.kind === 'ready' && (
        <p role="status" className="text-ok" data-testid="import-ready">
          Filen er i orden: {result.entities} {UNIT_NB[kind][0]}
          {kind !== 'products' ? ` med ${result.lines} ${UNIT_NB[kind][1]}` : ''}. Trykk Importer for å lagre.
        </p>
      )}
      {result?.kind === 'done' && (
        <p role="status" className="font-semibold text-ok" data-testid="import-done">
          {result.text}
        </p>
      )}
      {result?.kind === 'error' && (
        <p role="status" className="text-bad">
          {result.text}
        </p>
      )}
    </div>
  );
}
