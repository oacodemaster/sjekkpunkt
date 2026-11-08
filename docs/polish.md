# Sjekkpunkt Q: quality, security and the best possible demo

Owner request, 2026-11-08: "improve it further: security and quality, the system makes sense, and it is as good a demo
as possible". The steps below are run by Autopilot (`AUTOPILOT.md`), one per session. The status lives here and as one
row in `docs/plan.md`.

The brief and the addendum still define the product. Q makes what exists solid, coherent and convincing. It is not
a place for new features beyond what the steps below name.

## What "done" means for Q

1. Everything on `main` is deployed to https://sjekkpunkt.vercel.app, and the database matches `main`'s migrations.
2. Every e2e spec passes against the deployment, and the hosted database is back on seed afterwards.
3. A security review of the whole system, written up as findings with fixes and tests. `docs/threat-model.md`,
   `docs/privacy.md` and `docs/architecture.md` match the code.
4. A newcomer can go from the front page through `/play`, `/guide`, `/demo` and each role's area without a dead end,
   a confusing word or a screen that contradicts another one. Every page has been looked at on a phone (390 px) and
   on the projector (1440 × 900).
5. The scripted demo meets the brief's acceptance checklist (brief §13). The addendum's MVP checklist (§13) is ticked
   or each open line says why. The runbook in `docs/demo-runbook.md` lets someone who is not the builder run the demo.
6. No warning, dead code or skipped test is left without a reason written next to it.

## Rules for every Q step

- **Look at the result.** Screenshots of every changed page at 390 px and 1440 px (Playwright, saved in the scratchpad,
  never in git), and look at them yourself before you commit.
- **Fix, then prove.** Every bug or security finding that is fixed gets a test that fails without the fix, where a
  test is possible.
- **Keep the owner's choices.** `docs/decisions.md` records earlier choices. Change one only when it is wrong, and
  write a new entry saying why.
- **Drafts stay drafts.** New strings in pl, uk, ro and lt are drafts for native review. Say so in the step's notes.
  Never call them reviewed.
- **Write up** each step under its heading below ("Notes"), in the style of the milestone notes in `docs/plan.md`:
  what was built, what was found, what was left and why.

## Steps

| Step | What | State |
|---|---|---|
| Q0 | Ship P1 and verify D1 + P1 against production | Not started |
| Q1 | Merge `ux-buildout` (provider failures go tap-only) | Not started |
| Q2 | Security review of the whole system | Not started |
| Q3 | Code quality and docs that match the code | Not started |
| Q4 | Does the system make sense: every journey, every role | Not started |
| Q5 | The scripted demo at its best | Not started |
| Q6 | D1 leftovers at the stations | Not started |
| Q7 | Voices that outlive 2026-12-31 | Not started |
| Q8 | Robustness on a real handheld | Not started |
| Q9 | Final pass and demo runbook | Not started |

### Q0 Ship P1 and verify D1 + P1 against production

P1 (two commits: `83fa5cf`, `a23d0f1`) is committed on `main` but not pushed. D1 went live without the pack, returns,
lead, insights, admin and security e2e specs (they reset the shared database, and the session that built it could not
run them).

- Run the checks, push, wait until the deployment is live.
- Run every e2e spec against the deployment (`E2E_BASE_URL=https://sjekkpunkt.vercel.app`), not the opt-in voice ones.
  Fix what fails (a test that expected pre-D1 markup is fixed in the test only if the new behaviour is right).
- `pnpm db:seed` when done, so the live demo is on seed.
- Write up which specs ran and what was fixed.

**Notes.**

### Q1 Merge `ux-buildout`

Branch `ux-buildout` (commit `5d6587b`, worktree `.claude/worktrees/ux-buildout`): Gemini and ElevenLabs quota or
refusal goes tap-only like the spend cap, a `provider_status` table, a status line per provider in admin, and real
vision in deployment e2e runs only with `E2E_REAL_VISION=1`. Its migration `20261108160000_provider_status.sql`
**is already applied to the hosted database** (checked 2026-11-08 with `supabase migration list`), so `main` is behind
the database until this lands.

- Rebase onto `main` (D1 and P1 win on look and layout, as in the P1 rebase), resolve, run every check and the
  provider-failure, security and stage specs, push, verify on the deployment.
- Do not push the migration again under a new name; the file keeps its timestamp so `supabase migration list` matches.
- When merged, remove the worktree (`git worktree remove .claude/worktrees/ux-buildout`) and delete the local branch.
  Do the same for the merged `design-system` worktree and branch.
- Update `CLAUDE.md` for the new env flag, and `docs/decisions.md` if the branch carries a choice not yet written there.

**Notes.**

### Q2 Security review of the whole system

Read the code, not only the threat model. At least:

- Every route in `app/api/**`: who can call it, `guard()`/`authorize()`, zod on input and output, rate limit and
  `limitCall`/`spendGate` on every paid call, error bodies that leak nothing (no stack, no SQL, no provider message).
- Public surface: `/`, `/play`, `/guide`, `/demo`, `/privacy`, `/holio/**`, `/api/play/voice/token`. What can a
  stranger read or spend? Does the demo flag gate everything it should?
- RLS on every table and view, storage bucket policies, `security definer` functions (search_path pinned, executable
  only by the role that should), Realtime channel authorization. Use `supabase db lint` and the database advisors if
  the CLI offers them.
- Auth: session handling in `proxy.ts`, role from `profiles`, a worker who changes their own profile, the device
  cookie, logout, password rules for the test users.
