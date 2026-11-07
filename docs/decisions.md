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
