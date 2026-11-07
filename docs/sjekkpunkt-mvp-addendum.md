# Sjekkpunkt: MVP addendum

This document extends **sjekkpunkt-demo-brief.md**. Read that file first. It still defines the product, the rule engine (section 6), the vision contract (section 7), the voice agent (section 8), the UI (section 9) and the scripted demo (section 10).

**Where the two files conflict, this one wins.**

The demo brief builds a scripted demo. This addendum turns it into a comprehensive MVP: real devices, real camera, real voice, a real database, logins, team lead tools and full error handling. The scripted demo mode stays in the product as a stage fallback.

---

## 1. Instructions for the AI assistant

- Build a production-shaped MVP of Sjekkpunkt with two stations (packing and returns), a team lead console, insights, admin settings and a mock Holio back office.
- **Live mode is the default.** Demo mode (scripted fixtures, director bar) remains available behind a flag and must keep working at every milestone.
- **The server is the source of truth.** The rule engine runs on the client for instant previews, but every decision that changes money, stock or status is recomputed on the server from stored data. The client never sends a grade, a shelf or a refund amount.
- Work milestone by milestone (section 12). Finish each milestone's "done when" list before starting the next. After each milestone, report what passes and what does not.
- If a part of Phase 1 from the demo brief is already built, keep it and extend it. Do not restart.
- SDK method names, model ids and APIs change often. Check the current docs for ElevenLabs, the vision model and Supabase before wiring. Never guess.
- If something is unclear, choose the safer and more reliable option and write the choice in `docs/decisions.md`.

---

## 2. Scope

### In scope

| Area | What the MVP does |
|---|---|
| Accounts and roles | Login, roles (packer, returns, lead, admin), preferred language, device label |
| Catalogue | Products with reference photos, barcodes, variant groups, locations |
| Orders and returns data | Seed data, CSV import, mock Return Portal registrations |
| Packing station | Order queue, camera check, quantities, retakes, barcode fallback, manual confirm, evidence photo, pack alerts |
| Returns station | Return queue and scan, multi-item returns, guided photos, condition, cause, grade, shelf, refund proposal, notes, escalation |
| Team lead console | Escalation queue, overrides, stock adjustment approvals, alert management, spoken Norwegian summaries |
| Insights | SKU-pair mix-ups, return reasons, grades, causes, value recovered, near-misses caught. Never per worker |
| Admin | Settings, thresholds, languages, grading guide, retention, audit log viewer, demo reset |
| Holio mock | A "Holio WMS (mock)" view and integration events in Holio's vocabulary |
| Voice | ElevenLabs agents for both stations and the lead, push-to-talk, captions, language switching, full tap-only fallback |
| Privacy and security | RLS, signed photo URLs, EXIF stripping, face discard, retention job, rate limits, spend caps, worker information screen |

### Out of scope

Box size suggestions (Holio shipped this in October 2026), phone dimensioning, goods receipt, a customer-facing app, real Holio API integration (no public API), real payments, offline commits, and **any per-worker performance statistics** (never build these).

---

## 3. Architecture

```
Android handheld / phone (PWA, Chrome, HTTPS)      Lead tablet / desktop
  packing + returns stations                         lead console, insights, admin
          │                                                   │
          └──────────────── Next.js app (Vercel, EU region) ──┘
                     │  API routes (server only):
                     │  tokens, vision, translate, tts, decisions
                     │  shared rule engine (lib/engine)
          ┌──────────┼───────────────────────────┐
          ▼          ▼                           ▼
   Supabase (EU)   ElevenLabs                Vision model
   Postgres + RLS  agents, TTS, SFX, STT     fast model + strong fallback
   Auth, Storage
   Realtime
```

**Recommended stack:** Next.js (App Router) with TypeScript and Tailwind, Supabase in an EU region (Postgres, Auth, Storage, Realtime), zod for every schema, `@elevenlabs/react` for voice, Vitest for unit tests, Playwright for end-to-end tests, Vercel with an EU function region.

