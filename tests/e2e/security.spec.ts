import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Lang } from '../../lib/engine/types';
import { t } from '../../lib/i18n/strings';
import { login, sql } from './helpers';

// M8 hardening: CSP and security headers, every API route behind a session and its roles,
// rate limits and the spend-cap tap-only switch.

const WH = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------- route inventory

type Route = { path: string; methods: string[] };
function apiRoutes(dir = 'app/api'): Route[] {
  const out: Route[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...apiRoutes(p));
    else if (name === 'route.ts') {
      const src = readFileSync(p, 'utf8');
      const methods = [...src.matchAll(/export (?:async )?function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
      const path = '/' + dir.replace(/^app\//, '').replace(/\[[^\]]+\]/g, () => crypto.randomUUID());
      out.push({ path, methods });
    }
  }
  return out;
}
const PUBLIC_ROUTES = [/^\/api\/health$/, /^\/api\/cron\//];

/** Who may call each group of routes (addendum section 6). Unlisted routes are checked in their own specs. */
const ALLOWED: [RegExp, string[]][] = [
  [/^\/api\/admin\//, ['admin']],
  [/^\/api\/lead\//, ['lead', 'admin']],
  [/^\/api\/insights$/, ['lead', 'admin']],
  [/^\/api\/tts\//, ['lead', 'admin']],
  [/^\/api\/pack\//, ['packer', 'lead', 'admin']],
  [/^\/api\/returns\//, ['returns', 'lead', 'admin']],
];

async function pickDevice(page: Page, label: string) {
  await page.goto('/device');
  await page.getByRole('button', { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/device'));
}
async function langOf(role: string): Promise<Lang> {
  const [r] = await sql<{ preferred_lang: Lang }>(
    `select p.preferred_lang from profiles p join auth.users u on u.id = p.user_id where u.email = $1`,
    [`${role}@sjekkpunkt.test`],
  );
  return r.preferred_lang;
}

async function call(page: Page, method: string, path: string, data: unknown = {}) {
  return page.request.fetch(path, { method, data: method === 'GET' ? undefined : data, maxRedirects: 0 });
}

test('every API route refuses a visitor without a session', async ({ page }) => {
  const routes = apiRoutes();
  expect(routes.length).toBeGreaterThan(25);
  for (const r of routes) {
    for (const m of r.methods) {
      const res = await call(page, m, r.path);
      if (PUBLIC_ROUTES.some((re) => re.test(r.path))) {
        if (r.path.startsWith('/api/cron/')) expect(res.status(), `${m} ${r.path}`).toBe(401); // needs CRON_SECRET
        continue;
      }
      expect(res.status(), `${m} ${r.path}`).toBe(401);
    }
  }
});

test('every role-gated API route refuses the other roles', async ({ browser }) => {
  const routes = apiRoutes();
  for (const role of ['packer', 'returns', 'lead']) {
    const p = await browser.newPage();
    await login(p, role);
    for (const r of routes) {
      const allowed = ALLOWED.find(([re]) => re.test(r.path))?.[1];
      if (!allowed || allowed.includes(role)) continue;
      for (const m of r.methods) expect((await call(p, m, r.path)).status(), `${role} ${m} ${r.path}`).toBe(403);
    }
    await p.close();
  }
});

// ---------------------------------------------------------------- CSP and headers

async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  // The browser's own violation event, plus its console wording as a second net.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on('console', (msg) => {
    if (/CSP violation|Content Security Policy|Refused to (load|execute|connect|apply|evaluate)/i.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

test('pages carry a nonce CSP and the security headers, and render with no CSP violations', async ({ page, browser }) => {
  const violations = await watchCsp(page);
  const res = await page.goto('/login');
  const h = res!.headers();
  const csp = h['content-security-policy'];
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'(;|$)/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['permissions-policy']).toContain('camera=(self)');
  expect(h['x-powered-by']).toBeUndefined();

  // Next.js put the nonce on its inline scripts.
  const nonce = csp.match(/'nonce-([^']+)'/)![1];
  const inline = await page.locator('script:not([src])').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(inline.length).toBeGreaterThan(0);
  for (const n of inline) expect(n).toBe(nonce);
  // A fresh nonce on the next request.
  const again = (await page.request.get('/login')).headers()['content-security-policy'];
  expect(again).not.toBe(csp);

  // The demo runs scripted (images, audio, director bar) under the same policy.
  await page.goto('/demo');
  await expect(page.getByTestId('station-pack')).toBeVisible();
  await page.waitForLoadState('networkidle');

  for (const [role, path] of [
    ['packer', '/pack'],
    ['lead', '/lead'],
    ['admin', '/admin'],
  ] as const) {
    const p = await browser.newPage();
    const v = await watchCsp(p);
    await login(p, role);
    if (role === 'packer') await pickDevice(p, 'device-07');
    await p.goto(path);
    await expect(p).toHaveURL(new RegExp(`${path}$`));
    await p.waitForLoadState('networkidle');
    expect(v, `${role} ${path}`).toEqual([]);
    await p.close();
  }
  expect(violations).toEqual([]);
});

// ---------------------------------------------------------------- rate limits

test('a burst over the per-minute limit gets 429 with Retry-After', async ({ page }) => {
  await login(page, 'admin');
  // Fixed one-minute windows: start early in a minute so the burst lands in one window.
  const s = new Date().getSeconds();
  if (s > 40) await page.waitForTimeout((62 - s) * 1000);
  const results = await Promise.all(
    // from = to: counted by the limiter, answered without calling the model (safe against production).
    Array.from({ length: 70 }, (_, i) => page.request.post('/api/translate', { data: { text: `line ${i}`, from: 'en', to: 'en' } })),
  );
  const limited = results.filter((r) => r.status() === 429);
  expect(results.filter((r) => r.status() === 200).length).toBeLessThanOrEqual(60);
  expect(limited.length).toBeGreaterThanOrEqual(10);
  const retry = Number(limited[0].headers()['retry-after']);
  expect(retry).toBeGreaterThan(0);
  expect(retry).toBeLessThanOrEqual(60);
  expect(await limited[0].json()).toMatchObject({ error: 'rate_limited' });
});

// ---------------------------------------------------------------- spend caps

test('over the daily spend cap the stations go tap-only and say so', async ({ page, browser }) => {
  const [before] = await sql<{ value: unknown }>(`select value from settings where warehouse_id = $1 and key = 'daily_spend_cap_nok'`, [WH]);
  const setCaps = (v: unknown) =>
    sql(
      `insert into settings (warehouse_id, key, value) values ($1, 'daily_spend_cap_nok', $2::jsonb)
       on conflict (warehouse_id, key) do update set value = excluded.value`,
      [WH, JSON.stringify(v)],
    );
  await setCaps({ vision: 0, elevenlabs: 0 });
  try {
    const pl = await langOf('packer');
    await login(page, 'packer');
    await pickDevice(page, 'device-07');
    await page.goto('/pack');
    await expect(page.getByTestId('limit-banner')).toContainText(t('visionCappedPack', pl));
    await expect(page.getByTestId('limit-banner')).toContainText(t('voiceCapped', pl));

    // Vision answers spend_cap before touching the photo or the model.
    const v = await page.request.post('/api/vision', { data: { photoId: crypto.randomUUID(), purpose: 'pack_check' } });
    expect(v.status()).toBe(200);
    expect(await v.json()).toEqual({ ok: false, reason: 'spend_cap' });
    // Voice: no token, a clear reason.
    const tok = await page.request.post('/api/voice/token', { data: { station: 'pack' } });
    expect(tok.status()).toBe(503);
    expect(await tok.json()).toEqual({ error: 'spend_cap' });

    // The returns station gets the returns wording.
    const r = await browser.newPage();
    await login(r, 'returns');
    await pickDevice(r, 'device-03');
    await r.goto('/return');
    await expect(r.getByTestId('limit-banner')).toContainText(t('visionCappedReturn', await langOf('returns')));
    await r.close();

    // The admin sees why.
    const a = await browser.newPage();
    await login(a, 'admin');
    await a.goto('/admin');
    await expect(a.locator('[data-provider="vision"]')).toHaveAttribute('data-capped', 'true');
    await a.close();
  } finally {
    if (before) await setCaps(before.value);
    else await sql(`delete from settings where warehouse_id = $1 and key = 'daily_spend_cap_nok'`, [WH]);
  }
  await page.goto('/pack');
  await expect(page.getByTestId('limit-banner')).toBeHidden();
});
