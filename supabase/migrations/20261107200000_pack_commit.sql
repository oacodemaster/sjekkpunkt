-- M4: live packing. Barcode scans and atomic commit functions for the packing station.
-- API routes rerun lib/engine evaluatePack from stored rows (R16) and hand the result to
-- these functions, which write every row in one transaction. Only the service role may
-- execute them.

-- One row per counted barcode scan (P7). Only scans of an order line, up to its quantity,
-- are stored; the server rejects the rest. No device or user column: scans are not
-- attributed to anyone.
create table public.pack_scans (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  code text not null,
  sku text not null references public.products(sku)
);
create index on public.pack_scans (order_id);
alter table public.pack_scans enable row level security;
revoke all on public.pack_scans from anon;
revoke insert, update, delete, truncate on public.pack_scans from authenticated;
create policy pack_scans_read on public.pack_scans for select to authenticated
  using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array['packer','lead','admin'])));

create index if not exists confusion_events_source_idx on public.confusion_events (source_type, source_id);

/*
 record_pack_mismatch(p jsonb)
 {
   warehouse_id, order_id, device_id?, method ('camera' | 'barcode'), photo_id?, confidence,
   line_results, engine_version, confusion: [{ sku_a, sku_b }],
   audit: { summary_nb, summary_en, ref_label, payload }
 }
 A wrong parcel caught before sealing (P1). The order gets one MISMATCH pack check (one
 near-miss per parcel, however many photos it took to fix), and each SKU pair is counted once
 per order as a caught_at_packing confusion event. Audited when something new was recorded.
*/
create or replace function public.record_pack_mismatch(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_order public.orders;
  v_near_miss boolean := false;
  v_new_pairs int := 0;
  e jsonb;
begin
  select * into v_order from public.orders
   where id = (p->>'order_id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status <> 'picked' then raise exception 'already_sealed' using errcode = 'P0001'; end if;

  if not exists (select 1 from public.pack_checks where order_id = v_order.id and status = 'MISMATCH') then
    insert into public.pack_checks (warehouse_id, order_id, status, method, size_verified, confidence,
                                    evidence_photo_id, device_id, line_results, engine_version)
    values (v_wh, v_order.id, 'MISMATCH', coalesce(p->>'method', 'camera'), false,
            coalesce((p->>'confidence')::numeric, 0), nullif(p->>'photo_id', '')::uuid,
            nullif(p->>'device_id', '')::uuid, p->'line_results', p->>'engine_version');
    v_near_miss := true;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p->'confusion', '[]')) loop
    if not exists (
      select 1 from public.confusion_events
       where source_type = 'order' and source_id = v_order.id
         and sku_a = e->>'sku_a' and sku_b = e->>'sku_b'
    ) then
      insert into public.confusion_events (warehouse_id, sku_a, sku_b, kind, source_type, source_id)
      values (v_wh, e->>'sku_a', e->>'sku_b', 'caught_at_packing', 'order', v_order.id);
      v_new_pairs := v_new_pairs + 1;
    end if;
  end loop;

  if v_near_miss or v_new_pairs > 0 then
    insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                     summary_nb, summary_en, actor_device, payload)
    values (v_wh, 'pack', 'PACK_MISMATCH', 'order', v_order.id, p->'audit'->>'ref_label',
            p->'audit'->>'summary_nb', p->'audit'->>'summary_en', nullif(p->>'device_id', '')::uuid,
            p->'audit'->'payload');
  end if;

  return jsonb_build_object('nearMiss', v_near_miss, 'newPairs', v_new_pairs);
end $$;

/*
 commit_pack_check(p jsonb)
 {
   warehouse_id, order_id, device_id?, user_id? (manual confirm only), status ('VERIFIED' |
   'MANUAL_CONFIRM'), method, size_verified, confidence, evidence_photo_id?, manual_reason?,
   line_results, engine_version, escalations: [{ reason, summary_nb }],
   event: {...}, audit: { summary_nb, summary_en, ref_label, payload }
 }
 Seals the order: the pack check (packing evidence), order status 'packed', escalations, the
 event Holio would receive and the audit row. Sealing twice is refused.
*/
create or replace function public.commit_pack_check(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_order public.orders;
  v_check uuid;
  v_status text := p->>'status';
  e jsonb;
begin
  if v_status not in ('VERIFIED', 'MANUAL_CONFIRM') then raise exception 'not_sealable' using errcode = 'P0001'; end if;
  select * into v_order from public.orders
   where id = (p->>'order_id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status <> 'picked' then raise exception 'already_sealed' using errcode = 'P0001'; end if;

  insert into public.pack_checks (warehouse_id, order_id, status, method, size_verified, confidence,
                                  evidence_photo_id, device_id, manual_reason, line_results, engine_version)
  values (v_wh, v_order.id, v_status, p->>'method', coalesce((p->>'size_verified')::boolean, false),
          coalesce((p->>'confidence')::numeric, 0), nullif(p->>'evidence_photo_id', '')::uuid,
          nullif(p->>'device_id', '')::uuid, nullif(p->>'manual_reason', ''), p->'line_results',
          p->>'engine_version')
  returning id into v_check;

  update public.orders set status = 'packed' where id = v_order.id;

  for e in select * from jsonb_array_elements(coalesce(p->'escalations', '[]')) loop
    perform app.open_escalation(v_wh, 'order', v_order.id, e->>'reason', e->>'summary_nb');
  end loop;

  insert into public.integration_events (warehouse_id, type, payload)
  values (v_wh, case when v_status = 'VERIFIED' then 'pack.verified' else 'pack.manual_confirm' end,
          coalesce(p->'event', '{}'::jsonb) || jsonb_build_object('pakkesjekkId', v_check));

  -- actor_user only for manual confirms (addendum section 4); a verified seal is the device's.
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_device, actor_user, payload)
  values (v_wh, 'pack', case when v_status = 'VERIFIED' then 'PACK_VERIFIED' else 'PACK_MANUAL_CONFIRM' end,
          'order', v_order.id, p->'audit'->>'ref_label', p->'audit'->>'summary_nb', p->'audit'->>'summary_en',
          nullif(p->>'device_id', '')::uuid,
          case when v_status = 'MANUAL_CONFIRM' then nullif(p->>'user_id', '')::uuid end,
          p->'audit'->'payload');

  return jsonb_build_object('packCheckId', v_check, 'orderStatus', 'packed');
end $$;

revoke all on function public.record_pack_mismatch(jsonb), public.commit_pack_check(jsonb) from public, anon, authenticated;
grant execute on function public.record_pack_mismatch(jsonb), public.commit_pack_check(jsonb) to service_role;
