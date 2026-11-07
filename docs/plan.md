# Sjekkpunkt MVP: build plan

Source documents: `docs/sjekkpunkt-demo-brief V1.md` (the brief) and `docs/sjekkpunkt-mvp-addendum.md` (the addendum).
The addendum wins on conflicts. Milestones follow addendum section 12. Choices are logged in `docs/decisions.md`.

Starting point (2026-11-07): empty folder, no Phase 1 code to keep.

## Status

| Milestone | State |
|---|---|
| M1 Foundation | Done 2026-11-07. Live at https://sjekkpunkt.vercel.app |
| M2 Returns, live | Done 2026-11-07 (see M2 notes below) |
| M3 Voice on returns | Done 2026-11-07, live (see M3 notes below) |
| M4-M9, S1 | Not started |

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, pnpm |
| Validation | zod 4 for every API input/output and every vision response |
| Data | Supabase, hosted project in an EU region (Postgres + RLS, Auth, Storage, Realtime). No Docker on this Mac, so no local stack: migrations live in `supabase/migrations` and are pushed with the CLI |
| Hosting | Vercel, functions pinned to an EU region next to the database |
| Voice | `@elevenlabs/react` (docs checked at M3, not before) |
| Vision | Fast model + strong fallback behind one `lib/vision/client.ts` interface (docs checked at M2) |
| Tests | Vitest (engine, contracts, RLS/security against the dev project), Playwright (e2e) |

## Architecture choices that shape every milestone

1. **One engine, two callers.** `lib/engine` is pure TS with no imports from React, Next or Supabase. The client uses it for instant previews. The server reruns it from stored rows on every commit (R16) and ignores any decision fields the client sends.
2. **Stations talk to a port, not to fetch.** Each station UI calls a `StationPort` interface (`getOrder`, `capturePhoto`, `evaluate`, `confirm`, ...). Two adapters: `demoPort` (in-memory store + vision fixtures + the same engine) and `livePort` (API routes). This is how demo mode keeps working at every milestone without a second UI.
3. **Workers read via RLS, write via API routes.** Packer/returns roles get `select` only on what their station needs. All writes go through route handlers that check the session role, validate with zod, then write with a server-only service client. Leads read everything except raw audit payloads; admins everything. `audit_events` has no update/delete grant for anyone.
4. **Anonymous insights.** Insights read only from views with no `actor_user`, `decided_by`, `device_id` or `actor_device` columns. A test fails if one appears.
5. **Time-relative seed.** Seed timestamps are relative to `now()` so the "third mix-up in 7 days" loop works on whatever day the demo runs. Demo mode uses a fixed demo clock.
6. **Single warehouse.** Every table has `warehouse_id`. RLS also checks it against the user's profile, so multi-tenant is a data change later, not a rewrite.

## Milestones

### M1 Foundation
- Next.js app scaffold, Tailwind, i18n string table (nb, en, pl, uk, ro, lt keys; pl/uk/ro/lt flagged for native review).
- `lib/engine`: types, constants, `evaluatePack` (P1-P9), `evaluateReturn` (R1-R17 minus R18), `computeGrade`, `detectInstructions`, `recordConfusion`, escalation reasons, `ENGINE_VERSION`.
- Vitest: the nine brief tests + tests for P6-P9, R12-R17.
- Supabase: schema migration (all addendum section 4 tables), RLS policies, append-only audit, anonymous insights views, private `photos` bucket, `seed.sql` (brief seed + 30 extra products, 40 orders, 15 returns across all grades/causes), test users per role.
- Auth: email/password login, role from `profiles`, device label picker remembered on device, role-gated route groups (`(handheld)`, `(lead)`, `(admin)`), placeholder pages per role.
- Deploy: GitHub repo, Vercel project in EU, env vars, HTTPS.
- **Done when:** deployed on HTTPS, schema + RLS + seed live, each role logs in and lands on its own area, engine tests green, RLS tests green.

