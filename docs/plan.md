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
| M4 Packing, live | Done 2026-11-07, live (see M4 notes below) |
| M5 Loop and lead console | Done 2026-11-07, live (see M5 notes below) |
| M6 Insights and integration events | Done 2026-11-07, live (see M6 notes below) |
| M7 Admin and privacy | Done 2026-11-07, live; the nightly cron needs `CRON_SECRET` in Vercel (see M7 notes below) |
| M8-M9, S1 | Not started |

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

**M4 notes.** Built: pack queue with order links and a number field, the packing station (`/pack/[ext]`) on a `PackPort` with live and demo adapters, camera check with the box overlay (green present, red wrong item, amber unsure), quantity badges per line, verdict banner, retake counter, label close-up per line, barcode fallback per line (BarcodeDetector + typed field), manual confirm with a reason after `MAX_RETAKES`, alert banner, evidence photo, seal. Pack vision (`pack_check`, `label_closeup`) on the same two-stage client, `/api/pack/:orderId/{check,barcode,manual,seal}`, `pack_scans`, and two SQL functions: `record_pack_mismatch` (one near-miss per order, each SKU pair once) and `commit_pack_check` (seal in one transaction: pack check, order `packed`, escalation, `pack.verified` / `pack.manual_confirm`, audit). The packing coach (`ELEVENLABS_AGENT_ID_PACK`, four client tools) shares a voice dock with the returns coach. Holio mock: orders card and order record with Pakkebevis. Demo scene 1 (PACK-01..PACK-07). Verified with a live WebRTC test (`tests/e2e/voice-live-pack.spec.ts`). Left for later on purpose: auto alerts from confusion events (M5; live alerts are already enforced at packing when they exist), rate limits (M8), earcons (M9), pack-2311 label illustration (M5 scene 3).

### M5 Loop and lead console
- Confusion events from both stations, auto alerts, alert enforcement at packing, escalation queue with override (reason required, refund capped), stock adjustment approvals, manual alerts, Norwegian TTS summaries cached in Storage, lead agent (explains, cannot resolve), Realtime live feed. Demo scene 3.

**M5 notes.** Built: auto pack alerts in the database (a trigger on `confusion_events` counts the pair inside the window from settings and opens one alert, same text as the engine's `recordConfusion`), so mix-ups from both stations close the loop in the same transaction. Lead console (`/lead`): escalation cards with photos, model and confidence, worker note in the original language and Norwegian, packing evidence, the engine's decision or proposal, a play button for the spoken summary, and approve / override (grade, shelf, refund with a reason, capped) / reject; stock correction approvals; pack alerts with origin and count, clear, and manual alerts for a SKU pair; a live feed over Supabase Realtime (private channel per warehouse, leads and admins only) that also refreshes the console. Routes: `GET /api/lead/escalations`, `POST /api/lead/escalations/:id/resolve`, `POST /api/lead/stock-adjustments/:id/decide`, `POST /api/lead/alerts`, `POST /api/lead/alerts/:id/clear`, `POST /api/tts/summary`, each backed by an atomic SQL function with an audit row. Norwegian spoken summaries (ElevenLabs `eleven_v4`, a different voice from the coaches) generated on first play and cached in Storage. Lead assistant (`ELEVENLABS_AGENT_ID_LEAD`, Norwegian, three read-only tools), verified with a live WebRTC test (`tests/e2e/voice-live-lead.spec.ts`). Demo scene 3 (LOOP-01..LOOP-04). Left for later on purpose: insights panels and the integration events list (M6), rate limits on the TTS route (M8), earcons and pre-generated demo audio (M9).

### M6 Insights and integration events
- Anonymous-view aggregates (7d/30d), value recovered, near-misses with configurable cost, "Ingen statistikk per ansatt" footer. `integration_events` with Holio payload names in the Holio mock.

**M6 notes.** Built: `lib/insights/compute.ts`, a pure aggregation over rows from the anonymous views (unit-tested on the seed), `loadInsights` reading only `insights_*` views, the catalogue and the `wrong_parcel_cost_nok` setting through the caller's RLS client, `GET /api/insights?range=7d|30d` (lead, admin; output parsed with zod), and the insights page (`/insights?range=`): headline tiles, SKU-pair mix-ups with 7- and 30-day counts, where they were found and alert status (active alerts sort first), grade distribution with value resold (A and B), repaired (C) and scrapped (D), likely causes, parcels stopped at packing with the estimated saving (caught × cost per wrong parcel, labelled as an estimate) and how sealed parcels were verified, return reasons per category and per SKU, and the "Ingen statistikk per ansatt" footer. New view `insights_alerts` (no `cleared_by`). Holio mock: `/holio/events` lists the newest 100 integration events with a type filter, a one-line summary, a link to the order or return record and the raw payload. Seed: four near-misses (MISMATCH pack checks, kept out of the demo's packing evidence) and 46 integration events for the seeded history in the live payload shapes. Left for later on purpose: editing `wrong_parcel_cost_nok` (M7 admin settings), an insights panel in demo mode beyond the brief's mix-up list (the demo keeps the brief's four panels).

### M7 Admin and privacy
- Settings, product editor with reference photos, CSV import, grading guide editor + agent KB sync, audit viewer, retention job (Vercel cron), `/privacy` in all enabled languages with "Jeg har lest dette".

**M7 notes.** Built: admin sections (`/admin`, `/admin/products`, `/admin/import`, `/admin/guide`, `/admin/audit`). Settings form for every threshold plus `return_window_days`, `photo_retention_days`, `wrong_parcel_cost_nok`, enabled languages and spend caps (`PATCH /api/admin/settings`, ranges in `lib/admin/schemas.ts`). Product editor: create and edit (the SKU is fixed once created), a new shelf code becomes a stock location, barcodes stay unique; reference photos (up to four, downscaled and EXIF-free in the browser, JPEG only on the server, never expire). CSV import of products (upsert by SKU), orders and returns (new only): comma or semicolon, a template per kind, a dry run that reports problems by line (file rules shared by browser and server, then database checks), then one all-or-nothing SQL transaction. Grading guide editor: stored as the `grading_guide` setting and pushed to the agents' ElevenLabs knowledge base in place; `pnpm voice:setup` now pushes the stored guide too. Audit viewer with station, type, reference and date filters, payloads and actors. Photo retention: `GET /api/cron/retention` daily from Vercel Cron (`CRON_SECRET`), "Slett utløpte bilder nå" in admin, a status card, a `RETENTION_RUN` audit row per run; a changed retention period moves the expiry of stored photos. Worker first launch: language picker (`/welcome`, enabled languages), then `/privacy` in the worker's language with "Jeg har lest dette" (stored as `privacy_info_read_at`); stations are closed until then. `/privacy` is public, in every enabled language, and linked from the handheld header. Every admin change is one SQL function with its audit row (`actor_user` = the admin), executable only by the service role (tested). Left for later on purpose: spend-cap enforcement and rate limits (M8), the enabled-languages list in the voice dock's language chip (it still offers all six), native review of the pl/uk/ro/lt privacy text.

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
