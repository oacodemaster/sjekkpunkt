-- M9: demo reset from /admin (addendum section 6: POST /api/admin/demo-reset, admin only, only
-- when DEMO_ENABLED=true).
--
-- The seed itself is app.reset_to_seed(), defined by supabase/seed.sql, which is generated from
-- lib/demo/seed.ts (scripts/build-seed.ts). `pnpm db:seed`, the e2e reset and this function all
-- run that same seed. Here we only wrap it the way every admin write is wrapped: one function,
-- the change and its audit row in one transaction, executable only by the service role.
--
-- security definer: the reset truncates audit_events (its trigger allows that only with
-- sjekkpunkt.allow_audit_purge, which the seed sets for its own transaction), and the service
-- role has no TRUNCATE on it.

/*
 admin_demo_reset(p jsonb) { warehouse_id, user_id }
 Returns the names of every file in the photos and audio buckets, so the route can delete them:
 after the seed no row points at any of them (the seed stores no photos and no summaries), and
 nothing else would delete them, because the retention job works from the rows. This also clears
 files left by `pnpm db:seed`, which cannot reach storage. And it returns the grading guide when
 the reset changed it, so the route can push it to the voice agents.
*/
create or replace function public.admin_demo_reset(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_user uuid := nullif(p->>'user_id', '')::uuid;
  v_photos jsonb;
  v_audio jsonb;
  v_guide_before jsonb;
  v_guide jsonb;
begin
  if v_wh is null then raise exception 'invalid_body' using errcode = 'P0001'; end if;
  if to_regprocedure('app.reset_to_seed()') is null then
    raise exception 'seed_not_loaded' using errcode = 'P0001', hint = 'run pnpm db:seed once';
  end if;

  select value into v_guide_before from public.settings where warehouse_id = v_wh and key = 'grading_guide';

  perform app.reset_to_seed();

  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_photos from storage.objects where bucket_id = 'photos';
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_audio from storage.objects where bucket_id = 'audio';

  select value into v_guide from public.settings where warehouse_id = v_wh and key = 'grading_guide';

  -- clock_timestamp: the seed's SEED_LOADED row has the transaction's now(); this one comes after it.
  insert into public.audit_events (warehouse_id, at, created_at, station, type, summary_nb, summary_en, actor_user, payload)
  values (v_wh, clock_timestamp(), clock_timestamp(), 'admin', 'DEMO_RESET', 'Demodata tilbakestilt til start', 'Demo data reset to seed', v_user,
          jsonb_build_object('photos_removed', jsonb_array_length(v_photos), 'summaries_removed', jsonb_array_length(v_audio)));

  return jsonb_build_object('photos', v_photos, 'audio', v_audio,
    'grading_guide', case when v_guide is distinct from v_guide_before then v_guide end);
end $$;

revoke all on function public.admin_demo_reset(jsonb) from public, anon, authenticated;
grant execute on function public.admin_demo_reset(jsonb) to service_role;
