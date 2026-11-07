# Sjekkpunkt

Warehouse handheld app: camera + voice check at packing and at the returns bench.
Specs: `docs/sjekkpunkt-demo-brief V1.md` (product, rules, demo script) and `docs/sjekkpunkt-mvp-addendum.md`
(MVP scope; wins on conflicts). Build plan and milestone status: `docs/plan.md`. Every non-obvious
choice goes in `docs/decisions.md`.

@AGENTS.md

## Commands

- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint`
- `pnpm test` engine unit tests (offline) · `pnpm test:db` RLS/security tests against the hosted dev DB
- `pnpm scan:bundle` (after `pnpm build`) / `pnpm scan:repo` secret scans of the client bundle and the git history; CI runs both plus gitleaks and `pnpm audit`
- `npx playwright test` e2e (local prod server on :3100; `E2E_BASE_URL=https://…` for a deployment)
- `pnpm db:push` apply migrations · `pnpm db:seed` reset data to seed, keeping the catalogue (product edits, reference photos) · `pnpm db:seed:full` also put the catalogue back to seed · `pnpm db:users` (re)create role test users
- `pnpm voice:setup` create/update the ElevenLabs agents (returns, packing, lead) from `lib/voice/agent-config.ts` (never edit them in the dashboard)
- `pnpm audio:generate` make missing demo audio in `public/audio` (earcons and scripted lines, ElevenLabs, once per file; delete a file to remake it; `--check` lists missing and stale files)
- `E2E_VOICE=1 npx playwright test tests/e2e/voice-live*.spec.ts` live voice tests (real WebRTC, uses credits); fixtures from `pnpm tsx scripts/make-voice-fixture.ts [pack|lead]`
- `PACK_SHOTS=<dir>` / `DEMO_SHOTS=<dir>` / `LEAD_SHOTS=<dir>` / `INSIGHTS_SHOTS=<dir>` / `ADMIN_SHOTS=<dir>` save screenshots from the pack / demo / lead / insights / admin e2e specs
- `E2E_KB=1` lets the admin spec push the grading guide to the live ElevenLabs knowledge base when run against a deployment (it restores the text)

## Rules that must not erode

- `lib/engine` is pure TS: no React, Next or Supabase imports. The server reruns it on every commit (R16);
  never trust decision fields from the client.
- Workers and leads write only through API routes (service client after `authorize()`); RLS gives them read-only access.
- Pack alerts are opened by the `confusion_events` trigger (`app.check_pack_alert`); keep it in step with `lib/engine/loop.ts`.
- `audit_events` is append-only. Insights read only `insights_*` views, which must never contain user or device columns.
- Seed data lives in `lib/demo/seed.ts`; `supabase/seed.sql` is generated from it. Don't hand-edit the SQL.
- Demo mode (`/demo`) must keep working at every milestone.
- Voice is optional: every step keeps its button. Agent tool results never contain customer note text.
- The grading guide lives in settings (`grading_guide`); edit it in `/admin/guide`, which pushes it to the agents. `GRADING_GUIDE` in code is only the default.
- Admin writes go through one SQL function each (change + audit row), executable only by the service role.
- Every paid AI call goes through `limitCall` / `spendGate` (`lib/limits/server.ts`): rate limit, daily spend cap, `record` the estimated cost.
- CSP: scripts only from this origin plus the per-request nonce (`proxy.ts`, `lib/security/csp.ts`). A new external origin goes in `buildCsp` and its test.
- Voice worklets in `public/elevenlabs/` are copies from `@elevenlabs/client/worklets`; copy them again when the SDK is upgraded (a unit test fails until you do).

## Environment

Supabase project `sjekkpunkt` (ref `grhbliltfyopdovpsfqj`, eu-north-1, org Playground). No Docker on the build Mac,
so there is no local Supabase stack. `.env.local` holds keys, DB URL and test-user passwords (never commit it).
