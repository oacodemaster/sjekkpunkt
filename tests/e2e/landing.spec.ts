import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type Request } from '@playwright/test';

// The landing page (docs/landing-page-brief.md): both languages, the language routing, SEO, the
// interactive packing check without a single paid call, and the lead form. Nothing here resets the
// database; leads made by the tests use @example.com addresses (stored, never emailed) and are
// deleted at the end.

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const RUN = `${Date.now().toString(36)}`;
const email = (k: string) => `e2e-${RUN}-${k}@example.com`;
/** A visitor address of its own per test, so the per-visitor limit of one test never hits another. */
const visitor = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}, 10.0.0.1`;

test.afterAll(async () => {
  await service().from('leads').delete().like('email', `e2e-${RUN}-%`);
});

/** Anything that could cost money: our paid routes, ElevenLabs, Google's AI hosts. */
const PAID = [/\/api\/(vision|voice|tts|translate|play)\b/, /elevenlabs\.io/, /googleapis\.com/, /generativelanguage/, /aiplatform/, /gemini/];

test.describe('the page', () => {
  test('Norwegian at /, English at /en, each with its own title, canonical, hreflang and JSON-LD', async ({ page }) => {
    for (const [path, lang, h1, title] of [
      ['/?lang=nb', 'nb', 'Feil vare stoppes før esken tapes igjen.', 'Sjekkpunkt: stopp feil vare før esken tapes igjen'],
      ['/en', 'en', 'Catch the wrong item before the tape goes on.', 'Sjekkpunkt: catch the wrong item before the box is sealed'],
    ] as const) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('.lp')).toHaveAttribute('lang', lang);
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', lang === 'en' ? /^https?:\/\/[^/]+\/en$/ : /^https?:\/\/[^/]+\/?$/);
      await expect(page.locator('link[rel=alternate][hreflang=nb]')).toHaveCount(1);
      await expect(page.locator('link[rel=alternate][hreflang=en]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`/og/sjekkpunkt-${lang}\\.png$`));
      const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
      expect(ld.map((x: { '@type': string }) => x['@type'])).toEqual(['SoftwareApplication', 'Organization']);
      await expect(page.getByTestId('forsterk-credit')).toHaveAttribute('href', 'https://forsterk.no');
      // One h1 on the page, also once the packing check has loaded its station.
      await page.locator(`#${lang === 'nb' ? 'prov' : 'try-it'}`).scrollIntoViewIfNeeded();
      await expect(page.getByTestId('demo-station')).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.locator('body').innerText()).not.toContain(String.fromCharCode(0x2014)) // no em dash in the copy;
    }
    for (const src of ['/landing/nb/hero.webp', '/landing/en/hero.webp', '/og/sjekkpunkt-nb.png', '/video/sjekkpunkt.mp4']) {
      const r = await page.request.get(src, { maxRedirects: 0 });
      expect(r.status(), src).toBe(200);
    }
  });

  test('other languages fall back to English; ?lang=nb and a Norwegian browser stay on /', async ({ browser }) => {
    for (const [locale, cookie, url] of [
      ['en-US', null, '/en'],
      ['pl-PL', null, '/en'],
      ['nb-NO', null, '/'],
      ['en-US', 'nb', '/'],
      ['nb-NO', 'uk', '/en'],
    ] as const) {
      const ctx = await browser.newContext({ locale });
      if (cookie) await ctx.addCookies([{ name: 'sp_lang', value: cookie, url: test.info().project.use.baseURL! }]);
      const page = await ctx.newPage();
      await page.goto('/');
      await expect(page, `${locale} ${cookie}`).toHaveURL((u) => u.pathname === url);
      await ctx.close();
    }
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/en');
    await page.getByTestId('lang-nb').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Feil vare stoppes før esken tapes igjen.');
    await ctx.close();
  });

  test('robots keeps the app out and the sitemap lists both languages', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Allow: /en');
    for (const p of ['/api/', '/pack', '/lead', '/admin', '/login']) expect(robots).toContain(`Disallow: ${p}`);
    const map = await (await request.get('/sitemap.xml')).text();
    expect(map).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
    expect(map).toMatch(/<loc>https?:\/\/[^<]+\/en<\/loc>/);
  });

  test('the free demos are on whatever DEMO_ENABLED says', async ({ request }) => {
    expect((await request.get('/demo')).status()).toBe(200);
    expect((await request.get('/play')).status()).toBe(200);
  });

  test('the privacy page explains the form in Norwegian and in English', async ({ page }) => {
    await page.goto('/privacy?lang=nb');
    await expect(page.locator('#henvendelser')).toContainText('slettes automatisk 12 måneder');
    await page.goto('/privacy?lang=en');
    await expect(page.locator('#contact-form')).toContainText('deleted automatically 12 months');
  });
});

