# Decisions

Newest at the bottom. Each entry: what, why, and what it rules out.

## 2026-11-07 Next.js, not Vite
Fresh start with no Phase 1 code, so we take the addendum's recommended stack directly. One codebase for UI and API routes, deployed on Vercel.

## 2026-11-07 Hosted Supabase for development
Docker is not installed on the build Mac, so the local Supabase stack is unavailable. Migrations and seed live in `supabase/migrations` and `supabase/seed.sql` and are pushed with the Supabase CLI to a hosted EU project. RLS tests run against that project with dedicated test users.

## 2026-11-07 Writes only through API routes
Packer and returns roles have read-only RLS. Every write goes through a route handler that checks role, validates with zod and writes with a server-only service-role client. This is the simplest way to guarantee R16 (server authority) and keeps the service key out of the browser.

## 2026-11-07 Station UI behind a port
Station screens call a `StationPort` interface with a demo adapter (in-memory, fixtures) and a live adapter (API routes). Demo mode is the same UI and the same engine, which is what keeps it working at every milestone.

## 2026-11-07 Brief P3 replaced by addendum P8
After `MAX_RETAKES` the packer may confirm manually only with a reason (`polybag`, `glare`, `other`). Addendum wins.

## 2026-11-07 Cache Components off
Next 16.4 scaffolds with `cacheComponents: true`. Almost every screen reads the Supabase session cookie, which under Cache Components must sit behind Suspense and fails instant-navigation validation. Off for now; revisit only if a static page needs it.

## 2026-11-07 Engine: what counts as a "size-variant" item (P3)
A product needs its size read only when its `variantGroup` contains another product with a different size (shell jacket M/L). The hoodies share a group but differ by colour, which the overview photo shows, so their size label is not required. `PackDecision.sizeVerified` covers size-variant lines only.

## 2026-11-07 Engine: unidentified items are uncertain, not wrong (P1/P3/P7)
An item the model returns with `matchedSku: null` and confidence below `PACK_CONFIDENCE_MIN` (polybag, glare) does not trigger MISMATCH. If such items can account for the missing units, the result is NEEDS_LABEL_PHOTO, which opens label close-up, barcode (P7) and, after retakes, manual confirm (P8). A confidently identified wrong SKU, an extra unit or a label showing the wrong size is always MISMATCH.

## 2026-11-07 Engine: manual confirm is never allowed on MISMATCH (P8)
Manual confirm is offered only after `MAX_RETAKES` and only when the status is NEEDS_LABEL_PHOTO or a vision timeout. A confident wrong item cannot be overridden by the packer.

## 2026-11-07 Engine: RETAKE preview status
Vision timeout (P9) and a face in frame produce `status: 'RETAKE'`. It is preview-only and never stored as a pack check.

## 2026-11-07 Engine: missing packaging grades B
The brief's `computeGrade` ignores packaging, but its grading guide (Appendix B) says missing packaging is grade B. The guide wins; `computeGrade` adds `packaging === 'missing'` to the B rule.

## 2026-11-07 Engine: causes for non-wrong-item returns
When the received item matches the order, cause is `customer_side`. R7's "grade C/D with customer-side reason" uses that. `transit_damage` is reserved for R18 (stretch).

## 2026-11-07 Engine: worker input is structured
`WorkerInput` carries `damage`, `stains`, `tagsAttached`, `unusable` and the translated `noteNb`. The voice agent (M3) and the tap checklist both fill these fields; free text is stored, never parsed by the engine.

## 2026-11-07 Demo script needs a front photo for return 1043
R2 requires `front` and `label` for apparel. The brief's RET scene only captures the label, so the demo script (M2) adds a quiet front shot (`ret-1043-front.svg` is already in the brief's illustration list). Otherwise the return could not be confirmed.

