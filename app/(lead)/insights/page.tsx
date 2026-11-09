import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, Stat } from '@/components/desk-shell';
import { StatusChip } from '@/components/ui';
import { requireRole } from '@/lib/auth/dal';
import { loadInsights } from '@/lib/data/insights';
import { rangeSchema, type InsightsReport } from '@/lib/insights/compute';
import { createClient } from '@/lib/supabase/server';

const kr = (n: number) => `${n.toLocaleString('nb-NO')} kr`;
const GRADE_NB: Record<string, string> = { A: 'Som ny', B: 'Outlet', C: 'Reparasjon', D: 'Kassert' };

/** One-hue (ink) horizontal bar with the value in text beside it. Labels wrap, never truncate. */
function Bar({ label, value, max, detail, testId }: { label: ReactNode; value: number; max: number; detail?: string; testId?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <li
      className={`grid items-center gap-3 ${detail ? 'grid-cols-[minmax(6rem,12rem)_1fr_2.5rem_auto]' : 'grid-cols-[minmax(6rem,12rem)_1fr_2.5rem]'}`}
      data-testid={testId}
      title={detail ? `${value} · ${detail}` : String(value)}
    >
      <span className="type-dense min-w-0 [overflow-wrap:anywhere]">{label}</span>
      <span className="h-3 rounded-r-sm bg-line" aria-hidden>
        <span className="block h-3 rounded-r-sm bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="type-code-dense text-right font-bold">{value}</span>
      {detail && <span className="type-code-dense text-right text-ink-2">{detail}</span>}
    </li>
  );
}

function AlertBadge({ origin }: { origin: 'auto' | 'manual' | null }) {
  if (!origin) return <span className="text-ink-2">–</span>;
  return (
    <StatusChip desk tone="warn">
      Pakkevarsel aktivt{origin === 'manual' ? ' (manuelt)' : ''}
    </StatusChip>
  );
}

function Reasons({ reasons }: { reasons: { reason: string; count: number }[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <StatusChip key={r.reason} desk>
          {r.reason} <span className="sp-mono">{r.count}</span>
        </StatusChip>
      ))}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="type-dense m-0 text-ink-2">{children}</p>;
}