### M2 Returns, live (+ demo returns flow)
- Returns UI: scan/queue, overview with packing evidence, photo stepper, findings, decision, item switcher, "Send til teamleder".
- Camera (`getUserMedia`, rear), downscale ~1024 px, EXIF strip via canvas re-encode, JPEG 0.8, signed upload URL.
- `/api/vision` with closed-set SKUs + reference photos, two-stage model, zod-validate, one retry, face discard, 8 s timeout.
- `/api/returns/scan`, `/evaluate`, `/confirm` (server rerun), unknown-return and late-return escalations.
- Holio mock: return record view.
- Demo adapter + director bar for scene 2 (RET-01..RET-11) with SVG illustrations.

**M2 notes.** Built: return queue with QR (BarcodeDetector) and number scan, overview with packing evidence, guided photo stepper with retake counter, findings with the tap checklist, decision preview, item switcher, "Send til teamleder", camera pipeline (rear camera, ~1024 px, EXIF dropped, JPEG 0.8, file fallback, wake lock), `/api/photos/upload-url`, `/api/vision` (closed set, two-stage Gemini, zod, face discard, 8 s), `/api/returns/scan`, `/evaluate`, `/confirm` (atomic SQL commit), `/escalate`, the Holio mock return record, and demo scene 2 (RET-01..RET-11). Left for later milestones on purpose: note translation (M3), live pack alerts from confusion events (M5), rate limits and spend caps (M8), reference photo upload (M7; the vision route already sends them when products have them).

### M3 Voice on returns
- Check current ElevenLabs docs. Returns agent, client tools calling API routes, token route, language from `preferred_lang` + detection, push-to-talk, captions, `/api/translate`, tap-only fallback when mic denied.

**M3 notes.** Built: the returns agent from code (`lib/voice/agent-config.ts`, `pnpm voice:setup`), six client tools bound to the station (`get_return`, `show_step`, `capture_photo`, `evaluate_return`, `select_item`, `escalate_to_lead`), `POST /api/voice/token` with database keyterms, push-to-talk with a hands-free toggle, language switching (detection flips the screen; the chip restarts the session), captions with a NB/EN line from `POST /api/translate`, worker and escalation notes translated to Norwegian on the server, tap-only fallback for mic denied or voice unavailable, and `[screen]` updates for taps. Verified with a live WebRTC test (fake mic and camera). Left for later on purpose: rate limits and spend caps (M8), earcons and the tool-call sound (M9), voice in demo mode stays scripted audio (M9).

### M4 Packing, live (+ demo packing flow)
- Queue, camera check with box overlay, quantity badges, retake counter, barcode fallback (`BarcodeDetector` + manual field), manual confirm with reason, evidence photo, seal. Packing agent. Demo scene 1.

### M5 Loop and lead console
- Confusion events from both stations, auto alerts, alert enforcement at packing, escalation queue with override (reason required, refund capped), stock adjustment approvals, manual alerts, Norwegian TTS summaries cached in Storage, lead agent (explains, cannot resolve), Realtime live feed. Demo scene 3.

### M6 Insights and integration events
- Anonymous-view aggregates (7d/30d), value recovered, near-misses with configurable cost, "Ingen statistikk per ansatt" footer. `integration_events` with Holio payload names in the Holio mock.

### M7 Admin and privacy
- Settings, product editor with reference photos, CSV import, grading guide editor + agent KB sync, audit viewer, retention job (Vercel cron), `/privacy` in all enabled languages with "Jeg har lest dette".

### M8 Hardening
- Rate limits, daily spend caps with tap-only switch, CSP, secret scan in CI, dependency audit, security tests, `docs/threat-model.md`, `docs/privacy.md`, `docs/architecture.md`.

### M9 Stage readiness
- Director bar polish, earcons and pre-generated voice lines (`scripts/generate-audio.mjs`), demo reset, full Playwright scripted run green, manual prop test plan in `docs/test-plan.md`.

### S1 Stretch
- R18 customer photo / transit damage, Shopify dev store import, more languages.

## Known conflicts resolved (brief vs addendum)

| Topic | Brief | Addendum (wins) |
|---|---|---|
| Framework | Vite SPA | Next.js App Router |
| Default mode | Demo | Live; demo behind a flag |
| After MAX_RETAKES at packing | P3: allow manual confirm | P8: manual confirm with a reason, lead notified if SKU has an active alert |
| Who computes decisions | Client engine | Server reruns engine on confirm (R16) |