## 2026-11-07 Schema details
- `settings` is unique per `(warehouse_id, key)` rather than globally, so multi-tenant later is a data change.
- `pack_checks` accepts all four pack statuses (MISMATCH and NEEDS_LABEL_PHOTO too) so near-misses can be counted; only VERIFIED/MANUAL_CONFIRM are evidence.
- `audit_events` blocks update/delete/truncate with a trigger for every role (including the DB owner) and revokes the privileges from the API roles. A deliberate demo reset may purge it by setting `sjekkpunkt.allow_audit_purge` in its own transaction; `supabase/seed.sql` does this.
- Leads read the audit log through the `audit_log` view (no payload). The view filters by role and warehouse itself because the base table is admin-only.
- Seed timestamps are generated relative to `now()` from `lib/demo/seed.ts` (anchored to the demo clock 2026-11-07 10:00 Oslo), so the 7-day loop works on any day.

## 2026-11-07 Hosting region
Supabase in eu-north-1 (Stockholm) and Vercel functions pinned to `arn1` (Stockholm) to keep latency between them low and data in the EU.

## 2026-11-07 AI provider keys: GEMINI_API_KEY and ELEVENLABS_API_KEY
These replace the addendum's `VISION_API_KEY`. Both live in `.env.local` and in Vercel (production and preview, sensitive).
- `GEMINI_API_KEY` is the name the `@google/genai` SDK reads by default. Key "sjekkpunkt" from Google AI Studio, in its own Google Cloud project "sjekkpunkt" (`gen-lang-client-0548357036`). **Free tier, no billing.** Google's free-tier terms let it use prompts and responses to improve its products, so free tier is fine for the demo with fixtures but not for real customer photos; enable billing (paid tier) before pilot data. New AI Studio keys use a newer format than classic Google API keys, so do not validate them by prefix.
- `ELEVENLABS_API_KEY`: key "sjekkpunkt", restricted. Access: Text to Speech, Speech to Text, Sound Effects, ElevenAgents (write), Voices (read), Models. Everything else, including User and Workspace, has no access. Credit limit 20,000 per refresh period, never expires, auto-disable if leaked on.

