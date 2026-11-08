import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicHeader } from '@/components/public-header';
import { GUIDE, type GuideStep } from '@/lib/guide/content';
import { requestLang } from '@/lib/i18n/server';
import { imageOf } from '@/lib/play/catalog';

export const metadata: Metadata = {
  title: 'Slik virker det · Sjekkpunkt',
  description: 'Pakking, retur, løkka, stemmecoachen og teamlederen: slik virker Sjekkpunkt.',
};

function Pic({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-white">{i + 1}</span>
          <div>
            <h3 className="text-lg font-semibold leading-snug">{s.title}</h3>
            <p className="text-base text-slate-700">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Section({ id, title, children, className = '' }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-4 text-3xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

const GRADE_TONE: Record<string, string> = { A: 'bg-ok', B: 'bg-accent', C: 'bg-warn', D: 'bg-slate-600' };

/** How Sjekkpunkt works: public, Norwegian or English, with the generated sample photos. */
export default async function GuidePage({ searchParams }: PageProps<'/guide'>) {
  const lang = await requestLang(undefined, (await searchParams).lang);
  const g = GUIDE[lang === 'nb' ? 'nb' : 'en'];
  const demo = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';
  const toc = [
    ['packing', g.packing.title],
    ['returns', g.returns.title],
    ['loop', g.loop.title.split(':')[0]],
    ['voice', g.voice.title],
    ['lead', g.teamLead.title],
    ['languages', g.languages.title],
    ['privacy', g.privacy.title],
    ['roles', g.roles.title],
    ['faq', g.faq.title],
  ];

  return (
    <div className="flex flex-1 flex-col bg-white" lang={lang === 'nb' ? 'nb' : 'en'}>
      <PublicHeader lang={lang} current="guide" />

      {/* ---------------- hero ---------------- */}
      <div className="relative overflow-hidden bg-frame text-white">
        <Pic src="/sample/scenes/packing.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{g.title}</h1>
          <p className="max-w-2xl text-lg text-slate-200 sm:text-xl">{g.lead}</p>
          {demo && (
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/play" className="btn bg-white text-frame">
                {g.tryIt} →
              </Link>
              <Link href="/demo" className="btn border-2 border-slate-400 text-white">
                {g.scripted}
              </Link>
            </div>
          )}
          {lang !== 'nb' && lang !== 'en' && <p className="text-sm text-slate-300">{g.onlyNbEn}</p>}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12">
        {/* ---------------- short answer + contents ---------------- */}
        <section aria-labelledby="short-title" className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div>
            <h2 id="short-title" className="mb-4 text-3xl font-bold tracking-tight">
              {g.short.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {g.short.cards.map((c, i) => (
                <div key={c.title} className="rounded-2xl bg-slate-50 p-5">
                  <Pic src={imageOf(['HD-NAVY-M', 'JK-SHELL-L', 'HD-BLACK-M'][i])} alt="" className="mb-3 h-16 w-16 object-contain" />
                  <h3 className="text-xl font-bold">{c.title}</h3>
                  <p className="mt-1 text-base text-slate-700">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
          <nav aria-label={g.toc} className="rounded-2xl border border-slate-200 p-4 text-base">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{g.toc}</h2>
            <ul className="flex flex-col gap-1">
              {toc.map(([id, title]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-accent hover:underline">
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* ---------------- packing ---------------- */}
        <Section id="packing" title={g.packing.title}>
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <p className="text-lg">{g.packing.intro}</p>
              <Steps steps={g.packing.steps} />
              <p className="rounded-xl bg-amber-50 p-4 text-base text-amber-900">{g.packing.note}</p>
              {demo && (
                <Link href="/play" className="btn-primary self-start">
                  {g.packing.cta} →
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Pic src="/sample/scenes/packing.webp" alt={g.packing.imageAlt} className="w-full rounded-2xl object-cover shadow-lg" />
              <div className="grid grid-cols-2 gap-3">
                {(['HD-NAVY-M', 'HD-BLACK-M'] as const).map((sku, i) => (
                  <figure key={sku} className={`flex flex-col items-center rounded-2xl border-4 p-3 ${i === 0 ? 'border-ok' : 'border-bad'}`}>
                    <Pic src={imageOf(sku)} alt="" className="h-28 w-28 object-contain" />
                    <figcaption className={`text-base font-bold ${i === 0 ? 'text-ok' : 'text-bad'}`}>
                      {i === 0 ? (lang === 'nb' ? '✓ Marineblå, M' : '✓ Navy, M') : lang === 'nb' ? '✕ Sort, M: feil vare' : '✕ Black, M: wrong item'}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------- returns ---------------- */}
        <Section id="returns" title={g.returns.title}>
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <Pic src="/sample/scenes/returns.webp" alt={g.returns.imageAlt} className="w-full rounded-2xl object-cover shadow-lg lg:order-2" />
            <div className="flex flex-col gap-5">
              <p className="text-lg">{g.returns.intro}</p>
              <Steps steps={g.returns.steps} />
            </div>
          </div>
          <h3 className="mb-3 mt-8 text-xl font-bold">{g.returns.gradesTitle}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.returns.grades.map((gr) => (
              <div key={gr.grade} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white ${GRADE_TONE[gr.grade]}`}>{gr.grade}</span>
                <div>
                  <p className="text-base">{gr.text}</p>
                  <p className="mt-1 font-mono text-sm text-muted">{gr.shelf}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-base text-red-900">{g.returns.note}</p>
        </Section>

        {/* ---------------- loop ---------------- */}
        <Section id="loop" title={g.loop.title} className="rounded-3xl bg-frame p-6 text-white sm:p-10">
          <p className="max-w-3xl text-lg text-slate-200">{g.loop.text}</p>
          <ol className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {g.loop.chain.map((c, i) => (
              <li key={c} className="flex items-center gap-2">
                <span className={`rounded-full px-4 py-2 text-base font-semibold ${i === g.loop.chain.length - 2 ? 'bg-warn text-white' : 'bg-white/10'}`}>{c}</span>
                {i < g.loop.chain.length - 1 && (
                  <span aria-hidden className="text-xl text-slate-400 sm:mx-1">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-base text-slate-300">{g.loop.after}</p>
        </Section>

        {/* ---------------- voice + lead ---------------- */}
        <div className="grid gap-12 lg:grid-cols-2">
          {(
            [
              ['voice', g.voice, '/sample/scenes/voice.webp'],
              ['lead', g.teamLead, '/sample/scenes/lead.webp'],
            ] as const
          ).map(([id, s, img]) => (
            <Section key={id} id={id} title={s.title}>
              <Pic src={img} alt={s.imageAlt} className="mb-5 aspect-[3/2] w-full rounded-2xl object-cover shadow-lg" />
              <ul className="flex flex-col gap-2">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2 text-base">
                    <span aria-hidden className="text-ok">
                      ●
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>

        {/* ---------------- languages + privacy ---------------- */}
        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="languages" title={g.languages.title}>
            <p className="text-lg">{g.languages.text}</p>
            <p className="mt-3 flex flex-wrap gap-2">
              {['Norsk', 'English', 'Polski', 'Українська', 'Română', 'Lietuvių'].map((n) => (
                <span key={n} className="rounded-full bg-slate-100 px-3 py-1 text-base">
                  {n}
                </span>
              ))}
            </p>
          </Section>
          <Section id="privacy" title={g.privacy.title}>
            <ul className="flex flex-col gap-2">
              {g.privacy.points.map((p) => (
                <li key={p} className="flex gap-2 text-base">
                  <span aria-hidden>🔒</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <Link href={`/privacy?lang=${lang}`} className="mt-3 inline-block text-accent underline">
              {g.privacy.more}
            </Link>
          </Section>
        </div>

        {/* ---------------- roles ---------------- */}
        <Section id="roles" title={g.roles.title}>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[32rem] text-left text-base">
              <thead className="bg-slate-50 text-sm uppercase tracking-wide text-muted">
                <tr>
                  {g.roles.head.map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.roles.rows.map(([role, path, does]) => (
                  <tr key={role} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-semibold">{role}</td>
                    <td className="px-4 py-3 font-mono text-sm">{path}</td>
                    <td className="px-4 py-3">{does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ---------------- faq ---------------- */}
        <Section id="faq" title={g.faq.title}>
          <div className="flex flex-col gap-2">
            {g.faq.items.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-lg font-semibold">
                  <span aria-hidden className="mr-2 inline-block transition group-open:rotate-90">
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5 text-base text-slate-700">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {demo && (
          <section className="flex flex-col items-center gap-4 rounded-3xl bg-slate-100 p-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sample/box-open.webp" alt="" className="h-32 w-32 object-contain" />
            <p className="text-2xl font-bold">{g.packing.cta}</p>
            <Link href="/play" className="btn-primary">
              {g.tryIt} →
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
