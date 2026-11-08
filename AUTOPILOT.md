# Autopilot rules for Sjekkpunkt (Packing Check)

Autopilot sessions read this file on top of Autopilot's shared rules. Where the two differ, this file wins.
Written 2026-11-08 with the owner, for phase Q (quality, security, the best possible demo).

## The project

- **Spec:** `docs/polish.md` (the Q steps, the definition of done, the rules for every step). Read `CLAUDE.md` (its
  "Rules that must not erode" hold in every step), `docs/plan.md` (milestones M1–M9, D1, P1) and the parts of
  `docs/sjekkpunkt-demo-brief V1.md`, `docs/sjekkpunkt-mvp-addendum.md` and `docs/decisions.md` the step touches.
  The addendum wins over the brief; `docs/decisions.md` records choices already made.
- **Test site:** https://sjekkpunkt.vercel.app, deployed by pushing to `main` (Vercel project `sjekkpunkt`). This is
  the owner's demo and test site, not a customer's production: pushing `main` is allowed. Check that it is live with
  the GitHub status command in the shared rules.
- **Checks before every push:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm scan:bundle`. A step
  that touches migrations, RLS, SQL functions or the seed also runs `pnpm test:db`. Then the e2e specs for what the
  step changed (`npx playwright test <spec>`). All must pass. After the push, CI on GitHub must be green too
  (`gh run list --limit 1`).
- **Commits:** as in `git log`: the step first, then what it does in one line («Q2 security review: …»). Then the
  step's notes in `docs/polish.md`, its row in that file's table, and the Q row in `docs/plan.md`.

## Also allowed without asking

- **The shared database.** There is one hosted Supabase project (`sjekkpunkt`), used by local runs and by the live
  site. Running the e2e and db test suites against it, locally or against the deployment, is allowed even though they
  reset and change data. **Always finish with `pnpm db:seed`** so the live demo is on seed when the step ends. Never
  run `pnpm db:seed:full`: it wipes the owner's product edits and reference photos made for the real props.
- `pnpm db:push` for new migrations, `pnpm db:users`, `pnpm voice:setup` (the only way to change the ElevenLabs
  agents), `pnpm audio:generate`, `pnpm design:tokens`.
- Paid API calls with the existing keys (Gemini, ElevenLabs) to try what the step builds: **at most 3 USD per step**
  (Q7 may use up to 8 USD to remake the demo audio and test new voices). Use fixture mode and mocked vision first; live
  voice tests (`E2E_VOICE=1`) and `E2E_REAL_VISION=1` only when the step changes voice or vision. Every call goes
  through `limitCall`/`spendGate` as the code already does; the admin cost card shows the day's spend.
- Setting or changing environment variables in the Vercel project `sjekkpunkt` when a step needs it (never print a
  secret's value into a file, a commit or the result).
- Installing pinned dev packages for tests and checks (for example `@axe-core/playwright`), with pnpm.
- Removing the merged worktrees `.claude/worktrees/ux-buildout` and `.claude/worktrees/design-system` and their local
  branches, once their commits are on `main`.

## Also off limits

- A custom domain, DNS, or other Vercel projects. Turning `DEMO_ENABLED` off on the deployment.
- Editing the ElevenLabs agents in the dashboard (only `pnpm voice:setup`). Deleting ElevenLabs agents or the knowledge
  base document.
- Editing `docs/sjekkpunkt-demo-brief V1.md` or `docs/sjekkpunkt-mvp-addendum.md` (the owner's source documents).
- Changing what the engine decides (the P and R rules, grades, refunds, thresholds) to make a test or a screen easier.
  A real bug in the engine is fixed with a test and an entry in `docs/decisions.md`.
- Weakening a guard to make something work: CSP, rate limits, spend caps, RLS, the public token route's checks, the
  zod schemas, the face discard. If a guard is in the way, the design is wrong, not the guard.
- Writing that the owner or a native speaker approved or reviewed anything.
- New features beyond what `docs/polish.md` names, and S1 stretch work (R18, Shopify import, more languages).

## Notes for every session

- The repo has untracked `.claude/` (worktrees) and `.vscode/`: never `git add -A` or `git add .`. Stage files by name.
- `AGENTS.md`: this Next.js (16.4) differs from what you know. Read the guide in `node_modules/next/dist/docs/` before
  writing Next code you are not sure of.
- Local e2e runs use a production build on :3100 (`npx playwright test`); `E2E_BASE_URL=https://sjekkpunkt.vercel.app`
  runs against the deployment. A run against the deployment changes the live demo's data: `pnpm db:seed` after.
- The `*_SHOTS=<dir>` variables in `CLAUDE.md` save screenshots from the e2e specs. Keep them in the scratchpad.
- **What waits for the owner** (list in `waiting`, never let it block): the prop test with real garments
  (`docs/test-plan.md`), native review of pl/uk/ro/lt, and production-grade providers that cost money.
- A step that does not fit one session delivers what works, writes what is left in its notes, and sets
  `"split": true` in the result.