## 2026-11-07 Vision models and budget (M2)
Fast model `gemini-3.5-flash-lite`, strong model `gemini-3.6-flash`, both with `thinkingLevel: MINIMAL` and both on the free tier (checked against the docs and the key's model list). `gemini-3.8-flash` did not answer within 30 s on the free tier and `gemini-4-argon` is paid only. Flow inside the 8 s budget (P9): fast model first, capped at 4.5 s so a model that hangs under load still leaves room; invalid JSON gets one retry; label photos, and any identity read below `return_confidence_min`, get one strong-model try whose answer wins when valid. Measured on real photos: 1.2-5 s per photo. On timeout the worker gets a retake prompt and nothing is verified. Calls use `generateContent` with `responseJsonSchema` (`@google/genai` 3.0.0). The docs now call it legacy but supported; the Interactions API can replace it later behind `lib/vision/client.ts`. Model ids can be overridden with `VISION_MODEL_FAST` / `VISION_MODEL_STRONG`.

## 2026-11-07 Vision output is normalized on the server
After zod validation the server, not the model, decides what counts: the purpose is the one the worker asked for, SKUs outside the closed candidate set (ordered SKU plus its variant group) become null, packaging is judged only on a packaging photo, and a note or damage close-up never identifies the item. The prompt says `tagsAttached` is false only when a tag was clearly cut or torn off; "no tag visible" is unknown. Without that, a like-new jacket photographed without its tags dropped to grade B.

## 2026-11-07 Engine 1.1.0: a size-variant item needs a size read (R3)
For products whose variant group has other sizes (shell jacket M/L), identity comes only from a photo that read a size. The fast model "recognised" JK-SHELL-L at 0.8 on a front photo with no visible size; if the label had then been unreadable, the engine would have accepted the guess. Now that case asks for a label retake. ENGINE_VERSION is 1.1.0 (R17).

## 2026-11-07 Which photos count, and how retakes are counted
A retake replaces the earlier photo of the same purpose: the latest usable photo per purpose feeds the engine, so one blurry shot cannot stick to the item. Retakes (R9) are counted per photo type: unconfident identity shots of the same type minus the first (three blurry labels = two retakes = escalate). Vision timeouts count as weak attempts. Face photos are deleted from storage at once, never count as findings, and are counted for `face_in_frame_repeated`. One `vision_results` row per photo stores the winning model, total latency, the normalized inspection and every attempt (model, latency, error).

## 2026-11-07 Confirm commits in one transaction, from stored data only (R16)
`POST /api/returns/items/:id/confirm` ignores its body, reloads photos, vision results, worker input, packing evidence and settings, reruns the engine and calls `public.commit_return_item`, a SQL function that writes the decision, stock proposals, confusion events, escalations, integration events and audit rows in one transaction. Only the service role may execute it (tested). Confirming twice is refused. The e2e test sends `refund_nok: 5000` and grade D on confirm and checks that the stored decision is A, C-14-2, 1 499 kr. The worker's tap is recorded against the device; `decided_by` stays null and is set only for lead overrides (no per-worker data).

## 2026-11-07 Escalations from the returns station
"Send til teamleder" escalates with every reason the engine found plus a new `worker_request` reason (added to the check constraint; the engine never produces it). An unknown parcel at scan creates `unknown_return` on entity `parcel` (R13). A late return is escalated at scan time on the return itself (R14), and the commit does not duplicate it. Open escalations are de-duplicated per entity and reason. Lead summaries are deterministic Norwegian text built from the engine decision (`lib/returns/summary.ts`), never model prose; spoken versions come in M5.

## 2026-11-07 Worker input and notes
One `inspections` row per return item (unique constraint), updated in place: the tap checklist (damage, stains, tags, unusable) is stored as `condition.worker` and only ever makes the condition worse. A worker note is stored in the original language; `worker_note_nb` is filled now only for Norwegian, and server-side translation comes with voice in M3.

## 2026-11-07 Live loop alerts wait for M5
Live confirms already store `found_at_returns` confusion events (R11). Creating and enforcing pack alerts from them in live mode is M5 ("auto alerts"). Demo mode runs `recordConfusion` on confirm, so scene 2 shows the alert appear after RET-10, as the brief's acceptance list asks. (Done in M5, see below.)

## 2026-11-07 Demo mode details
Demo mode runs the same returns station component on a demo adapter (`lib/demo/store.ts`): in-memory seed, scripted vision fixtures, and the same engine, findings selection and summaries as the server. Going back a step replays from seed, so every step is reproducible. Key presses that arrive while a step is still running are queued, not dropped. RET-03 takes the quiet front shot R2 needs. RET-09 shows the lead card before confirm, as in the brief. Missing audio files are ignored.

## 2026-11-07 Testing live mode with mocked vision
`VISION_MOCK=fixtures` makes `/api/vision` answer from the demo fixtures; everything else stays real (storage, routes, engine rerun, SQL commit). The local Playwright server sets it, and the code refuses it when `VERCEL_ENV=production`. Local e2e runs reset the hosted dev database to seed first and use one worker; against a deployment the reset (and the live returns spec, with real vision) needs `E2E_RESET_DB=1`. The same spec passed against real Gemini on 2026-11-07.

## 2026-11-07 Voice: one returns agent, built from the repo (M3)
One ElevenAgents agent per station (addendum section 8 allows this over one agent with workflow nodes): `Sjekkpunkt returns coach`, `ELEVENLABS_AGENT_ID_RETURNS`. Packing (M4) and lead (M5) get their own. The whole agent (prompt, six client tools, language presets, knowledge base, overrides) is data in `lib/voice/agent-config.ts`, and `pnpm voice:setup` creates or updates it by name, so the dashboard is never the source of truth. Client tools are created through `/v1/convai/tools` and attached with `tool_ids` (inline `prompt.tools` is deprecated). Checked against the docs and `@elevenlabs/react` 1.21.1 types on 2026-11-07; the React SDK now needs a `ConversationProvider` and `useConversationClientTool`.
- Auth is on: only a conversation token from `POST /api/voice/token` starts a session. The token route checks the role per station and returns only the token and the keyterms.
- The client may override only `agent.language`, `agent.first_message` and `asr.keywords`. It cannot change the prompt, tools or LLM.
- LLM `gemini-3.5-flash`, temperature 0.2. TTS `eleven_v4_turbo`: the only low-latency model that covers all six languages (Flash v2.5 has no Lithuanian). Norwegian is `no` in ElevenLabs, `nb` in the app (`EL_LANG`).
- Voice: River (premade). The docs say the premade default voices retire on 2026-12-31 and the replacements are Voice Library voices; the API key has Voices read-only, so they cannot be added from here. **Swap the voice before 2026-12-31** (add a library voice in the dashboard, set `COACH_VOICE_ID`, run `pnpm voice:setup`).
- Keyterms: the docs field is `asr.keywords` (there is no `keyterms` field). The agent carries a fixed list; each session overrides it with up to 50 terms from the database (location codes first, then product names).

## 2026-11-07 Voice: tool results never contain customer note text
Client tools answer with short JSON built in `lib/voice/returns-tools.ts`: names, sizes, what the engine decided, what to do next. A customer note reaches the agent only as `{present, contains_instructions}`; its text is never in a tool result, so an injected note cannot reach the LLM at all (LLM01). A unit test checks the 1043 injection note. The agent never confirms: confirm stays a tap, and the agent hears about it as a `[screen]` message.

## 2026-11-07 Voice drives the camera
`show_step` opens the camera on a photo step. `capture_photo` shoots from the open camera at once; if the camera was not open it opens it and shows a 2-1 countdown first, so a photo is never taken before the worker could aim. The camera exposes this through `CameraControl`; nothing is captured except on the shutter or a worker request to the coach. Taps (photo, condition, confirm, escalate, item switch) are sent to the agent as `[screen]` contextual updates; confirm is sent as a user turn so the coach acknowledges it and moves on. Tool calls use the unwrapped actions, so nothing is reported twice.

## 2026-11-07 Voice: language, captions, notes
- Start language is `preferred_lang`. The `language_detection` system tool stays on with presets for en, pl, uk, ro, lt (default `no`). Its full tool result (client event `agent_tool_response_full_payload`) carries `{"language":"uk"}`; the app reads it and flips the screen language and the chip. A language picked on the chip restarts the session in that language.
- Captions: every final worker and agent line, with a NB or EN line under it from `POST /api/translate` (Gemini `gemini-3.5-flash-lite`, about 1.4 s, cached per server instance). Audio tags such as `[slow]` are stripped (`stripAudioTags`). Lines with no letters ("..." from noise) are dropped.
- Worker notes: `evaluate_return` stores the worker's latest speech-to-text line as the original (not the agent's paraphrase) with the conversation language, and the server translates it to Norwegian. Escalation notes are translated the same way. If translation fails the original is kept and confirm or escalate try again.
- Translation sends worker speech to Gemini on the free tier: fine for the demo, but the same paid-tier caveat as vision applies before real data.

