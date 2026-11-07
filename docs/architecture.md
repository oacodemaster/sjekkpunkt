# Sjekkpunkt: architecture

Generated from the code at M8 (2026-11-07). Choices and their reasons are in `docs/decisions.md`.

## System

```
Android handheld / phone (PWA, Chrome, HTTPS)          Lead tablet / desktop
  packing + returns stations                             lead console, insights, admin, Holio mock
  camera (rear, EXIF removed), push-to-talk              live feed (Realtime), spoken summaries
          │                                                          │
          └───────────── Next.js 16 on Vercel (functions in arn1, Stockholm) ─────────────┘
                proxy.ts: session refresh, sign-in redirect, CSP with a per-request nonce
                API routes: guard() = role + zod  →  limits (rate, spend)  →  one SQL function
                shared rule engine lib/engine (pure TypeScript, also runs in the browser)
          ┌───────────────────────┼──────────────────────────────┐
          ▼                       ▼                              ▼
   Supabase (eu-north-1)     ElevenLabs                     Gemini
   Postgres + RLS + audit    agents over WebRTC (token       vision: fast model, strong fallback
   Auth, private Storage     from /api/voice/token),         translation of notes and captions
   Realtime (lead feed)      spoken summaries (TTS)          (server-side only)
```

**Demo mode** (`/demo`) is the same station UI on an in-memory adapter with scripted vision and audio: each station talks
to a port (`ReturnsPort`, `PackPort`) with a `demo` and a `live` implementation, and both run the same engine.

## How a decision is made and kept

1. The worker taps (or asks the coach). The browser runs `lib/engine` for an instant preview.
2. Photos go to a signed upload URL; `/api/vision` sends them to Gemini with the order's closed set of SKUs and up to four
   reference photos, zod-validates the answer, stores it, and deletes the photo if a face is in it.
3. On **confirm** or **seal**, the route ignores every decision field from the browser, rebuilds the engine input from
   stored rows and settings, reruns the engine (R16), and commits through one SQL function in one transaction: the
   decision, stock proposals, escalations, confusion events, integration events and the audit row.
4. A trigger on `confusion_events` (`app.check_pack_alert`) closes the loop in the same transaction.
5. Leads resolve escalations by tap; overrides need a reason and keep the refund capped (R15).

## Decision flow: packing

```mermaid
flowchart TD
  A[Order picked] --> B[Photo of the open box]
  B --> V{Vision in 8 s?}
  V -- no --> T[Retake or scan barcodes. Never auto-verify P9]
  V -- yes --> C{Every line present, right quantity, nothing extra?}
  C -- no --> M[MISMATCH: block the seal, say what is wrong P1 P6.<br/>Near-miss + confusion pair recorded]
  C -- yes --> D{SKU under an active pack alert,<br/>or a size variant not read, or low confidence?}
  D -- yes --> L[NEEDS_LABEL_PHOTO: label close-up or barcode P3 P4 P7]
  L --> D
  D -- no --> OK[VERIFIED: evidence photo, seal P2]
  L -- after MAX_RETAKES --> MC[Manual confirm with a reason P8.<br/>Lead told if the SKU has an alert]
  T --> L
```

## Decision flow: returns (per item)

```mermaid
flowchart TD
  S[Scan QR or number] --> K{Registered return?}
  K -- no --> U[Escalate: unknown_return R13]
  K -- yes --> W{Inside the return window?}
  W -- no --> LT[Escalate: late_return R14, keep inspecting]
  W -- yes --> P[Guided photos: front, label or packaging, damage, note R2]
  LT --> P
  P --> I{Item matches the order line? R3}
  I -- low confidence after retakes --> E1[Escalate R9]
  I -- wrong item --> CA{Packing evidence? R4}
  CA -- verified with size --> INC[Cause inconclusive: escalate, never blame the customer]
  CA -- manual or size not read --> WE[Likely warehouse error: stock correction proposal R10,<br/>confusion event R11]
  CA -- none --> UNK[Cause unknown]
  I -- matches --> G[Grade from fields, never the model's opinion R5]
  WE --> G
  UNK --> G
  G --> SH[Shelf from grade R6] --> RF[Refund proposal, capped at line value R7]
  RF --> N{Note with instructions? R8}
  N -- yes --> E2[Escalate: suspicious_note. Note stays text]
  N -- no --> CF[Worker taps confirm: server reruns the engine R16, engine_version stored R17]
```

## The loop

```mermaid
flowchart LR
  P[Packing station] -- evidence photo --> O[(Order record)]
  O -- packing evidence --> R[Returns bench]
  R -- wrong item received --> C[Confusion count per SKU pair]
  P -- wrong item caught --> C
  C -- threshold in window, from settings --> A[Pack alert]
  A -- label photo or barcode required --> P
```

Counted per SKU pair, never per worker. Threshold and window are settings (default 3 in 7 days).

## Where things live

| Path | What |
|---|---|
| `lib/engine` | Rules P1–P9, R1–R17, grade, injection check, loop. No React, Next or Supabase |
| `lib/vision`, `lib/translate`, `lib/voice` | Model clients, prompts, zod schemas, agent config and client tools |
| `lib/limits` | Rate limits and spend caps (`api_gate`, `record_spend`) |
| `lib/security/csp.ts`, `proxy.ts` | CSP, security headers, session refresh |
| `app/api` | Route handlers; each calls `guard()` first |
| `supabase/migrations` | Schema, RLS, SQL commit functions, anonymous insights views |
| `tests/db`, `tests/e2e`, `lib/**/*.test.ts` | RLS and SQL tests, Playwright (demo, stations, lead, admin, security, live voice), unit tests |

Deploys: Vercel builds from GitHub `main`; CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, build,
secret scans and the dependency audit. A Vercel cron calls `/api/cron/retention` nightly.
