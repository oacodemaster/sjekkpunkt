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
| M8 Hardening | Done 2026-11-07 (see M8 notes below) |
| M9 Stage readiness | Done 2026-11-07 (see M9 notes below); the prop test in `docs/test-plan.md` is still to be run with real props |
| D1 Design system | Done 2026-11-08, live (see D1 notes below) |
| P1 Guide, practice demo, languages | Built 2026-11-08, not yet deployed (see P1 notes below); no login needed for `/`, `/play`, `/guide`, `/demo` |
| Q Quality, security, demo | Planned 2026-11-08, run by Autopilot (steps Q0–Q9 and status in `docs/polish.md`); Q0 in progress, P1 live |
| L1 Landing page | Checkpoint 1 approved 2026-11-12 (copy, outline, visual direction in `docs/landing-copy.md`; em dash cleanup and guard done). Next: checkpoint 2, the page itself (brief: `docs/landing-page-brief.md`) |
| S1 | Not started |

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

**M8 notes.** Built: rate limits per user and device on `/api/vision`, `/api/voice/token`, `/api/translate` and `/api/tts/summary`, counted in Postgres (`api_gate`), 429 with `Retry-After`; daily spend caps from settings (`record_spend`, `spend_daily` without person columns, a `SPEND_CAP_REACHED` audit row), with the tap-only switch: a banner on every handheld, `spend_cap` answers, barcode or lead fallback, voice off, and a cost card in admin. CSP with a per-request nonce in `proxy.ts`, security headers on every path, self-hosted voice worklets, zod jitless in the browser. Lint bans raw HTML sinks and eval. CI (`.github/workflows/ci.yml`): typecheck, lint, unit tests, build, client-bundle and git-history secret scans (`scripts/scan-secrets.ts`), gitleaks, dependency audit. ElevenLabs agents: no audio recording, 7-day transcripts, sentiment analysis and topic discovery off, 500 sessions a day. Tests: `tests/e2e/security.spec.ts` (every API route without a session and with the wrong role, CSP and headers with no violations, a 429 burst, the spend-cap switch), `tests/db/hardening.test.ts`, `lib/security/csp.test.ts`, `lib/voice/agent-config.test.ts`, a CSP check in the live packing voice test. Docs for the jury: `docs/threat-model.md`, `docs/privacy.md`, `docs/architecture.md`. Left for later on purpose: Gemini paid tier or Vertex AI in the EU and ElevenLabs EU residency with zero retention (production plan in `docs/privacy.md`), label redaction before upload, the moderate dev-only minimatch advisory (upstream), native review of the pl/uk/ro/lt strings.

### M9 Stage readiness
- Director bar polish, earcons and pre-generated voice lines (`scripts/generate-audio.mjs`), demo reset, full Playwright scripted run green, manual prop test plan in `docs/test-plan.md`.

