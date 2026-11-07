# Sjekkpunkt

Warehouse handheld app: camera + voice check at packing and at the returns bench.
Specs: `docs/sjekkpunkt-demo-brief V1.md` (product, rules, demo script) and `docs/sjekkpunkt-mvp-addendum.md`
(MVP scope; wins on conflicts). Build plan and milestone status: `docs/plan.md`. Every non-obvious
choice goes in `docs/decisions.md`.

@AGENTS.md

## Commands

- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint`
- `pnpm test` engine unit tests (offline) · `pnpm test:db` RLS/security tests against the hosted dev DB
- `npx playwright test` e2e (local prod server on :3100; `E2E_BASE_URL=https://…` for a deployment)
- `pnpm db:push` apply migrations · `pnpm db:seed` reset data to seed · `pnpm db:users` (re)create role test users
- `pnpm voice:setup` create/update both ElevenLabs agents (returns, packing) from `lib/voice/agent-config.ts` (never edit them in the dashboard)
- `E2E_VOICE=1 npx playwright test tests/e2e/voice-live.spec.ts tests/e2e/voice-live-pack.spec.ts` live voice tests (real WebRTC, uses credits)
- `PACK_SHOTS=<dir>` / `DEMO_SHOTS=<dir>` save screenshots from the pack / demo e2e specs

## Rules that must not erode

- `lib/engine` is pure TS: no React, Next or Supabase imports. The server reruns it on every commit (R16);
  never trust decision fields from the client.
- Workers write only through API routes (service client after `authorize()`); RLS gives them read-only access.
- `audit_events` is append-only. Insights read only `insights_*` views, which must never contain user or device columns.
- Seed data lives in `lib/demo/seed.ts`; `supabase/seed.sql` is generated from it. Don't hand-edit the SQL.
- Demo mode (`/demo`) must keep working at every milestone.
- Voice is optional: every step keeps its button. Agent tool results never contain customer note text.

## Environment

Supabase project `sjekkpunkt` (ref `grhbliltfyopdovpsfqj`, eu-north-1, org Playground). No Docker on the build Mac,
so there is no local Supabase stack. `.env.local` holds keys, DB URL and test-user passwords (never commit it).
