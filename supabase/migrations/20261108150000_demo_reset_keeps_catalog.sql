-- M9: the demo reset keeps the catalogue. Products and shelves an admin added or edited for real
-- props, and their reference photos, survive a reset; everything else goes back to seed. The seed
-- function (generated in supabase/seed.sql) is now app.reset_to_seed(p_full boolean); only
-- `pnpm db:seed:full` passes true. admin_demo_reset deletes every stored file no kept row points at.

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
  if to_regprocedure('app.reset_to_seed(boolean)') is null then
    raise exception 'seed_not_loaded' using errcode = 'P0001', hint = 'run pnpm db:seed once';
  end if;

  select value into v_guide_before from public.settings where warehouse_id = v_wh and key = 'grading_guide';

  perform app.reset_to_seed(false); -- keeps the catalogue: products, shelves, reference photos

  -- Every photo file except the product reference photos the reset kept.
  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into v_photos
    from storage.objects o
   where o.bucket_id = 'photos'
     and not exists (select 1 from public.photos p where p.storage_path = o.name);
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