**M9 notes.** Built: pre-generated demo audio (`pnpm audio:generate`, `scripts/generate-audio.mjs`): five earcons with Sound Effects v3 (chime, alert, shutter, done, and a quiet tool tick) and twelve agent and team-lead lines with Text to Speech (`eleven_v4`, River for the coach, Daniel for the lead), in `public/audio` with a manifest and a unit test that fails when the script and the files drift; shelf codes are spoken as words (`spoken`). A browser player that preloads every file, plays a line after its earcon, stops a line when the operator moves on, and ignores missing files. Earcons at the live stations (chime on a passed pack check, alert on a wrong item or a new red flag, done on a confirmed return) and a tick on every voice tool call. The demo stage on a phone (the handheld or Holio full screen, a bottom bar with ← and →, automatic flip to Holio on RET-10, RET-11 and LOOP-01) and a fuller director bar (progress, scene, line played or caption only, next line with speaker and language; 1, 2, 3 jump to a scene). Demo reset: `POST /api/admin/demo-reset` (admin, `DEMO_ENABLED=true`, `guard()`) runs the generated seed through `admin_demo_reset` with a `DEMO_RESET` audit row, deletes the stored photos and spoken summaries, and re-syncs the grading guide if the reset changed it; the button sits on `/admin`. The seed is now the SQL function `app.reset_to_seed()` inside the generated `seed.sql`. `tests/e2e/stage.spec.ts` (reset, live return 1043, reset again, the full scripted run on the projector and on a phone, audio served same-origin) and `tests/db/demo-reset.test.ts`. The manual prop test plan is `docs/test-plan.md`, results empty. After review the same day: a reset keeps the catalogue (product edits, added products and shelves, reference photos; `pnpm db:seed:full` wipes it), the coaches read numbers with ElevenLabs' normalisation and get shelf codes with spaces, and the demo lines stay as generated with `eleven_v4` in each line's language (no separate native review, the owner's call). In live mode the coach now answers a check the worker made by tapping (before, only its greeting and the seal or confirm got a spoken answer). Left open: the prop test itself.

### D1 Design system
- The Sjekkpunkt design system (artifact https://claude.ai/artifact/Lpy68JFc9X9VfvtGVM92ga) on every screen, visual layer only.

**D1 notes.** Built: `design/tokens.json` (a copy of the design system's tokens) and `pnpm design:tokens`, which writes `app/tokens.css` for Tailwind 4 (a unit test fails when they drift and checks the contrast of every colour pair the app uses); the design system's status colours replace the brief's. Golos Text and JetBrains Mono through `next/font` (latin, latin-ext, cyrillic, cyrillic-ext), self-hosted, so the CSP did not change. `app/ui.css`: the design system's `bundle.css` verbatim, then the app's additions (segmented choices, checkboxes, desk tables, stats, the sticky thumb zone, the front page), then the `.holio` scope, which uses no Sjekkpunkt token. The components in `components/ui/`, the logos in `public/brand/` and the icons copied by blob id. Every screen restyled: the front page (Forside) with the loop and «Se demoen», the signed-out pages, both stations (verdict first, photo on stage, the main action and the voice dock in a thumb zone that stays mounted while the camera is open), the lead console, insights, admin, the Holio mock and the demo stage (dark frame, lime on the active scene). No data-testid, role or accessible name changed. Choices in `docs/decisions.md` («The Sjekkpunkt design system in the app»). Left open on purpose, because they need strings in six languages or data the app lacks: grade words and caption speaker labels at the station, «Bilde» in the step count, the shelf-plate note, the «Motorens forslag» label, order-line thumbnails, and a tappable language chip in the header (no in-shift language picker yet).

### P1 Guide, practice demo and language switching (owner request, 2026-11-08)

**P1 notes.** Built: a language switcher on every worker and public page (cookie + `preferred_lang`, enabled languages only, stations follow without a reload, the voice dock offers only enabled languages); `/guide`, a public guide in Norwegian and English; 20 sample images from Media Master in `public/sample/` (`docs/generated-images.md`); `/play`, a public practice demo where anyone packs five sample parcels on screen with the real engine, a practice camera that sees colours but not garment sizes, a session mix-up loop that raises packing alerts, earcons, and the real packing coach to talk to (`/api/play/voice/token`). Built on top of D1: every new screen uses the design system (the switcher is the language chip made tappable; `/play` and `/guide` use `sp-` components; their classes are in part 2 of `app/ui.css`). The front page keeps the D1 layout in the visitor's language (English underneath), leads with «Prøv selv» when the demo is on, and shows the five sample parcels as photos that open `/play?parcel=<id>` without a login. Tests: `lib/play/play.test.ts`, `lib/i18n/lang.test.ts`, `tests/e2e/play.spec.ts`, `tests/e2e/voice-live-play.spec.ts` (opt-in), the security spec knows the public route. Choices in `docs/decisions.md` (2026-11-08). Left open: native review of the new pl/uk/ro/lt strings; the lead and admin screens stay Norwegian.

### S1 Stretch
- R18 customer photo / transit damage, Shopify dev store import, more languages.

## Known conflicts resolved (brief vs addendum)

| Topic | Brief | Addendum (wins) |
|---|---|---|
| Framework | Vite SPA | Next.js App Router |
| Default mode | Demo | Live; demo behind a flag |
| After MAX_RETAKES at packing | P3: allow manual confirm | P8: manual confirm with a reason, lead notified if SKU has an active alert |
| Who computes decisions | Client engine | Server reruns engine on confirm (R16) |