test.describe('the packing check', () => {
  async function demo(page: Page, path: string) {
    await page.goto(path);
    await page.locator('[data-testid=landing-demo], .lp-demo').first().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('demo-station')).toBeVisible();
  }
  const step = (page: Page) => page.getByTestId('landing-demo');

  test('plays the whole check, sound on, without a single paid call', async ({ page }) => {
    const requests: Request[] = [];
    page.on('request', (r) => requests.push(r));
    await demo(page, '/?lang=nb');
    await expect(page.getByTestId('demo-progress')).toHaveText('Steg 1 av 6');
    await expect(page.getByTestId('demo-caption')).toContainText('Ordre 2207 er klar til pakking');

    // Sound only after the visitor asks: no audio file before the click.
    expect(requests.filter((r) => r.url().includes('/audio/'))).toEqual([]);
    await page.getByTestId('demo-sound').click();
    await expect(page.getByTestId('demo-sound')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('demo-next').click();
    await expect(step(page)).toHaveAttribute('data-step', '1');
    await expect(page.getByTestId('demo-caption')).toContainText('mówię po polsku');
    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('demo-caption')).toContainText('Legg alt i esken');
    await page.getByTestId('demo-next').click();
    await expect(step(page)).toHaveAttribute('data-step', '3');
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');
    await expect(page.getByTestId('demo-caption')).toContainText('denne er sort');
    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('sealed')).toBeVisible();
    await expect(page.getByTestId('demo-end')).toHaveText('Pakken er riktig og forseglet. Bildet er lagret som pakkebevis.');
    await expect(page.getByTestId('demo-progress')).toHaveText('Steg 6 av 6');

    // Back replays from the start, Start again goes to step 1.
    await page.getByTestId('demo-back').click();
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
    await expect(page.getByTestId('sealed')).toHaveCount(0);
    await page.getByTestId('demo-next').click();
    await page.getByTestId('demo-restart').click();
    await expect(page.getByTestId('demo-progress')).toHaveText('Steg 1 av 6');

    const paid = requests.map((r) => r.url()).filter((u) => PAID.some((re) => re.test(u)));
    expect(paid, 'paid requests').toEqual([]);
    const origin = new URL(page.url()).origin;
    const foreign = requests.map((r) => r.url()).filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(foreign, 'requests to other origins').toEqual([]);
    expect(requests.some((r) => r.url().endsWith('/audio/PACK-05.mp3')), 'the coach line played from the static file').toBe(true);
  });

  test('the station takes taps too, in English, and is keyboard operable', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await demo(page, '/en');
    await expect(page.getByTestId('demo-progress')).toHaveText('Step 1 of 6');
    // Keyboard: Next is a real button.
    await page.getByTestId('demo-next').focus();
    await page.keyboard.press('Enter');
    await expect(step(page)).toHaveAttribute('data-step', '1');
    await expect(page.getByTestId('demo-caption')).toContainText('Hi, I speak Polish.');
    // The station's own button: Sprawdź (the packer's Polish screen) runs the check.
    await page.getByTestId('demo-station').getByRole('button', { name: 'Sprawdź', exact: true }).click();
    await expect(step(page)).toHaveAttribute('data-step', '3');
    await expect(page.getByTestId('demo-caption')).toContainText('this one is black');
    await page.getByTestId('demo-station').getByRole('button', { name: 'Sprawdź ponownie' }).click();
    await page.getByTestId('demo-station').getByTestId('seal').click();
    await expect(page.getByTestId('demo-end')).toContainText('The parcel is right and sealed.');
    expect(requests.filter((u) => PAID.some((re) => re.test(u)))).toEqual([]);
    expect(requests.filter((u) => u.includes('/audio/')), 'no sound without asking').toEqual([]);
  });

  test('works at 360 px without sideways scrolling', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await demo(page, '/?lang=nb');
    await page.getByTestId('demo-next').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await ctx.close();
  });
});

