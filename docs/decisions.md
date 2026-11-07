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
Live confirms already store `found_at_returns` confusion events (R11). Creating and enforcing pack alerts from them in live mode is M5 ("auto alerts"). Demo mode runs `recordConfusion` on confirm, so scene 2 shows the alert appear after RET-10, as the brief's acceptance list asks.

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