## 2026-11-07 Voice: push-to-talk and fallbacks
Push-to-talk is the default: the provider's controlled `isMuted` keeps the mic muted unless the button is held or hands-free is on (remembered per device). The live test plays Norwegian speech into a fake mic with the button up and checks that nothing is heard. Mic denied, a failed token or a connection error leaves tap-only mode with a message; every step keeps its button. Rate limits and spend caps on `/api/voice/token` and `/api/translate` come in M8.

## 2026-11-07 Testing voice
`tests/e2e/voice.spec.ts` (always): mic denied → tap-only, token role checks and keyterms, note translation with `TRANSLATE_MOCK=echo` (refused in production). `tests/e2e/voice-live.spec.ts` (opt-in, `E2E_VOICE=1`, uses ElevenLabs credits): a real WebRTC session where Chrome's fake mic plays `tests/e2e/fixtures/worker-nb.wav` (made by `scripts/make-voice-fixture.ts` with a different voice) and its fake camera feeds the photo. It checks the language switch, the screen flip, voice-driven photo capture and push-to-talk muting. It depends on model timing, so it is not part of the default run.

## 2026-11-07 Packing: what is stored before the seal (M4)
Photos (`photos` + `vision_results`, entity `order`) and counted barcode scans (`pack_scans`, no device or user column) are the stored state. Every pack route and the seal rebuild the engine input from them with `lib/pack/inputs.ts`, the same function the client preview and demo mode use: the latest overview photo decides (a failed or timed-out latest photo is a timeout, never a verify, P9), all label close-ups count, retakes are every usable photo after the first (overview or label), face photos never count.

