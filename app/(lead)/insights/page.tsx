import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, Stat } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { loadInsights } from '@/lib/data/insights';
import { rangeSchema, type InsightsReport } from '@/lib/insights/compute';
import { createClient } from '@/lib/supabase/server';

const kr = (n: number) => `${n.toLocaleString('nb-NO')} kr`;
const GRADE_NB: Record<string, string> = { A: 'Som ny', B: 'Outlet', C: 'Reparasjon', D: 'Kassert' };

/** One-hue horizontal bar with the value in text beside it (the table below each chart has the numbers too). */
function Bar({ label, value, max, detail, testId }: { label: ReactNode; value: number; max: number; detail?: string; testId?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <li
      className={`grid items-center gap-3 ${detail ? 'grid-cols-[minmax(7rem,12rem)_1fr_2.5rem_6rem]' : 'grid-cols-[minmax(7rem,12rem)_1fr_2.5rem]'}`}
      data-testid={testId}
      title={detail ? `${value} · ${detail}` : String(value)}
    >
      <span className="truncate text-base">{label}</span>
      <span className="h-3 rounded-r bg-slate-100" aria-hidden>
        <span className="block h-3 rounded-r bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right text-base font-semibold tabular-nums">{value}</span>
      {detail && <span className="text-right text-base text-muted tabular-nums">{detail}</span>}
    </li>
  );
}

function AlertBadge({ origin }: { origin: 'auto' | 'manual' | null }) {
  if (!origin) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-300">
      <span aria-hidden>⚠</span> Pakkevarsel aktivt{origin === 'manual' ? ' (manuelt)' : ''}
    </span>
  );
}

function Reasons({ reasons }: { reasons: { reason: string; count: number }[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <span key={r.reason} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm">
          {r.reason} <span className="font-semibold tabular-nums">{r.count}</span>
        </span>
      ))}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-base text-muted">{children}</p>;
}

