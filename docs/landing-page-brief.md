# Brief: the Sjekkpunkt landing page

Owner request, 2026-11-09. This brief is the prompt for the session(s) that build it. Read all of it before you
start, then follow the checkpoints at the end.

## 1. Where things stand

Sjekkpunkt is a warehouse handheld app: a camera and voice check at the packing bench and at the returns bench. It was
built for a contest (M1 to M9 and D1 live by 2026-11-08). The contest is over. On 2026-11-09 the owner closed the
public demo to stop API spend: in Vercel production `DEMO_ENABLED=false` and `NEXT_PUBLIC_DEMO_ENABLED=false`, so
`/play`, `/demo`, the public voice token route and the one-tap sign-in on `/login` are all off.

The next step is to turn Sjekkpunkt into something people can buy, and to use it as a reference project for Forsterk
(forsterk.no, the owner's agency). The landing page is the first piece. It must:

1. Explain clearly, within five seconds, what Sjekkpunkt is, who it is for and what it gets them.
2. Speak to the buyer in their own words, in world-class Norwegian (bokmål) first, with a full English version.
3. Look world class: on par with the best product sites in software, built on the Sjekkpunkt design system.
4. Let the visitor try it: a simple scripted interactive demo further down the page, plus a longer explainer video.
5. End in a good form where a prospect asks for more information or a pilot.
6. Credit Forsterk ("Laget av Forsterk" / "Built by Forsterk", linking to https://forsterk.no).
7. Cost nothing per visitor. No paid API call may happen anywhere on the landing page, for humans or bots.

## 2. Read first

- `CLAUDE.md` and `AGENTS.md` (repo rules; this Next.js differs from your training data, read
  `node_modules/next/dist/docs/` for anything you touch).
- The workspace `../CLAUDE.md` (how to check that a Vercel deploy is live).
- `docs/sjekkpunkt-demo-brief V1.md` and `docs/sjekkpunkt-mvp-addendum.md`: what the product actually does. Every claim
  on the page must be true of the product as built. Check the app itself when unsure.
- `docs/decisions.md`: the section «The Sjekkpunkt design system in the app», and the 2026-11-08 entry on the hero
  video.
- `docs/polish.md` and `docs/plan.md` for status and conventions.
- `app/page.tsx`, `components/hero-video.tsx`, `components/public-header.tsx`, `app/guide/page.tsx`,
  `components/demo/demo-stage.tsx`, `app/demo/`, `lib/i18n/`, `app/ui.css`, `app/tokens.css`, `design/tokens.json`,
  `components/ui/`.
- `docs/generated-images.md` (how the existing images were made with Media Master; match that style).
- `lib/limits/server.ts` and `lib/limits/policy.ts` (the pattern for public, rate-limited routes).
- `../forsterk/lib/email/resend.ts` and `../forsterk/lib/contact/submit.ts` (how forsterk.no sends form email).

## 3. Hard rules

### No em dashes, anywhere, ever

The project must never contain an em dash (the character U+2014). That covers UI copy, code, comments, SQL, config, docs,
test names, commit messages, image prompts, video captions and voiceover scripts.

- Clean the existing ones first. `git grep -I -l $'\u2014'` lists about 18 text files today (UI pages, components,
  SQL migration, `supabase/config.toml`, `docs/threat-model.md`, `AGENTS.md`, `lib/i18n/play-strings.ts` and others).
  Rewrite each sentence properly (a comma, colon, full stop or parentheses), do not just swap the character. Where an em dash
  is a placeholder for an empty value in the UI, use an en dash "–" or a word ("Ingen" / "None").
- `AGENTS.md` is rewritten by `next dev`. Check `node_modules/next/dist/server/lib/generate-agent-files.js`; if the em
  dash comes from there, the guard below must exclude `AGENTS.md`, and note why in `docs/decisions.md`.
- Do not fix an applied SQL migration in a way that changes its meaning; editing a comment is fine.
- Add a guard so it cannot come back: a unit test (or a `pnpm` script run in CI) that fails when any tracked text
  file contains U+2014, with a clear message naming file and line. Also do not use "--" or " - " as a stand-in dash
  in copy.

### Project rules that apply here (from `CLAUDE.md`)

- Colours only from tokens. The lime `brand` only on dark pages and inside the mark. Status is colour + icon + word.
  New components go in `components/ui/` on the `sp-` classes.
- CSP: scripts only from this origin plus the nonce. No new third-party scripts, fonts or embeds (no YouTube, no
  analytics tags, no form services). Anything external goes through the server.
- Every paid AI call goes through `limitCall` / `spendGate`. The landing page makes none.
- `/demo` (scripted) must keep working. `/play` voice and the one-tap sign-in stay off in production.
- Log every non-obvious choice in `docs/decisions.md`, and every Media Master image in `docs/generated-images.md`.

### Free versus paid demo

Today one pair of flags gates both free and paid things. Split them:

- Scripted pieces that cost nothing (the landing page demo, `/demo`) are on regardless of `DEMO_ENABLED`. If a flag is
  wanted, use a separate one that defaults to on.
- Anything that can cost money or needs no password (the `/play` voice token, one-tap sign-in, demo reset) stays behind
  `DEMO_ENABLED`, which stays `false` in production.
- Check `/play` without voice: if it makes no paid call, it may be linked; if it can make any paid call, leave it off.
- Prove it: a Playwright test that loads the landing page, plays the whole interactive demo and asserts that no request
  went to `/api/vision`, `/api/voice`, `/api/tts`, `/api/translate`, `/api/play`, `elevenlabs.io` or any Google AI
  host.

## 4. Who the page is for

**Primary reader:** the person responsible for the warehouse floor at a Norwegian online shop with its own warehouse,
or at a third-party logistics firm (3PL). Titles: lagersjef, driftssjef, logistikksjef, head of operations. Roughly 50
to 2,000 orders a day. Often clothing, sport, outdoor, beauty, home: many sizes and colours that look alike.

**Second reader:** the owner or daglig leder of the shop, who cares about cost, customer reviews and returns.

**What keeps them up at night (verify and sharpen these, do not invent):**

- Wrong item, size or colour shipped: a return, a reshipment, a refund, an angry review, a support ticket.
- Peak season with temporary staff who are new, rushed and do not all speak Norwegian.
- Training takes time and people leave.
- The returns bench: slow, inconsistent grading, items put back to stock that should not be, no photos when a
  customer disputes the outcome.
- No overview: the team lead learns about problems from customer complaints, weeks later.

**What Sjekkpunkt does for them (confirm each against the product):**

- At packing: scan the order, show the open box to the camera, and Sjekkpunkt checks the items against the order
  before the box is sealed. Wrong or missing item: it says what is wrong, in the worker's language, by voice and on
  screen. Right: seal it.
- At returns: photos and a consistent grading guide decide restock, B-stock or reject, and the photos are kept as proof.
- For the team lead: alerts when the same mistake repeats, and an overview of what goes wrong and where.
- Works in the browser on handheld devices (check which devices and what hardware is actually required). Voice is
  optional; every step also has a button. Many languages for the worker.
- Privacy by design: the insights hold no user or device columns; no faces in photos (check `docs/privacy.md` and say
  only what is true).

**Stage, honestly:** the product is ready for a pilot, not proven in production. No invented numbers, customer logos,
testimonials or "trusted by" rows. Industry figures (for example the share of returns caused by wrong items, or the
cost of a return) only with a named, linked source you have actually read; otherwise leave them out. Example numbers
must be labelled as examples.

## 5. Copywriting

World class means: a buyer reads the headline and thinks "that is my problem", reads the next line and knows exactly
what the product does, and never meets a word they would not say themselves.

- Write in Norwegian bokmål first, natively, not translated. Then write the English version natively too (not a
  word-for-word translation). Other app languages may fall back to English on this page; decide and log it.
- Lead with the outcome for the customer, then the mechanism. "Feil vare stoppes før esken tapes igjen" beats
  "AI-drevet bildegjenkjenning".
- Concrete scenes from the floor: the size M hoodie that should have been size L, the temp worker on day two, the box
  that comes back.
- Short sentences, plain words, active verbs. One idea per section.
- Banned words and phrases (both languages): revolusjonerende, banebrytende, sømløs, innovativ, neste generasjon,
  "løsning" used as a noun for the product, "AI-drevet" in headlines, game-changer, seamless, cutting-edge,
  leverage, unlock, empower, "in today's fast-paced world". No em dashes.
- The page must answer the buyer's objections in their words: Do we need new hardware? Does it slow packing down? Our
  staff speak many languages. What about privacy and the rules on monitoring employees? Does it work with our order
  system? What happens if the camera gets it wrong? What does it cost? Answer honestly; where the answer is "we set
  that up together in a pilot", say so.
- The pilot offer: draft what a pilot looks like (length, scope, what the customer provides, what we do, what it
  costs or "no cost for the first N weeks"). Mark it as a draft for the owner to approve. Do not publish an offer the
  owner has not approved.

Write the copy in `docs/landing-copy.md` before building: audience, the one-sentence promise, the main pains, proof
points, objections and answers, and then the full page copy section by section in nb and en. Then critique it
against this section, rewrite, and only then build.

## 6. Page structure (a starting point; improve it if you can argue why)

1. **Header:** the mark, language switcher, "Logg inn" (small, for existing users), primary button to the form.
2. **Hero:** headline (the outcome), one line that says what it is and for whom, primary CTA "Få mer informasjon" /
   "Be om en pilot" (scrolls to the form), secondary CTA "Se hvordan det virker" (scrolls to the demo). Visual: the
   existing 25 s hero video, a new cut, or a Blender render of the handheld at the bench. Pick the strongest and
   argue it in `docs/decisions.md`.
3. **The problem:** what a wrong shipment and a slow returns bench cost, in concrete terms.
4. **How it works:** packing in three steps, returns in three steps, the team lead view. Real app screens, not
   abstract illustrations.
5. **Try it:** the scripted interactive demo (section 7).
6. **Watch it:** the longer explainer video (section 8).
7. **Built for a real warehouse floor:** languages, voice optional with buttons, devices, speed, privacy, security.
8. **Questions:** the objections as an accordion (accessible, works without JavaScript if feasible).
9. **The pilot:** what it looks like (owner-approved text only).
10. **The form** (section 9).
11. **Footer:** "Laget av Forsterk" linking to forsterk.no, privacy page, contact email, sign in.

## 7. The interactive demo on the page

- Reuse `components/demo/demo-stage.tsx` and the scripted audio in `public/audio`. Build a compact embed that runs one
  packing check end to end: the order appears, the box is shown, the wrong size is caught, it is fixed, green check,
  seal. If it stays simple, add a second tab for one return.
- The visitor taps through it (or it advances with a clear "Next"). It never autoplays sound; sound starts only after
  the visitor turns it on. Respect `prefers-reduced-motion`.
- Keyboard accessible, screen-reader labels, works from 360 px wide. Lazy-loaded so it does not slow the hero.
- Zero paid calls (see the test in section 3). It must work in production with `DEMO_ENABLED=false`.
- Link to the full `/demo` for those who want more.

## 8. The explainer video

- 60 to 90 seconds, 16:9, Norwegian voiceover, burned-in Norwegian captions plus an English subtitle track (WebVTT).
  Also export a 1:1 or 9:16 cut of 20 to 30 seconds for LinkedIn and outreach.
- Story: the problem on the floor, the packing check, a wrong item caught, the returns bench, the team lead view, the
  pilot offer. End card with the URL.
- Build it from real app footage (record the scripted demo with Playwright, as the hero video was), Blender shots and
  Media Master stills. Use the `/brag` skill if your session has it (it made `public/video/sjekkpunkt.mp4`; its working
  folder `brag-output/` stays local and git-excluded). Otherwise build it with Playwright recording + ffmpeg.
- Voiceover with ElevenLabs through a one-off script (like `pnpm audio:generate`: generate once, keep the file). It
  uses credits once; note the cost in `docs/decisions.md`. Music: synthesised or clearly licensed for commercial use.
- Self-hosted in `public/video/` with a poster image, `preload="none"`, native controls, captions track. Keep files
  small (explainer under about 15 MB, short cut under about 5 MB, H.264 + a WebM or AV1 if it saves much).

## 9. The form ("Få mer informasjon")

- Fields: name, work email, company (required); role (select), orders per day (select ranges), interest (packing,
  returns, both), message (optional). Keep it short and friendly; each field labelled, inline errors in nb and en.
- A plain consent line linking to the privacy page.
- Server side: a route handler or server action with zod validation; a honeypot field and a minimum time-to-submit;
  rate limits per visitor (hashed IP) and in total through `api_gate`, failing closed, like `limitQuickSignIn`.
- Store submissions in a new `leads` table (migration). RLS on, no access for `anon` or `authenticated`; inserts
  through one SQL function executable only by the service role. Leads never appear in `insights_*` views.
- Email the owner on every new lead through Resend, following `../forsterk/lib/email/resend.ts` (server-side `fetch`
  to the Resend API, so no CSP change). Env: `RESEND_API_KEY`, `LEADS_NOTIFY_TO` (default `odin@reachamplified.com`),
  sender on a domain already verified in Resend (check which one forsterk.no uses). If the key is missing or Resend
  fails, the lead is still stored and the visitor still sees success; log the failure. Optionally send the visitor a
  short confirmation email.
- Success state on the page that says what happens next and when.
- A read-only list of leads in `/admin` (admin role only) is welcome if it stays small.
- Privacy: update `/privacy` (nb and en) with what the form collects, why, how long it is kept, and how to ask for
  deletion. Add leads to the retention job (`app/api/cron/retention`) with a retention period you propose and log.
- Tests: validation unit tests; `pnpm test:db` cases proving anon and authenticated cannot read or insert leads; e2e
  for the happy path, the honeypot and the rate limit (no real email sent in tests).
- New env vars go into Vercel production as Sensitive. Ask the owner for `RESEND_API_KEY` if you cannot find it in
  the forsterk Vercel project (`vercel env ls` from `../forsterk`); never print secrets.

## 10. Visual assets

- **Real screens first.** Use the screenshot hooks (`PACK_SHOTS`, `DEMO_SHOTS`, `LEAD_SHOTS`, and so on) to capture
  clean app screens with seed data, and present them in device frames.
- **Media Master** (`../Media Master`, `npm start`, then `POST http://localhost:4400/api/generate`; see
  `docs/generated-images.md` for model and settings). Use it for scenes from the warehouse floor and an Open Graph
  image. Keep the rules: no readable text, no logos, no brand names, no faces. Convert to WebP or AVIF at the size
  used. Log every generation.
- **Blender** (`/opt/homebrew/bin/blender`, run headless: `blender -b -P script.py`). Use it where 3D beats a photo: a
  rugged handheld with the real app screen as its texture, the box on the bench, a slow camera move for the hero or the
  video. Keep the Python scripts in `design/3d/` so renders can be remade; keep `.blend` files out of git if they are
  large. Match the design tokens' colours and the lighting of the Media Master scenes.
- Use 3D and generated images only where they make the page clearer or more convincing. Real product screens beat
  decoration.

## 11. The design bar

- Built on the Sjekkpunkt design system: tokens, `sp-` components, the dark front page where the lime brand is
  allowed. Read the design-system section in `docs/decisions.md` before you design anything.
- Quality bar: the best software product sites (think of the clarity of Linear, Stripe or Vercel). Use them as a bar
  for craft, not as something to copy: strong type hierarchy, generous space, one accent, real product imagery,
  restrained motion that explains something.
- Mobile first: flawless at 360, 390, 768, 1024, 1440 and 1920 px. No horizontal scroll.
- Performance: LCP under 2.0 s on a mid-range phone over 4G, CLS under 0.05, Lighthouse 95+ in every category on
  mobile. Hero media must not block the headline.
- Accessibility: WCAG 2.2 AA. Contrast, focus states, keyboard, reduced motion, captions, alt text, form errors that
  screen readers announce.
- SEO: title and description in nb and en, Open Graph and Twitter images (1200x630), JSON-LD (`SoftwareApplication`
  and `Organization` for Forsterk), canonical URL and `hreflang` if the languages have their own URLs, sitemap and
  robots that index the landing page and keep the app pages out.
- Review loop: after each build pass, take screenshots at 390, 768 and 1440 px, critique every section against this
  brief (clarity, hierarchy, copy, spacing, consistency), fix, and repeat at least twice before calling it done. Read
  the page as a stressed lagersjef on a phone between two tasks: is it clear in five seconds?

## 12. Checkpoints (stop and report to the owner at each)

1. **Copy and direction.** `docs/landing-copy.md` (nb and en, including the draft pilot offer), the section outline,
   and the visual direction (a quick prototype or two or three screenshots of the hero and one section). Also the em
   dash cleanup and its guard, done and committed. Stop for approval.
2. **The page.** Page, interactive demo, form with storage and email, privacy update, tests green, the "no paid calls"
   test green. Deployed and verified live. Stop for review.
3. **Media.** Final images, Blender renders, the explainer video and the short cut, wired into the page. Deployed and
   verified live. Stop for review.

At every checkpoint: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db` (if the schema changed), the relevant
Playwright specs, `pnpm build` and `pnpm scan:bundle`; small commits with clear messages (no em dashes); push to
`main`; check the deploy with the `gh api .../status` command from the workspace `CLAUDE.md`; then open the live page
and check it at phone and desktop width. Update `docs/plan.md` with a row for this work and log decisions in
`docs/decisions.md`.

## 13. Done means

- [ ] A buyer understands what Sjekkpunkt is, for whom and why, within five seconds of landing, in nb and in en.
- [ ] Every claim on the page is true of the product; no invented numbers, logos or testimonials.
- [ ] The interactive demo works in production with `DEMO_ENABLED=false`, and a test proves it makes no paid call.
- [ ] The explainer video and the short cut are live, captioned, and small enough.
- [ ] The form stores leads safely, emails the owner, and is rate limited; privacy page and retention updated.
- [ ] Lighthouse 95+ on mobile in every category; WCAG 2.2 AA; flawless from 360 to 1920 px.
- [ ] Zero em dashes in the repo, and a guard in CI that keeps it that way.
- [ ] "Laget av Forsterk" credit links to forsterk.no.
- [ ] Decisions, generated images and plan status are logged.