## 2026-11-07 Packing: seal and manual confirm (P8, R16)
`POST /seal` reads only `manualReason` from the body. Status, method, size and line results are recomputed from stored rows; a client-sent status is dropped (e2e test). The reason is worker input like the returns tap checklist, and the engine still decides whether manual confirm is allowed (after `MAX_RETAKES`, never on MISMATCH). `POST /manual` is the server preview of that, so no pending state is stored. Per addendum section 4, `actor_user` is written only on `PACK_MANUAL_CONFIRM`; a verified seal records the device only.

## 2026-11-07 Packing: near-misses and confusion events
A MISMATCH found by vision (or a scanned product that is not in the order) calls `record_pack_mismatch` on the server at once, whatever the client does next. The order gets one MISMATCH pack check (one near-miss per parcel, however many photos it took to fix), and each SKU pair is counted once per order (`source_type = 'order'`), so retaking the same wrong box cannot inflate the loop. A wrong barcode adds a confusion pair only when the scanned product shares a variant group with an order line.

## 2026-11-07 Packing: barcode scans
A code matches a product's barcode or its SKU. A scan counts only for an order line and only up to its quantity (`already_counted` after that), so a double beep cannot make a line "extra"; extras are the camera's job. Barcodes alone can verify an order without a photo (P7); then the pack check has no evidence photo.

## 2026-11-07 Packing vision
`pack_check` and `label_closeup` use the returns two-stage client (now generic in `lib/vision/client.ts`): the strong model gets a try when any item is below `pack_confidence_min`, and always for a label. The server normalizes: SKUs outside the candidate set (order lines and their variant siblings) become null, `status` is recomputed from the order, visible text is kept as data only. A label close-up belongs to the line the worker picked; the prompt lists the sizes the product comes in but never which one is expected. Under `VISION_MOCK=fixtures`, order 2207's first overview is the black hoodie and later ones the right box, 2311 shows no size, other orders show everything present.

## 2026-11-07 Voice: packing coach and a shared dock
A second agent, `Sjekkpunkt packing coach` (`ELEVENLABS_AGENT_ID_PACK`), built by the same `pnpm voice:setup`. Client tools are shared objects in ElevenLabs, so packing tools have their own names (`get_order`, `show_pack_step`, `check_box`, `check_label`); a unit test fails on a clash with the returns tools. No knowledge base. The coach can open the camera and take the photos it asks for; sealing, scans and manual confirm stay taps. Tool results carry catalogue names and engine results only: never visible text from the photo (P5) or the model's descriptions; an unknown item gets a sanitized colour word. The session, push-to-talk, captions and language code moved from the returns voice into `components/voice/voice-dock.tsx`; each station registers its tools beside it.

## 2026-11-07 Demo scene 1
PACK-04 and PACK-06 run the real engine on the scripted fixtures through the demo pack adapter, which logs the near-miss and counts the hoodie pair exactly like the server. The brief logs PACK_VERIFIED at PACK-07, before any seal tap, so the demo logs the verified check when the photo verifies; tapping "Klar til forsegling" on stage still works and logs the seal. PACK-01 resets everything; RET-01 now only switches station.