export default async function InsightsPage({ searchParams }: PageProps<'/insights'>) {
  const user = await requireRole(['lead', 'admin']);
  const parsed = rangeSchema.safeParse((await searchParams).range);
  const range = parsed.success ? parsed.data : '7d';
  const r: InsightsReport = await loadInsights(await createClient(), user.warehouseId, range);
  const gradeMax = Math.max(...r.grades.byGrade.map((g) => g.count));
  const causeMax = Math.max(...r.causes.map((c) => c.count));
  const catMax = Math.max(0, ...r.returnReasons.byCategory.map((c) => c.total));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Innsikt</h1>
          <p className="text-base text-muted">Hele lageret samlet, siste {r.days} dager.</p>
        </div>
        <nav className="inline-flex rounded-xl border border-slate-300 bg-white p-1" aria-label="Periode" data-testid="range">
          {(['7d', '30d'] as const).map((k) => (
            <Link
              key={k}
              href={`/insights?range=${k}`}
              aria-current={k === range ? 'page' : undefined}
              className={`rounded-lg px-4 py-2 text-base font-semibold ${k === range ? 'bg-frame text-white' : 'text-foreground hover:bg-slate-100'}`}
            >
              {k === '7d' ? '7 dager' : '30 dager'}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="stats">
        <Stat label="Feilpakkinger stoppet" value={r.nearMisses.caught} />
        <Stat label="Estimert spart" value={<span className="text-3xl">{kr(r.nearMisses.estimatedSavedNok)}</span>} />
        <Stat label="Videresolgt (A og B)" value={<span className="text-3xl">{kr(r.grades.resoldNok)}</span>} />
        <Stat label="Returer registrert" value={r.returnReasons.total} />
      </div>

      <Card title="Forvekslinger per SKU-par (7 og 30 dager)">
        {r.mixups.length === 0 ? (
          <Empty>Ingen forvekslinger siste 30 dager.</Empty>
        ) : (
          <table className="w-full text-left text-base" data-testid="mixups">
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-1">Par</th>
                <th className="text-right">7 dager</th>
                <th className="text-right">30 dager</th>
                <th className="pl-6">Funnet ({r.days} d)</th>
                <th>Varsel</th>
              </tr>
            </thead>
            <tbody>
              {r.mixups.map((m) => (
                <tr key={`${m.skuA}|${m.skuB}`} className={`border-t ${m.alert ? 'bg-amber-50/60' : ''}`}>
                  <td className="py-2">
                    <div className="font-semibold">{m.label}</div>
                    <div className="font-mono text-sm text-muted">
                      {m.skuA} / {m.skuB}
                    </div>
                  </td>
                  <td className="text-right text-2xl font-bold tabular-nums">{m.last7}</td>
                  <td className="text-right text-xl tabular-nums">{m.last30}</td>
                  <td className="pl-6 text-sm text-muted">
                    {m.caughtAtPacking} stoppet ved pakking · {m.foundAtReturns} funnet i retur
                  </td>
                  <td>
                    <AlertBadge origin={m.alert} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Grad og verdi tatt vare på">
          {r.grades.decided === 0 ? (
            <Empty>Ingen returer avgjort i perioden.</Empty>
          ) : (
            <>
              <ul className="flex flex-col gap-2" data-testid="grades">
                {r.grades.byGrade.map((g) => (
                  <Bar key={g.grade} label={`${g.grade} · ${GRADE_NB[g.grade]}`} value={g.count} max={gradeMax} detail={kr(g.valueNok)} />
                ))}
              </ul>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-base" data-testid="value-recovered">
                <div>
                  <dt className="text-sm text-muted">Videresolgt (A og B)</dt>
                  <dd className="text-xl font-bold tabular-nums">{kr(r.grades.resoldNok)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Til reparasjon (C)</dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {r.grades.repaired.count} <span className="text-base font-normal text-muted">· {kr(r.grades.repaired.valueNok)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Kassert (D)</dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {r.grades.scrapped.count} <span className="text-base font-normal text-muted">· {kr(r.grades.scrapped.valueNok)}</span>
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-muted">Verdi er listepris for varen som kom inn.</p>
            </>
          )}
        </Card>

        <Card title="Sannsynlig årsak">
          {r.grades.decided === 0 ? (
            <Empty>Ingen returer avgjort i perioden.</Empty>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="causes">
              {r.causes.map((c) => (
                <Bar key={c.cause} label={c.label} value={c.count} max={causeMax} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Feilpakkinger stoppet ved pakking">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]" data-testid="near-misses">
          <div>
            <p className="text-4xl font-bold tabular-nums">{r.nearMisses.caught}</p>
            <p className="text-base">pakker med feil vare ble stoppet før forsegling.</p>
            <p className="mt-3 text-2xl font-bold tabular-nums">≈ {kr(r.nearMisses.estimatedSavedNok)}</p>
            <p className="text-sm text-muted">
              Estimat: {r.nearMisses.caught} × {kr(r.nearMisses.costPerParcelNok)} per feil pakke (innstilling i admin).
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-base font-semibold">{r.nearMisses.sealed} pakker forseglet</h3>
            <ul className="flex flex-col gap-2">
              <Bar label="Kamera" value={r.nearMisses.sealedBy.camera} max={r.nearMisses.sealed} />
              <Bar label="Strekkode" value={r.nearMisses.sealedBy.barcode} max={r.nearMisses.sealed} />
              <Bar label="Manuelt bekreftet" value={r.nearMisses.sealedBy.manual} max={r.nearMisses.sealed} />
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Returårsaker">
        {r.returnReasons.total === 0 ? (
          <Empty>Ingen returer registrert i perioden.</Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <div>
              <h3 className="mb-2 text-base font-semibold">Per kategori</h3>
              <ul className="flex flex-col gap-3" data-testid="reasons-category">
                {r.returnReasons.byCategory.map((c) => (
                  <li key={c.category} className="flex flex-col gap-1.5">
                    <ul>
                      <Bar label={c.label} value={c.total} max={catMax} />
                    </ul>
                    <Reasons reasons={c.reasons} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-base font-semibold">Per SKU (flest returer)</h3>
              <table className="w-full text-left text-base" data-testid="reasons-sku">
                <tbody>
                  {r.returnReasons.bySku.map((s) => (
                    <tr key={s.sku} className="border-t align-top">
                      <td className="py-2 pr-3">
                        <div>{s.name}</div>
                        <div className="font-mono text-sm text-muted">{s.sku}</div>
                      </td>
                      <td className="py-2 pr-3 text-right text-xl font-bold tabular-nums">{s.total}</td>
                      <td className="py-2">
                        <Reasons reasons={s.reasons} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <footer className="mt-auto border-t pt-4 text-center font-semibold text-muted" data-testid="no-per-worker">
        Ingen statistikk per ansatt · No per-employee statistics
      </footer>
    </>
  );
}