test.describe('the lead form', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': visitor() });
  });

  async function fill(page: Page, who: string) {
    const form = page.getByTestId('lead-form');
    await form.scrollIntoViewIfNeeded();
    await form.getByLabel('Navn').fill('Kari Nordmann');
    await form.getByLabel('Jobb-e-post').fill(email(who));
    await form.getByLabel('Firma').fill('Lager AS');
    await form.getByLabel(/Rolle/).selectOption('warehouse_manager');
    await form.getByLabel(/Ordrer per dag/).selectOption('200_500');
    await form.getByRole('radio', { name: 'Begge' }).check();
    await form.getByLabel(/Melding/).fill('Hettegensere i M og L blir forvekslet.');
  }
  const leads = async (who: string) => (await service().from('leads').select('*').eq('email', email(who))).data ?? [];

  test('the browser names every missing field before anything is sent', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && posts.push(r.url()));
    await page.goto('/?lang=nb');
    await page.getByTestId('lead-submit').click();
    await expect(page.getByTestId('lead-error')).toHaveText('Sjekk feltene som er merket.');
    await expect(page.locator('#lead-name-error')).toHaveText('Skriv navnet ditt.');
    await expect(page.locator('#lead-email-error')).toContainText('navn@firma.no');
    await expect(page.locator('#lead-company-error')).toHaveText('Skriv navnet på firmaet.');
    await expect(page.locator('#lead-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#lead-name')).toBeFocused();
    expect(posts).toEqual([]);
  });

  test('too quick is refused; after a moment the lead is stored and the visitor thanked', async ({ page }) => {
    await page.goto('/en');
    const form = page.getByTestId('lead-form');
    await form.scrollIntoViewIfNeeded();
    await form.getByLabel('Name').fill('Kari Nordmann');
    await form.getByLabel('Work email').fill(email('happy'));
    await form.getByLabel('Company').fill('Lager AS');
    await page.getByTestId('lead-submit').click();
    await expect(page.getByTestId('lead-error')).toHaveText('That was quick. Wait a few seconds and send it again.');
    expect(await leads('happy')).toEqual([]);
    // The values survive the refusal; a moment later the same form goes through.
    await expect(page.getByLabel('Name')).toHaveValue('Kari Nordmann');
    await page.waitForTimeout(3200);
    await page.getByTestId('lead-submit').click();
    await expect(page.getByTestId('lead-sent')).toContainText('Thanks, Kari.');
    await expect(page.getByTestId('lead-sent')).toBeFocused();
    const rows = await leads('happy');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Kari Nordmann', company: 'Lager AS', lang: 'en', notified_at: null });
  });

  test('every field is stored as chosen (Norwegian page)', async ({ page }) => {
    await page.goto('/?lang=nb');
    await fill(page, 'full');
    await page.waitForTimeout(3200);
    await page.getByTestId('lead-submit').click();
    await expect(page.getByTestId('lead-sent')).toContainText('Takk, Kari.');
    const [row] = await leads('full');
    expect(row).toMatchObject({ role: 'warehouse_manager', orders_per_day: '200_500', interest: 'both', message: 'Hettegensere i M og L blir forvekslet.', lang: 'nb' });
  });

  test('the honeypot gets a thank-you and stores nothing', async ({ page }) => {
    await page.goto('/?lang=nb');
    await fill(page, 'bot');
    await page.locator('#lead-website').fill('https://spam.example');
    await page.waitForTimeout(3200);
    await page.getByTestId('lead-submit').click();
    await expect(page.getByTestId('lead-sent')).toBeVisible();
    expect(await leads('bot')).toEqual([]);
  });

  test('a visitor who keeps posting is rate limited', async ({ page }) => {
    await page.goto('/?lang=nb');
    await fill(page, 'flood');
    // Six attempts in ten minutes per visitor; every attempt counts, also the refused ones. Locally
    // each test is its own visitor; on Vercel every test shares the runner's address, so the limit
    // can come sooner than the seventh post.
    const errors: string[] = [];
    for (let k = 0; k < 8 && !errors.includes('rate'); k++) {
      const posted = page.waitForResponse((r) => r.request().method() === 'POST');
      await page.getByTestId('lead-submit').click();
      await posted;
      const text = await page.getByTestId('lead-error').innerText();
      errors.push(text.includes('For mange forsøk') ? 'rate' : text.includes('for fort') ? 'fast' : text);
    }
    expect(errors.at(-1)).toBe('rate');
    expect(errors.length).toBeLessThanOrEqual(7);
    expect(errors.slice(0, -1).every((e) => e === 'fast')).toBe(true);
    expect(await leads('flood')).toEqual([]);
  });

});