## 2026-11-07 The loop runs in the database (M5)
Auto alerts are opened by a trigger on `confusion_events` (`app.check_pack_alert`), not by the API routes. Every path that records a mix-up (pack mismatch, return confirm, a lead decision on an escalated item) then closes the loop in the same transaction, and a failed route cannot leave a counted event without its alert. The function takes a per-pair advisory lock, counts events with `at` inside `confusion_window_days` (`now - window < at <= now`, as `countInWindow`), compares with `confusion_threshold` from settings, and opens one `REQUIRE_LABEL_PHOTO` alert if none is active, plus a `PACK_ALERT_CREATED` audit row (station `system`). This mirrors the engine's `recordConfusion`, which demo mode still uses; the reason text is the same, built by `app.pair_label_nb`, a port of `pairLabelNb`. A database test compares the two labels for every variant pair in the seed and runs the brief's loop tests 8 and 9 against the trigger. Both labels now separate sizes that contain a slash with " / " ("Jeans 30/32 / 32/32").

## 2026-11-07 What the lead's actions mean (M5, R15)
- **Approve**: accept the decision as it stands. For an item nobody could confirm (sent to the lead by the worker), approve accepts the engine's proposal from the stored photos and worker input, and writes its stock proposals and confusion events too. Not offered while the refund is still the lead's to decide (grade C/D on the customer's side) or when the engine has no grade.
- **Override**: grade, shelf and refund, with a required reason. `applyOverride` caps the refund at the order line value and checks the shelf exists; a new grade moves the shelf by R6 unless the lead picks one. An item that was never identified has no own shelf for grade A, so the lead must pick one (`shelf_required`). Stored as a new `decisions` row with `is_override = true`, `override_reason` and `decided_by` (the lead); the Holio mock shows the latest row.
- **Reject**: no refund (0 kr) with a reason, grade and shelf kept. On cards that are not about an item (unknown parcel, late return, manual confirm on an alert) approve and reject only record the lead's call.
- One action resolves one escalation. Other open cases on the same item stay open and show the new decision.
- Each action is one SQL function (`resolve_escalation`, `decide_stock_adjustment`, `create_manual_alert`, `clear_pack_alert`) that writes the change, the integration event (`return.item.decided` with `overstyrt`, `stock.adjustment.approved`) and the audit row with `actor_user` in one transaction. Only the service role may execute them (tested). Approvals, overrides and alert changes are the places a person is recorded (addendum section 4).

## 2026-11-07 Spoken lead summaries (M5)
`POST /api/tts/summary` generates the Norwegian summary with ElevenLabs Text to Speech the first time a lead presses play, stores it in the private `audio` bucket at `summaries/<warehouse>/<escalation>-<hash of the text>.mp3`, saves the path on the escalation, and returns a 5-minute signed URL. The same text is never generated twice; a changed summary gets new audio. Model `eleven_v4` (checked against `GET /v1/models`: it covers Norwegian; Multilingual v2 does not), voice Daniel (premade, different from the coaches, as the brief asks; premade voices retire 2026-12-31 like River). Generated on demand, not when the escalation opens, so cases nobody plays cost nothing. E2E runs set `TTS_MOCK=silent` (0.3 s of silence, refused in production).

## 2026-11-07 Live feed over Realtime Broadcast (M5)
A trigger on `audit_events` sends each new row to the private channel `feed:<warehouse_id>` with `realtime.send` (checked against the Supabase Realtime docs on 2026-11-07). The message is reduced: time, station, type, reference and the two summaries, never the payload, device or user. An RLS policy on `realtime.messages` lets only leads and admins of that warehouse join (database test: packer, returns worker and another warehouse's topic are refused). The broadcast is wrapped so a Realtime problem never blocks a commit. Postgres Changes was not used because it sends the full row and leads may not read `audit_events`. The console refreshes its data (debounced) on each event, so new cases appear without a reload.

## 2026-11-07 Lead assistant (M5)
A third agent, `Sjekkpunkt lead assistant` (`ELEVENLABS_AGENT_ID_LEAD`), Norwegian only (no language presets, no language detection), with the grading guide as knowledge base and three client tools: `list_escalations`, `get_escalation`, `show_escalation`. None changes data, so it cannot resolve anything (a unit test checks the tool names); asked to approve, it names the buttons. Tool results carry the stored summary, the decision or proposal, model confidence, the worker's note (original and Norwegian) and whether a customer note was flagged, never the note's text. In the first live test the agent said the order value was "ett tusen fire hundre og nittiåtte" kroner (it is 1 499): the platform's default `text_normalisation_type: system_prompt` makes the LLM spell numbers out. The lead agent now uses `elevenlabs` normalisation (digits in the text, the voice reads them), and the live test heard "1499 kroner". The two coaches still use the default; they say refunds too, so switch them after a live check (M9).

## 2026-11-07 Demo scene 3 (M5)
LOOP-01 highlights the insights panel on the alert RET-10 opened. LOOP-02 loads order 2311 on the packing station with the demo store's alerts and takes a quiet overview shot (the jacket, no size visible: `pack-1043.svg`), so the banner asks for the label, like RET-03's quiet front shot. LOOP-03 takes the label close-up (`pack-2311-label.svg`, the box from `LABEL_2311` on the "L"), and the engine verifies with the size read. Demo mode now logs the verified check once per order, whichever photo verified it.

## 2026-11-07 Insights (M6)
- **What counts.** A near-miss is a parcel with a `MISMATCH` pack check, counted once per order (`record_pack_mismatch` already writes one per order), not each `caught_at_packing` confusion event: one parcel can hold two swapped pairs. The estimated saving is near-misses × `wrong_parcel_cost_nok` (default 340 kr), always labelled "Estimat". Value recovered is the list price of the SKU that came in (the view's `item_value_nok`), summed by the latest decision's grade: A and B count as resold, C repaired, D scrapped. No discount is assumed for B, and the page says the value is list price.
- **Windows.** Every panel uses the engine's window, `now − days < t ≤ now`: confusion by `at`, pack checks by `created_at`, returns by `registered_at`, decisions by `decided_at`. The mix-up table always shows both 7 and 30 days (the addendum asks for both); the range switch sets the other panels and the "found at packing / at returns" split.
- **Sources.** Aggregation is pure (`lib/insights/compute.ts`). The server reads only the `insights_*` views, plus product names and the cost setting, which are configuration, not people. Alert status comes from a new `insights_alerts` view without `cleared_by`, so the anonymous-views test still covers everything insights reads. The report schema has no user, device or worker field, and a unit test and the e2e API test check that the JSON contains none.
- **Holio events.** The full list lives at `/holio/events`, linked from the Holio overview. Order and return records keep their own event cards. The seed now writes integration events for its history, built from the same seed rows in the live payload shapes (`motorversjon: "seed"`, no photo IDs), so the list is not empty after a reset. Tests that read events filter by order or return.

## 2026-11-07 Admin writes (M7)
Each admin action is one SQL function (`admin_update_settings`, `admin_save_product`, `admin_add_reference_photo`, `admin_remove_reference_photo`, `admin_import`, `record_retention_run`) that writes the change and its audit row in one transaction, like the lead functions in M5. Only the service role may execute them; a database test checks that no signed-in role, admin included, can call them through the Data API. Admin changes record the admin as `actor_user`: they are deliberate decisions like approvals and overrides, not worker activity. Settings are range-checked by zod (`lib/admin/schemas.ts`) so an admin cannot set values that break the engine (for example a confidence below 0.5 or a threshold of 1). Only changed keys are written, and the audit row holds each old and new value.

## 2026-11-07 Products and reference photos (M7)
The SKU cannot change after creation, because orders, returns, alerts and confusion events refer to it. A product's shelf must be a stock location. A new code is created as a stock location, so an import from a new shop does not need a separate location list. B-OUT-1, R-REP-1 and X-KASS are refused (`not_stock_location`). Reference photos are resized to about 1024 px and re-encoded as JPEG in the browser with the same pipeline as the stations, which drops EXIF. The server accepts only JPEG bytes up to 2 MB, uploads with the service client, and records the photo as purpose `reference` with no expiry: it shows an item, never a person. There are at most four per product. Vision sends the first one per candidate SKU (`MAX_REFERENCES` across the closed set).

## 2026-11-07 CSV import (M7)
One file kind at a time (products, orders, returns), with one row per product, order line or returned item. Rows with the same order or return number are grouped. The parser handles quotes, CRLF and a BOM, and switches to semicolons when the header has more of them than commas (Norwegian Excel). The same file checks run in the browser and on the server (`lib/admin/csv.ts`), then the server checks the database (unknown SKUs, existing orders and returns, items not in the order, barcodes in use). Every problem is reported by line and column, and nothing is written while any remain. "Sjekk filen" is a dry run, and Importer is enabled only after one. The write is one transaction (`admin_import`), so a race that slips past the checks rolls back the whole file. Products upsert by SKU. Orders and returns are new only: an import never changes an order a packer may be working on. An imported order starts as `picked`, and a line without a price takes the product's price. An imported return starts as `pending`, with `registered_at` from the file or now. Limit: 2,000 rows and 1 MB.

## 2026-11-07 Grading guide sync (M7)
The guide moved from a code constant to the `grading_guide` setting, and the code constant is now only the default and the seed value. Saving it in `/admin/guide` updates the one ElevenLabs text document that the returns coach and the lead assistant use, in place: `PATCH /v1/convai/knowledge-base/{id}` with `content`, checked against the API reference on 2026-11-07. The agents keep the same document ID and need no change. This was verified against the live API: the content changed and was restored, and the returns agent still lists the same document. A live conversation did not check that a running agent answers from the new text. A failed push keeps the saved text, shows a warning and writes a `GRADING_GUIDE_SYNC_FAILED` audit row. `pnpm voice:setup` now reads the stored guide and pushes it too, so a later setup run does not overwrite the admin's text.

## 2026-11-07 Photo retention (M7)
`GET /api/cron/retention` runs daily at 02:30 UTC from `vercel.json` `crons`. Vercel calls it with `Authorization: Bearer <CRON_SECRET>`, and the route refuses every call when the secret is unset (compared in constant time). The proxy lets `/api/cron/` through without a session, because cron calls have none. Vercel's docs (checked 2026-11-07) call Cron Jobs legacy and offer Schedules in beta. Cron Jobs were kept because the addendum names them and Schedules are beta; moving later means a `schedules` entry with `requestMethod: "GET"`, and the same secret check still works. On Hobby, cron runs once a day at some point within the hour. Each run deletes up to 1,000 expired files per warehouse in chunks of 100 from Storage, then clears their paths and writes one `RETENTION_RUN` audit row (station `system`, no person; `admin` with the admin when run from the button). Photo rows stay, so the fact that a photo existed and its vision result remain. A path whose upload never finished has no file, and removing it is not an error. Changing `photo_retention_days` moves `expires_at` for stored photos to `created_at + days`, so the setting means "photos are kept N days" for every photo, not only new ones.

## 2026-11-07 First launch and the privacy screen (M7)
Packers and returns workers whose `privacy_info_read_at` is empty are sent from every station to `/welcome`, which offers only the enabled languages, then to `/privacy?first=1` in the chosen language. "Jeg har lest dette" / "I have read this" stores the time and opens the station. It is an acknowledgement, not consent (addendum section 7). Leads and admins are not gated, because they use the desk, but they can open the page. `/privacy` is public, offers every enabled language, falls back to Norwegian for a disabled one, and shows the retention period from settings. The text follows addendum section 10: what is captured, what is not, how long it is kept, and who to ask. It says Sjekkpunkt does not store voice recordings and that ElevenLabs turns speech into text. It promises nothing about ElevenLabs' own retention, which is part of the production plan (zero retention, EU residency) for `docs/privacy.md` in M8. The pl, uk, ro and lt text are drafts flagged for native review, like the other UI strings. The handheld header links to the page with an "i" button, and the header wraps on narrow phones instead of overflowing. The e2e global setup marks the test workers as having read it, so the station specs start at the station; the admin spec walks through the first launch itself.
