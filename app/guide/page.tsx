import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicHeader } from '@/components/public-header';
import { Banner, ButtonLink, Card, GradeBadge, Icon, StatusChip } from '@/components/ui';
import { GUIDE, type GuideStep } from '@/lib/guide/content';
import { requestLang } from '@/lib/i18n/server';
import { LANG_NAMES, LANGS } from '@/lib/i18n/strings';
import { imageOf } from '@/lib/play/catalog';
import { scriptedDemoOn } from '@/lib/demo/flags';

export const metadata: Metadata = {
  title: 'Slik virker det · Sjekkpunkt',
  description: 'Pakking, retur, løkka, stemmecoachen og teamlederen: slik virker Sjekkpunkt.',
};

function Pic({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // Static files from public/sample, already sized; a plain img keeps them same-origin (CSP).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="sp-mono grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[16px] font-bold text-surface">{i + 1}</span>
          <div>
            <h3 className="type-label m-0">{s.title}</h3>
            <p className="m-0 mt-1 text-[17px] leading-[25px] text-ink-2">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Section({ id, title, children, className = '' }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="m-0 mb-5 text-[30px] font-extrabold leading-[36px] tracking-[-0.02em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-[17px] leading-[25px]">
          <span aria-hidden className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-ink" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

/** How Sjekkpunkt works: public, Norwegian or English, with the generated sample photos. */
export default async function GuidePage({ searchParams }: PageProps<'/guide'>) {
  const lang = await requestLang(undefined, (await searchParams).lang);
  const g = GUIDE[lang === 'nb' ? 'nb' : 'en'];
  const demo = scriptedDemoOn();
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
    <div className="sp-light flex flex-1 flex-col bg-surface text-ink" lang={lang === 'nb' ? 'nb' : 'en'}>
      <PublicHeader lang={lang} current="guide" />

      {/* ---------------- hero (dark, so the lime button is at home) ---------------- */}
      <div className="sp-dark relative overflow-hidden">
        <Pic src="/sample/scenes/packing.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-16 sm:py-24">
          <h1 className="m-0 max-w-3xl text-[40px] font-extrabold leading-[44px] tracking-[-0.025em] sm:text-[60px] sm:leading-[64px]">{g.title}</h1>
          <p className="type-lead m-0 max-w-2xl text-ink-2-on-dark">{g.lead}</p>
          {demo && (
            <div className="lp-actions mt-2">
              <ButtonLink href="/play" variant="brand" iconAfter="arrow-right">
                {g.tryIt}
              </ButtonLink>
              <ButtonLink href="/demo" variant="on-dark">
                {g.scripted}
              </ButtonLink>
            </div>
          )}
          {lang !== 'nb' && lang !== 'en' && <p className="m-0 text-[16px] text-ink-2-on-dark">{g.onlyNbEn}</p>}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12">
        {/* ---------------- short answer + contents ---------------- */}
        <section aria-labelledby="short-title" className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div>
            <h2 id="short-title" className="m-0 mb-5 text-[30px] font-extrabold leading-[36px] tracking-[-0.02em]">
              {g.short.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {g.short.cards.map((c, i) => (
                <Card key={c.title} desk>
                  <Pic src={imageOf(['HD-NAVY-M', 'JK-SHELL-L', 'HD-BLACK-M'][i])} alt="" className="h-20 w-20 rounded-md bg-surface-2 object-contain p-1" />
                  <h3 className="sp-card__title">{c.title}</h3>
                  <p className="m-0 text-[17px] leading-[25px] text-ink-2">{c.text}</p>
                </Card>
              ))}
            </div>
          </div>
          <nav aria-label={g.toc}>
            <Card eyebrow={g.toc}>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {toc.map(([id, title]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="sp-link inline-flex min-h-10 items-center text-[17px]">
                      {title}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </nav>
        </section>

        {/* ---------------- packing ---------------- */}
        <Section id="packing" title={g.packing.title}>
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <p className="type-body m-0">{g.packing.intro}</p>
              <Steps steps={g.packing.steps} />
              <Banner>{g.packing.note}</Banner>
              {demo && (
                <ButtonLink href="/play" iconAfter="arrow-right" className="self-start">
                  {g.packing.cta}
                </ButtonLink>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Pic src="/sample/scenes/packing.webp" alt={g.packing.imageAlt} className="w-full rounded-lg object-cover" />
              <div className="grid grid-cols-2 gap-3">
                {(['HD-NAVY-M', 'HD-BLACK-M'] as const).map((sku, i) => (
                  <figure key={sku} className={`m-0 flex flex-col items-center gap-2 rounded-lg border-[3px] bg-surface p-3 ${i === 0 ? 'border-ok' : 'border-stop'}`}>
                    <Pic src={imageOf(sku)} alt="" className="h-28 w-28 object-contain" />
                    <figcaption>
                      <StatusChip tone={i === 0 ? 'ok' : 'stop'}>
                        {i === 0 ? (lang === 'nb' ? 'Marineblå, M' : 'Navy, M') : lang === 'nb' ? 'Sort, M: feil vare' : 'Black, M: wrong item'}
                      </StatusChip>
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
            <Pic src="/sample/scenes/returns.webp" alt={g.returns.imageAlt} className="w-full rounded-lg object-cover lg:order-2" />
            <div className="flex flex-col gap-5">
              <p className="type-body m-0">{g.returns.intro}</p>
              <Steps steps={g.returns.steps} />
            </div>
          </div>
          <h3 className="type-title m-0 mb-4 mt-10">{g.returns.gradesTitle}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {g.returns.grades.map((gr) => (
              <Card key={gr.grade} desk>
                <GradeBadge grade={gr.grade} kicker={<span className="sp-mono">{gr.shelf}</span>} desk />
                <p className="m-0 text-[16px] leading-[23px]">{gr.text}</p>
              </Card>
            ))}
          </div>
          <Banner className="mt-5">{g.returns.note}</Banner>
        </Section>

        {/* ---------------- loop (dark panel, lime on the step that closes it) ---------------- */}
        <Section id="loop" title={g.loop.title} className="sp-dark rounded-xl p-6 sm:p-10">
          <p className="type-body m-0 max-w-3xl text-ink-2-on-dark">{g.loop.text}</p>
          <ol className="m-0 mt-6 flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:items-center">
            {g.loop.chain.map((c, i) => (
              <li key={c} className="flex items-center gap-2">
                <span
                  className={`rounded-lg border-2 px-4 py-2 text-[17px] font-semibold ${i === g.loop.chain.length - 2 ? 'border-brand bg-brand-wash' : 'border-line-on-dark bg-frame-2'}`}
                >
                  {c}
                </span>
                {i < g.loop.chain.length - 1 && (
                  <span aria-hidden className="text-ink-2-on-dark sm:mx-1">
                    <Icon name="arrow-right" />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="m-0 mt-6 text-[17px] leading-[25px] text-ink-2-on-dark">{g.loop.after}</p>
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
              <Pic src={img} alt={s.imageAlt} className="mb-5 aspect-[3/2] w-full rounded-lg object-cover" />
              <Points items={s.points} />
            </Section>
          ))}
        </div>

        {/* ---------------- languages + privacy ---------------- */}
        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="languages" title={g.languages.title}>
            <p className="type-body m-0">{g.languages.text}</p>
            <p className="m-0 mt-4 flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <StatusChip key={l} lang={l}>
                  <span className="sp-mono">{l.toUpperCase()}</span> {LANG_NAMES[l]}
                </StatusChip>
              ))}
            </p>
          </Section>
          <Section id="privacy" title={g.privacy.title}>
            <Points items={g.privacy.points} />
            <Link href={`/privacy?lang=${lang}`} className="sp-link mt-4 inline-flex min-h-12 items-center text-[17px]">
              {g.privacy.more}
            </Link>
          </Section>
        </div>

        {/* ---------------- roles ---------------- */}
        <Section id="roles" title={g.roles.title}>
          <Card desk className="overflow-x-auto">
            <table className="sp-table min-w-[32rem] text-[16px]">
              <thead>
                <tr>
                  {g.roles.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.roles.rows.map(([role, path, does]) => (
                  <tr key={role}>
                    <td className="font-semibold">{role}</td>
                    <td className="sp-mono">{path}</td>
                    <td>{does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>

        {/* ---------------- faq ---------------- */}
        <Section id="faq" title={g.faq.title}>
          <div className="flex flex-col gap-2">
            {g.faq.items.map((f) => (
              <details key={f.q} className="group rounded-lg border-2 border-line bg-surface px-4">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 text-[18px] font-semibold">
                  <span aria-hidden className="inline-flex transition-transform duration-[var(--dur-fast)] group-open:rotate-90">
                    <Icon name="arrow-right" />
                  </span>
                  {f.q}
                </summary>
                <p className="m-0 pb-4 pl-9 text-[17px] leading-[25px] text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {demo && (
          <Card desk className="items-center p-8 text-center">
            <Pic src="/sample/box-open.webp" alt="" className="h-32 w-32 object-contain" />
            <p className="type-title m-0">{g.packing.cta}</p>
            <ButtonLink href="/play" iconAfter="arrow-right">
              {g.tryIt}
            </ButtonLink>
          </Card>
        )}
      </main>
    </div>
  );
}