If Phase 1 was built with Vite, either migrate it into Next.js or keep Vite and add Vercel functions or a small Express server. Both are fine. Pick one and record it in `docs/decisions.md`.

### Folder structure

```
app/
  (handheld)/pack/...        packing station
  (handheld)/return/...      returns station
  (lead)/lead/...            escalations, approvals, alerts
  (lead)/insights/...
  (admin)/admin/...          settings, products, import, audit, retention
  holio/...                  "Holio WMS (mock)" back office
  privacy/                   worker information screen
  api/...                    route handlers (section 6)
lib/
  engine/                    rules.ts, grade.ts, loop.ts, types.ts, constants.ts (+ tests)
  vision/                    schemas.ts (zod), prompts.ts, client.ts
  voice/                     agents.ts, clientTools.ts, captions.ts
  db/                        queries, types generated from Supabase
  i18n/                      strings for nb, en, pl, uk, ro, lt
  demo/                      fixtures, script, director
supabase/
  migrations/                schema, RLS policies, views
  seed.sql
docs/
  decisions.md, threat-model.md, privacy.md, architecture.md, test-plan.md
tests/
  e2e/                       Playwright, including the full scripted demo
```

---

## 4. Database

Every table also has `id uuid primary key default gen_random_uuid()`, `warehouse_id uuid not null` and `created_at timestamptz default now()`. The MVP runs one warehouse, but the column makes multi-tenant possible later.

```sql
profiles (user_id uuid references auth.users, role text check (role in ('packer','returns','lead','admin')),
          preferred_lang text check (preferred_lang in ('nb','en','pl','uk','ro','lt')),
          display_name text, privacy_info_read_at timestamptz)
devices (label text unique)                                   -- 'device-07'
locations (code text unique, kind text check (kind in ('stock','outlet','repair','scrap')))
products (sku text unique, name_nb text, name_en text, category text, color text, size text,
          price_nok int, location_code text references locations(code), variant_group text,
          barcode text, reference_photo_paths text[])
orders (ext_id text unique, customer_ref text, status text, shipped_at timestamptz)
order_lines (order_id uuid references orders, sku text references products(sku), qty int, price_nok int)
photos (storage_path text, purpose text, entity_type text, entity_id uuid,
        faces_discarded bool default false, expires_at timestamptz)
vision_results (photo_id uuid references photos, purpose text, model text, latency_ms int,
                schema_valid bool, output jsonb)
pack_checks (order_id uuid, status text, method text check (method in ('camera','barcode','manual')),
             size_verified bool, confidence numeric, evidence_photo_id uuid, device_id uuid,
             manual_reason text, line_results jsonb)
returns (ext_id text unique, order_id uuid, customer_reason_nb text, registered_at timestamptz,
         customer_photo_id uuid, status text)
return_items (return_id uuid, ordered_sku text, received_sku text, qty int, status text)
inspections (return_item_id uuid, condition jsonb, worker_note_original text, worker_note_lang text,
             worker_note_nb text, customer_note_text text, suspicious_note bool)
decisions (return_item_id uuid, grade text, location_code text, refund_nok int, cause text,
           flags text[], engine_version text, is_override bool default false, override_reason text,
           decided_by uuid, decided_at timestamptz)
stock_adjustments (sku text, delta int, reason text, source_type text, source_id uuid,
                   status text check (status in ('proposed','approved','rejected')), decided_by uuid)
escalations (entity_type text, entity_id uuid, reason text, summary_nb text, summary_audio_path text,
             status text check (status in ('open','resolved')), resolution jsonb, resolved_by uuid)
confusion_events (sku_a text, sku_b text, kind text, source_type text, source_id uuid, at timestamptz)
pack_alerts (sku_a text, sku_b text, rule text, reason_nb text, active bool,
             origin text check (origin in ('auto','manual')), cleared_by uuid, cleared_at timestamptz)
integration_events (type text, payload jsonb)                -- what Holio would receive
audit_events (at timestamptz, station text, type text, ref_type text, ref_id uuid,
              summary_nb text, summary_en text, actor_device uuid, actor_user uuid, payload jsonb)
settings (key text unique, value jsonb)
```