const list = 'm-0 flex list-none flex-col p-0';

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
          <h1 className="type-title m-0">Innsikt</h1>
          <p className="type-dense m-0 text-ink-2">Hele lageret samlet, siste {r.days} dager.</p>
        </div>
        <nav className="flex gap-2" aria-label="Periode" data-testid="range">
          {(['7d', '30d'] as const).map((k) => (
            <Link key={k} href={`/insights?range=${k}`} aria-current={k === range ? 'page' : undefined} className="sp-toggle">
              {k === '7d' ? '7 dager' : '30 dager'}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats">
        <Stat label="Feilpakkinger stoppet" value={r.nearMisses.caught} />
        <Stat label="Estimert spart" value={<span className="text-[28px]">{kr(r.nearMisses.estimatedSavedNok)}</span>} />
        <Stat label="Videresolgt (A og B)" value={<span className="text-[28px]">{kr(r.grades.resoldNok)}</span>} />
        <Stat label="Returer registrert" value={r.returnReasons.total} />
      </div>

      <Card title="Forvekslinger per SKU-par (7 og 30 dager)">
        {r.mixups.length === 0 ? (
          <Empty>Ingen forvekslinger siste 30 dager.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="sp-table" data-testid="mixups">
              <thead>
                <tr>
                  <th>Par</th>
                  <th className="text-right">7 dager</th>
                  <th className="text-right">30 dager</th>
                  <th className="pl-6">Funnet ({r.days} d)</th>
                  <th>Varsel</th>
                </tr>
              </thead>
              <tbody>
                {r.mixups.map((m) => (
                  <tr key={`${m.skuA}|${m.skuB}`} className={m.alert ? 'bg-warn-soft' : ''}>
                    <td>
                      <div className="type-dense-strong">{m.label}</div>
                      <div className="type-code-dense text-ink-2">
                        {m.skuA} / {m.skuB}
                      </div>
                    </td>
                    <td className="type-code-lg text-right">{m.last7}</td>
                    <td className="type-code text-right">{m.last30}</td>
                    <td className="pl-6 text-ink-2">
                      {m.caughtAtPacking} stoppet ved pakking · {m.foundAtReturns} funnet i retur
                    </td>
                    <td>
                      <AlertBadge origin={m.alert} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Grad og verdi tatt vare på">
          {r.grades.decided === 0 ? (
            <Empty>Ingen returer avgjort i perioden.</Empty>
          ) : (
            <>
              <ul className={`${list} gap-2`} data-testid="grades">
                {r.grades.byGrade.map((g) => (
                  <Bar key={g.grade} label={`${g.grade} · ${GRADE_NB[g.grade]}`} value={g.count} max={gradeMax} detail={kr(g.valueNok)} />
                ))}
              </ul>
              <dl className="m-0 mt-4 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-3" data-testid="value-recovered">
                <div>
                  <dt className="text-ink-2">Videresolgt (A og B)</dt>
                  <dd className="type-code m-0 font-bold">{kr(r.grades.resoldNok)}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">Til reparasjon (C)</dt>
                  <dd className="type-code m-0 font-bold">
                    {r.grades.repaired.count} <span className="font-normal text-ink-2">· {kr(r.grades.repaired.valueNok)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-2">Kassert (D)</dt>
                  <dd className="type-code m-0 font-bold">
                    {r.grades.scrapped.count} <span className="font-normal text-ink-2">· {kr(r.grades.scrapped.valueNok)}</span>
                  </dd>
                </div>
              </dl>
              <p className="m-0 mt-2 text-ink-2">Verdi er listepris for varen som kom inn.</p>
            </>
          )}
        </Card>

        <Card title="Sannsynlig årsak">
          {r.grades.decided === 0 ? (
            <Empty>Ingen returer avgjort i perioden.</Empty>
          ) : (
            <ul className={`${list} gap-2`} data-testid="causes">
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
            <p className="sp-stat__value m-0">{r.nearMisses.caught}</p>
            <p className="m-0">pakker med feil vare ble stoppet før forsegling.</p>
            <p className="type-code-lg m-0 mt-3">≈ {kr(r.nearMisses.estimatedSavedNok)}</p>
            <p className="m-0 text-ink-2">
              Estimat: {r.nearMisses.caught} × {kr(r.nearMisses.costPerParcelNok)} per feil pakke (innstilling i admin).
            </p>
          </div>
          <div>
            <h3 className="type-dense-strong m-0 mb-2">{r.nearMisses.sealed} pakker forseglet</h3>
            <ul className={`${list} gap-2`}>
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
              <h3 className="type-dense-strong m-0 mb-2">Per kategori</h3>
              <ul className={`${list} gap-3`} data-testid="reasons-category">
                {r.returnReasons.byCategory.map((c) => (
                  <li key={c.category} className="flex flex-col gap-1.5">
                    <ul className={list}>
                      <Bar label={c.label} value={c.total} max={catMax} />
                    </ul>
                    <Reasons reasons={c.reasons} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-x-auto">
              <h3 className="type-dense-strong m-0 mb-2">Per SKU (flest returer)</h3>
              <table className="sp-table" data-testid="reasons-sku">
                <tbody>
                  {r.returnReasons.bySku.map((s) => (
                    <tr key={s.sku}>
                      <td>
                        <div>{s.name}</div>
                        <div className="type-code-dense text-ink-2">{s.sku}</div>
                      </td>
                      <td className="type-code text-right font-bold">{s.total}</td>
                      <td>
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

      <footer className="type-dense-strong mt-auto border-t-2 border-line pt-4 text-center text-ink-2" data-testid="no-per-worker">
        Ingen statistikk per ansatt · No per-employee statistics
      </footer>
    </>
  );
}