- CSP and headers on every page type (including `/holio` and `/demo`), the nonce, `connect-src` per origin.
- Prompt injection: try the brief's injection note and two new variants against vision and translation (fixture mode
  first; live only within the spend limit in `AUTOPILOT.md`). Agent tool results never carry customer note text.
- Secrets: `.env.local` never in git, bundle scan, `NEXT_PUBLIC_*` holds nothing secret, Vercel env names match the
  code.
- Write findings in a new section "Q2 review (2026-11-…)" at the end of `docs/threat-model.md` as a table: finding,
  severity, fix, test. Fix high and medium in this step; low ones may be listed as accepted with a reason.

**Notes.**

### Q3 Code quality and docs that match the code

- Dead code, unused exports, files nothing imports, duplicated logic between the live, demo and play ports that
  should be shared, `any`, `@ts-ignore`, `eslint-disable` without a reason, skipped tests, TODOs.
- Errors: every `fetch` and server action has a handled failure path that the worker sees in their language.
- Accessibility: an axe pass (`@axe-core/playwright`, pinned) over every page in the e2e suite, fixed to zero serious or
  critical violations, and kept as a test.
- `docs/architecture.md`, `docs/privacy.md`, `docs/test-plan.md`, `CLAUDE.md` and `README.md` (what it is, how to
  run it, where the docs are) match the code. Remove stale lines rather than add caveats.

**Notes.**

### Q4 Does the system make sense

Walk it as four newcomers: a visitor on the front page, a packer, a returns worker, a team lead (then the admin).
Use the role test users (`pnpm db:users`). For each, write down every place you hesitate: a dead end, a word that means
two things, a button whose result surprises, a screen that disagrees with another (a grade, a status, a count), a page
with no way back, an empty state with no hint.

- Fix what is clear. Words: use one term for one thing across stations, lead, insights, Holio mock, guide and demo.
- The front page must say in one screen what Sjekkpunkt is, who it is for, and where to go (play, demo, guide, log in).
- `/guide` must match what the app does after Q0–Q3.
- List the walk and the fixes in the notes.

**Notes.**

### Q5 The scripted demo at its best

Against the brief §10 (director controls, the scripted run) and §13 (acceptance checklist), and the jury table in
brief §3:

- Run `/demo` end to end on the projector size and on a phone, timed (under 100 s), with the director keys, reset, and
  with the audio files removed (the run must not break).
- Every jury row in brief §3 has a moment in the run or on a page one click away (for example the blocked prompt
  injection, the audit trail, "no statistics per employee"). Name the moment in the notes; add it where one is missing,
  without making the run longer than 100 s.
- Readable from 5 m: captions, verdicts, the return record. Check the sizes against the design system's stage sizes.
- Polish what looks unfinished in the screenshots: alignment of boxes on the illustrations, transitions, the director
  bar, the Holio views.

**Notes.**

### Q6 D1 leftovers at the stations

D1 left these open because they need strings in six languages: grade words and caption speaker labels at the station,
«Bilde» in the step count, the shelf-plate note, the «Motorens forslag» label, order-line thumbnails (the sample photos
from `public/sample/` where a product has none). Build them with nb and en written properly and pl, uk, ro, lt as drafts
marked for native review in the string table.

**Notes.**

### Q7 Voices that outlive 2026-12-31

The premade voices River (coaches) and Daniel (lead summaries) retire on 2026-12-31. Pick replacements that speak all
six languages well (check ElevenLabs' current docs and voice library; the owner's earlier listening checks are in
`docs/decisions.md`), change them in `lib/voice/agent-config.ts` and the audio script, run `pnpm voice:setup`, delete
and remake the demo lines with `pnpm audio:generate`, and run the live voice tests (`E2E_VOICE=1`). Record the choice
and why in `docs/decisions.md`. Stay inside the step's spend limit.

**Notes.**

### Q8 Robustness on a real handheld

Emulate a mid-range Android phone (Playwright device profile, CPU throttle 4×, slow 4G):

- Time to a usable station; JavaScript per route (from `next build` output). Cut what is clearly too big.
- Camera denied, mic denied, network lost during an upload or a seal, a double tap on seal or confirm, the back button
  in the middle of a flow, a page reload mid-return. Each ends in a clear state, never a duplicate write or a stuck
  spinner. Add e2e tests for the ones that can be emulated.
- Write up what a real-device check by the owner should still cover (goes into `docs/test-plan.md`).

**Notes.**

### Q9 Final pass and demo runbook

- Every e2e spec against the deployment, `pnpm test:db`, CI green, `pnpm db:seed` after.
- `docs/demo-runbook.md`: before the demo (reset, which URLs on which screen, logins, checks of mic and camera, the
  spend caps), the run itself with the fallbacks (voice off, vision off, network gone: what to click), and the
  answers to the likely questions in brief §14 checked against what the app does now.
- Tick the brief §13 and addendum §13 checklists in this file, with the reason next to every open line.
- Update `docs/plan.md` and the "done" list above. End the run with ALL_DONE when every item that does not need the
  owner is in place.

**Notes.**

## Waiting for the owner (not blocking Q)

- The prop test in `docs/test-plan.md` with real garments and a real handheld.
- Native review of the pl, uk, ro and lt strings.
- Production-grade providers (Gemini on Vertex AI in the EU, ElevenLabs EU residency with zero retention), which cost
  money (`docs/privacy.md`).