Rules for the database:

- **Row Level Security on every table.** Packers and returns workers can read what their station needs and write only through API routes. Leads can read everything except raw audit payloads. Admins can do everything.
- `audit_events` is append-only. No role has update or delete rights on it.
- `actor_user` is stored only for approvals, overrides and manual confirms. Insights read from **views that contain no user or device columns**. Add a test that fails if an insights view exposes `actor_user`, `decided_by` or `device_id`.
- Seed data from section 5 of the demo brief, plus at least 30 extra products, 40 orders (some multi-line, some qty above 1) and 15 registered returns across all grades and causes.

---

## 5. Rule engine additions

The rules P1–P5 and R1–R11 from the demo brief stay. Add these and write tests for each.

### Packing

| Rule | Condition | Result |
|---|---|---|
| P6 Quantity | Seen count for a SKU differs from the ordered qty | `MISMATCH` with "missing n" or "extra n" |
| P7 Barcode | A line verified by scanning the item barcode | Line counts as present and size verified, `method = 'barcode'`. Use it for polybags and glare |
| P8 Manual confirm | After `MAX_RETAKES`, the packer confirms manually with a reason (`polybag`, `glare`, `other`) | `MANUAL_CONFIRM`, logged. If the SKU has an active alert, notify the lead (not blocking) |
| P9 Timeout | Vision does not answer within 8 seconds | Show retake or barcode fallback. Never auto-verify |

### Returns

| Rule | What it does |
|---|---|
| R12 Multi-item | Each return item is inspected and decided on its own. The return is confirmed when every item has a decision |
| R13 Unknown parcel | A parcel with no registered return becomes an `unknown_return` escalation |
| R14 Return window | If `registered_at` is later than `return_window_days` (setting, default 30) after `shipped_at`, escalate. Do not reject automatically |
| R15 Lead override | A lead can change grade, shelf or refund with a required reason. Refund stays capped at the order line value. Stored with `is_override = true` |
| R16 Server authority | `confirm` endpoints load stored vision results, inspections and settings, rerun the engine and write the decision. Any client-sent decision fields are ignored |
| R17 Engine version | Every decision stores `engine_version` so old decisions can be explained after rules change |

### Escalation reasons (complete list)

`suspicious_note`, `low_confidence_after_retakes`, `wrong_item_inconclusive`, `customer_caused_damage` (grade C or D with customer-side reason), `unknown_return`, `late_return`, `manual_confirm_on_alert`, `face_in_frame_repeated`.

### Stretch rule (build last)

| Rule | What it does |
|---|---|
| R18 Customer photo | If the Return Portal registration has a customer photo, compare it with the received condition. Customer photo intact and received item damaged = cause `transit_damage` and flag `carrier_claim` |

---

## 6. API routes

All routes check the user's session and role. All inputs and outputs are validated with zod.

