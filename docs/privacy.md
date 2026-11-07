# Sjekkpunkt: privacy

One page, generated from the code at M8 (2026-11-07). Sjekkpunkt checks **items, not people**.

## Roles

| Role | Who | What they do |
|---|---|---|
| Controller | The warehouse (the 3PL using Holio) | Decides why and how data is used, informs workers, answers requests |
| Processor | Sjekkpunkt | Runs the app for the warehouse, under a data processing agreement |
| Processor | Holio | The warehouse system that receives records. Today a mock: no data is sent |
| Sub-processors | Supabase (database, storage, login), Vercel (hosting), Google (Gemini: vision, translation, the voice agents' language model via ElevenLabs), ElevenLabs (speech to text, voice agents, spoken summaries) | Listed in the agreement; each needs its own DPA in production |

## Data flows

```
Handheld ──photo (EXIF removed)──▶ Supabase Storage (EU, private) ──▶ Gemini (analysis, not stored by us)
    │                                       └── deleted after the retention period; at once if a face is seen
    ├──speech while the talk button is held──▶ ElevenLabs agent (WebRTC) ──▶ text back to the screen
    │                                       └── no audio kept; transcript deleted after 7 days
    ├──taps and decisions──▶ API routes ──▶ Supabase Postgres (EU): records + append-only audit
    └──caption lines──▶ /api/translate ──▶ Gemini (not stored)
```

| Data | Where it comes from | Stored where | Kept how long | Who can see it |
|---|---|---|---|---|
| Item photos | Worker taps the shutter or asks the coach | Supabase Storage, eu-north-1 (Stockholm), private bucket | `photo_retention_days` (default 30), then deleted by the nightly job; photos with a face deleted at once | Signed URLs for minutes; workers at their station, leads, admins |
| Product reference photos | Admin | Same bucket | Until removed (they show items, never people) | All roles |
| Vision results | Gemini's JSON answer | Postgres | With the record | By role (RLS) |
| Worker note | Worker's own words, spoken or typed | Postgres: original text + Norwegian translation | With the record | Returns, lead, admin |
| Speech audio | Microphone, only while the talk button is held or hands-free is on | Not stored by Sjekkpunkt; ElevenLabs keeps no audio (`record_voice: false`) | Transcript at ElevenLabs: 7 days | Nobody in the app |
| Account | Admin creates it | Supabase Auth + `profiles`: email, name, role, language, when the privacy screen was read | Until the account is deleted | The user; leads and admins |
| Device label | Picked once per handheld | Cookie + audit rows | With the audit log | Admins (raw audit), leads (audit view without payloads) |
| Who decided | Lead and admin actions, manual pack confirms | `audit_events.actor_user` | With the audit log (append-only) | Admins |
| Rate-limit counters | Each AI call | Hashed key (route + user or device), never readable | Deleted after one day | Nobody |
| Daily spend | Each AI call | Per warehouse, day and provider; no person | Kept | Leads, admins |
| Customer data | Orders and returns (synthetic in the seed), notes and labels in photos | Postgres, Storage | With the record; photos as above | By role |

## What Sjekkpunkt never does

No background recording. No photos of people kept. **No statistics per worker**: insights read only views without user
or device columns, and a test fails if one appears. No emotion inference: the voice agents' sentiment analysis is turned
off in code (`lib/voice/agent-config.ts`, tested). Voice is never used to log in or recognise anyone. Every step works
with taps, so speaking is never required.

## Worker information

Shown on first launch (stations stay closed until "Jeg har lest dette") and from the "i" button on every handheld,
at `/privacy`, in every enabled language (nb, en, pl, uk, ro, lt; pl, uk, ro, lt await a native check). Its text:

> **Slik bruker Sjekkpunkt opplysninger om deg.** Sjekkpunkt kontrollerer varer, ikke folk.
> **Dette tar vi opp:** bilder av varer, bare når du trykker på kameraknappen eller ber assistenten ta bildet; tale bare
> mens du holder inne snakkeknappen, eller mens du selv har slått på håndfri modus; hvilken håndterminal som ble brukt,
> og hva som ble bestemt.
> **Dette gjør vi ikke:** ingen opptak i bakgrunnen; ingen bilder av ansikter (et bilde der et ansikt synes, slettes med
> en gang); ingen måling eller rangering av ansatte, ingen statistikk per person og ingen tolking av følelser; stemmen
> din brukes aldri til å logge inn eller kjenne deg igjen.
> **Så lenge lagrer vi det:** bilder slettes automatisk etter {dager} dager; Sjekkpunkt lagrer ikke lydopptak av deg,
> talen gjøres om til tekst av ElevenLabs, og vi lagrer bare teksten du sa som merknad; beslutninger om varer lagres så
> lenge lageret trenger dem.
> **Hvem kan du spørre:** lageret er ansvarlig for opplysningene, Sjekkpunkt og Holio behandler dem på vegne av lageret.
> Spør teamlederen din eller lagerets personvernkontakt. Du kan alltid gjøre alt med knapper, uten å snakke.

## Data residency: now and the production plan

| Service | Today (demo, synthetic data) | Production plan |
|---|---|---|
| Supabase | eu-north-1, Stockholm | Same; DPA |
| Vercel | Functions in arn1, Stockholm; static files on the global CDN | Same; DPA |
| Gemini (vision, translation) | Gemini API free tier. Google's terms let it use free-tier content to improve its products, so only synthetic data goes in | Paid tier or Vertex AI in an EU region, with no training on our data and zero data retention; DPA |
| ElevenLabs | Default (US) region; no audio recordings, transcripts 7 days | EU data residency (`api.eu.residency.elevenlabs.io`, add it to the CSP) and zero retention mode; DPA |

Before a real warehouse goes live: crop photos to the item and redact names and addresses on shipping labels before
upload, the warehouse runs a DPIA and informs workers' representatives, and a native speaker reviews the four draft
translations of the information screen.