| Route | Role | Purpose |
|---|---|---|
| `POST /api/voice/token` `{station}` | packer, returns, lead | Mint an ElevenLabs conversation token for that station's agent |
| `POST /api/photos/upload-url` `{purpose, entityType, entityId}` | packer, returns | Signed upload URL to a private bucket |
| `POST /api/vision` `{photoId, purpose}` | packer, returns | Run vision, validate, store `vision_results`, discard if `facePresent` |
| `POST /api/pack/:orderId/check` | packer | Run P1–P9 on the latest vision result, return preview |
| `POST /api/pack/:orderId/barcode` `{code}` | packer | Verify a line by barcode |
| `POST /api/pack/:orderId/manual` `{reason}` | packer | Manual confirm |
| `POST /api/pack/:orderId/seal` | packer | Commit `VERIFIED` or `MANUAL_CONFIRM`, write evidence, events |
| `POST /api/returns/scan` `{code}` | returns | Find a return by QR or number, or create an unknown-return escalation |
| `POST /api/returns/items/:id/evaluate` `{workerNoteOriginal?, lang?, unusable?}` | returns | Preview decision |
| `POST /api/returns/items/:id/confirm` | returns | Server reruns the engine and commits (R16) |
| `POST /api/translate` `{text, from}` | returns | Translate a worker note to Norwegian on the server |
| `POST /api/tts/summary` `{escalationId}` | server internal | Generate and cache the Norwegian lead summary |
| `GET /api/lead/escalations`, `POST /api/lead/escalations/:id/resolve` | lead | Queue and resolve with override |
| `POST /api/lead/stock-adjustments/:id/decide` | lead | Approve or reject |
| `POST /api/lead/alerts`, `POST /api/lead/alerts/:id/clear` | lead | Create a manual alert or clear one |
| `GET /api/insights?range=7d\|30d` | lead, admin | Aggregates from the anonymous views |
| `POST /api/admin/import` (CSV) | admin | Products, orders, returns |
| `PATCH /api/admin/settings` | admin | Thresholds, languages, retention, grading guide |
| `POST /api/admin/demo-reset` | admin, only when `DEMO_ENABLED=true` | Reset to seed |

Rate limits: per user and per device on `/api/vision`, `/api/voice/token`, `/api/translate`. A daily spend cap for vision and ElevenLabs calls, read from settings. When exceeded, the app switches to tap-only mode and shows a clear message.

---

## 7. Screens

### Handheld (packer and returns roles)

- **Login** with email and password, then pick device label (remembered on the device).
- **First launch:** language picker, then the **privacy information screen** in the worker's language (section 10). The button says "Jeg har lest dette" / "I have read this", not "I consent".
- **Station home:** queue of orders to pack or returns to inspect, scan button, push-to-talk, language chip, captions toggle.
- **Packing:** the flow from the demo brief plus quantity badges per line, barcode fallback button per line, retake counter, manual confirm with reason picker, alert banner when an alert is active for a SKU in the order.
- **Returns:** the flow from the demo brief plus an item switcher for multi-item returns, packing evidence thumbnail and (stretch) customer photo thumbnail, retake counter, a "Send til teamleder" button always available.
- **Error states:** offline (block commits, retry), vision timeout, camera permission denied (show how to enable), mic denied (tap-only mode), spend cap reached (tap-only mode).
- Screen wake lock while a station session is active.

### Lead console (tablet or desktop)

- **Escalations:** cards with photos, model output and confidence, worker note in the original language and Norwegian, play button for the spoken summary, actions: approve, override (grade, shelf, refund with reason), reject.
- **Stock adjustments:** proposed corrections with source, approve or reject.
- **Pack alerts:** active alerts with origin and count, clear, create manual alert for a SKU pair.
- **Live feed:** latest events from both stations through Supabase Realtime.

### Insights

- SKU-pair mix-ups (7 and 30 days), with alert status.
- Return reasons per SKU and per category.
- Grade distribution and value recovered (A and B resold in NOK, C repaired, D scrapped).
- Causes: likely warehouse error, customer side, inconclusive, transit damage.
- Near-misses caught at packing and an estimated NOK saved (caught mismatches × configurable cost per wrong parcel, default 340 kr, labelled as an estimate).
- A visible footer: "Ingen statistikk per ansatt" / "No per-employee statistics".

### Admin

Settings (all thresholds from the demo brief plus `return_window_days`, `photo_retention_days`, `wrong_parcel_cost_nok`, enabled languages, spend caps), product editor with reference photo upload, CSV import, grading guide editor (text that is also uploaded to the agents' knowledge base), audit log viewer with filters, retention status, demo reset.

### Holio WMS (mock)

Order and return records shown the way Holio would show them (Ordre, Retur, Returårsak, Lokasjon, Bekreft retur), with the new fields Sjekkpunkt adds (Tilstand, Grad, Bilder, Merknad, Flagg, Sannsynlig årsak, Pakkebevis). A list of `integration_events` with payloads named `pack.verified`, `pack.manual_confirm`, `return.item.decided`, `return.confirmed`, `stock.adjustment.approved`. This is how the pitch shows "it writes into Holio" without a real API.

---

## 8. Voice for the MVP

- **Agents:** one for packing, one for returns (both multilingual), one for the lead (Norwegian). One agent with workflow nodes is also fine if the current docs make that simpler. Record the choice.
- **Start language** comes from `preferred_lang` (language override at session start). Language detection stays on so the worker can switch mid-conversation.
- **Client tools call API routes.** The agent never sees keys or raw database rows. Tool results are short and contain only what the agent needs to say.
- **Lead agent:** given the escalation as context, it can answer "why was this flagged?" and "what did the worker say?" in Norwegian. It cannot resolve escalations. The lead taps.
- **Push-to-talk is the default.** A hands-free toggle exists for quiet areas.
- **Everything works without voice.** Every step has a button and on-screen text. Voice speeds things up but is never required. This also covers languages ElevenLabs does not support, such as Tigrinya.
- **Captions** for every agent and worker turn, with a Norwegian or English translation line.
- **Worker notes:** the original text from speech to text is stored, plus a server-side Norwegian translation.
- **Audio assets:** earcons and lead summaries are generated server-side and cached in Storage. Nothing is generated twice.
- **Keyterms** for speech to text are built from the product names and location codes in the database.

---

## 9. Vision for the MVP

- **Closed set:** send the order lines and up to 4 reference photos of the candidate SKUs with each request. The model may only choose from those SKUs.
- **Two-stage models:** a fast model first. If any identity or label confidence is below threshold, or the purpose is `label`, retry once with a stronger model. Store which model answered and the latency.
- **Validation:** zod-parse every response. Invalid JSON gets one retry, then a retake prompt.
- **Image pipeline on the client:** downscale to about 1024 px on the long side, strip EXIF (removes location data), JPEG quality about 0.8.
- **Face rule:** if `facePresent` is true, delete the photo from storage, keep only the event, and ask the worker to point the camera at the item.
- **Prompt:** the system prompt from the demo brief section 7, unchanged in its safety lines.

---

## 10. Privacy, security and compliance

| Requirement | Implementation |
|---|---|
| Keys never in the browser | Token routes, server env only, a secret scan in CI |
| Server authority | R16. Client decision fields ignored and tested |
| Prompt injection | Fixed schema, regex second layer, engine owns decisions, refund cap, human tap, a test with the injected note |
| Photos | Private bucket, short-lived signed URLs, EXIF stripped, faces discarded, `expires_at` from `photo_retention_days` (default 30), a scheduled job deletes expired photos |
| No worker monitoring | No per-worker stats, anonymous insights views with a test, no emotion inference, no voiceprints, voice is never used to log in |
| Worker information | `/privacy` screen in every enabled language: what is captured (item photos when you tap, speech while you hold the talk button), what is not (no background recording, no faces, no performance scores), how long photos are kept, who to ask. Shown on first launch and reachable from the menu |
| Customer data | Synthetic in seed. In production, crop to the item and redact names and addresses on labels before upload (document as a known next step) |
| Abuse and cost | Rate limits, spend caps, tap-only fallback |
| Web hardening | CSP headers, same-site cookies, no `dangerouslySetInnerHTML` with model output, dependency audit in CI |
| Data residency | Supabase and Vercel in EU regions. Document the production plan for ElevenLabs EU residency and zero retention and an EU-region vision model in `docs/privacy.md` |

Deliverables for the jury, generated from the codebase:

- `docs/threat-model.md`: one page, threats mapped to OWASP Top 10 for LLM Applications IDs (LLM01, LLM02, LLM05, LLM06, LLM10) and the mitigation in the code.
- `docs/privacy.md`: one page with data flows, controller (the warehouse) and processors (Sjekkpunkt, Holio, sub-processors), retention, and the worker information text.
- `docs/architecture.md`: the diagram from section 3 and the decision flow from the demo brief.

---

## 11. Testing

- **Unit (Vitest):** every rule from both documents, including the nine tests in the demo brief and new tests for P6–P9, R12–R17.
- **Contract:** recorded vision responses for each purpose, parsed with the zod schemas. Include one invalid response and one with `facePresent: true`.
- **Security tests:** confirm endpoint ignores a client-sent `refund_nok: 5000`, a packer cannot call lead routes, insights views expose no user or device columns, the injected note never raises the refund.
- **End to end (Playwright):** the full scripted run from the demo brief in demo mode, plus one live-mode packing flow and one live-mode return with mocked vision.
- **Manual test plan** in `docs/test-plan.md` with real props: navy and black hoodie, a jacket with a clear size label, socks, a polybagged item, a glossy item, the handwritten injection note, tested under the venue's lighting.

---

## 12. Milestones

Keep demo mode working at every milestone. It is the stage fallback.

| # | Milestone | Done when |
|---|---|---|
| M1 | Foundation | Next.js app deployed on HTTPS, Supabase schema with RLS and seed, login with roles, shared engine with all unit tests passing |
| M2 | Returns, live | Real camera, upload, vision, guided steps, multi-item, decision preview, server confirm, record visible in Holio mock |
| M3 | Voice on returns | Returns agent with client tools, language switch, push-to-talk, captions, note translation, tap-only fallback |
| M4 | Packing, live | Queue, camera check with overlay, quantities, retakes, barcode fallback, manual confirm, evidence photo, packing agent |
| M5 | Loop and lead console | Confusion events from both stations, auto alerts, alert enforcement at packing, escalation queue, overrides, stock approvals, Norwegian spoken summaries, lead agent |
| M6 | Insights and integration events | All insights panels from anonymous views, integration events in the Holio mock |
| M7 | Admin and privacy | Settings, product editor, CSV import, grading guide sync, audit viewer, retention job, privacy screen in all languages |
| M8 | Hardening | Rate limits, spend caps, CSP, secret scan, security tests, the three docs for the jury |
| M9 | Stage readiness | Demo mode and director bar polished, demo reset, Playwright run green, manual test plan done with props |
| S1 | Stretch | Customer photo from the Return Portal and R18 transit damage, Shopify dev store import, more languages |

---

## 13. MVP acceptance checklist

- [ ] A packer and a returns worker can each log in on an Android phone, pick a language and complete their flow end to end with real camera and voice.
- [ ] The same flows can be completed with taps only, no voice.
- [ ] A multi-item return with one wrong item, one grade B item and one suspicious note produces correct decisions, a stock adjustment proposal and two escalations.
- [ ] A qty 2 order with one item in the box is blocked at packing.
- [ ] Three mix-ups of one SKU pair within 7 days create an alert, and the next packing of that SKU requires a label photo or barcode.
- [ ] A lead can resolve escalations, override with a reason, approve stock adjustments and clear alerts. Every action is in the audit log.
- [ ] Insights show the data and contain no per-worker numbers.
- [ ] A client-sent refund or grade is ignored by the server (test passes).
- [ ] No API key in the client bundle (secret scan passes).
- [ ] Photos with faces are discarded and photos expire after the retention period.
- [ ] Demo mode runs the full scripted demo from the demo brief after a reset.
- [ ] `docs/threat-model.md`, `docs/privacy.md` and `docs/architecture.md` exist and match the code.

---

## 14. Things to confirm with Holio (affects the build)

- Which fields would Holio want from a return inspection (grade, photos, condition, B-stock)? Adjust `decisions` and the Holio mock view to match.
- Would this live inside Holio OPS (deep link or Android intent) or as a separate app? Do customers' handhelds have usable rear cameras?
- Do Holio product records hold photos, barcodes and variant groups? Copy their field names in the mock if possible.
- Which languages do customers' floor workers speak? Adjust the enabled languages.
