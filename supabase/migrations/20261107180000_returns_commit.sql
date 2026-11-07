-- M2: live returns. Atomic commit functions for the returns station.
-- API routes compute the decision with lib/engine (server rerun, R16) and hand the
-- result to these functions, which write every row in one transaction.
-- Only the server's service role may execute them.

-- "Send til teamleder" from the worker is not an engine reason, so it gets its own label.
alter table public.escalations drop constraint escalations_reason_check;
alter table public.escalations add constraint escalations_reason_check check (reason in (
  'suspicious_note','low_confidence_after_retakes','wrong_item_inconclusive','customer_caused_damage',
  'unknown_return','late_return','manual_confirm_on_alert','face_in_frame_repeated','worker_request'));

-- One inspection row per return item (worker input, translated note), updated in place.
alter table public.inspections add constraint inspections_one_per_item unique (return_item_id);

create index if not exists escalations_entity_idx on public.escalations (entity_type, entity_id, reason);

-- Opens an escalation unless an open one with the same reason already exists for the entity.
create or replace function app.open_escalation(
  p_warehouse uuid, p_entity_type text, p_entity_id uuid, p_reason text, p_summary text
) returns uuid
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.escalations
   where warehouse_id = p_warehouse and entity_type = p_entity_type
     and entity_id is not distinct from p_entity_id and reason = p_reason and status = 'open'
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.escalations (warehouse_id, entity_type, entity_id, reason, summary_nb)
  values (p_warehouse, p_entity_type, p_entity_id, p_reason, p_summary)
  returning id into v_id;
  return v_id;
end $$;

-- Sets the return's status from its items (R12: confirmed when every item has a decision).
create or replace function app.refresh_return_status(p_return uuid) returns text
language plpgsql set search_path = '' as $$
declare
  v_total int; v_decided int; v_escalated int; v_status text; v_old text;
begin
  select count(*), count(*) filter (where status = 'decided'), count(*) filter (where status = 'escalated')
    into v_total, v_decided, v_escalated
    from public.return_items where return_id = p_return;
  select status into v_old from public.returns where id = p_return;
  v_status := case
    when v_total > 0 and v_decided = v_total then 'confirmed'
    when v_escalated > 0 then 'escalated'
    else 'inspecting' end;
  update public.returns set status = v_status where id = p_return;
  return v_status;
end $$;

/*
 commit_return_item(p jsonb)
 {
   warehouse_id, return_item_id, device_id?, engine_version, received_sku,
   decision: { grade, location_code, refund_nok?, cause?, flags[] },
   stock: [{ sku, delta, reason }], confusion: [{ sku_a, sku_b, kind }],
   escalations: [{ reason, summary_nb, entity: 'return_item' | 'return' }],
   item_event: {...}, audit: { summary_nb, summary_en, ref_label, payload }
 }
*/
create or replace function public.commit_return_item(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_item public.return_items;
  v_ret public.returns;
  v_order_ext text;
  v_decision uuid;
  v_status text;
  v_device uuid := nullif(p->>'device_id', '')::uuid;
  e jsonb;
begin
  select * into v_item from public.return_items
   where id = (p->>'return_item_id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'return_item_not_found' using errcode = 'P0002'; end if;
  if v_item.status = 'decided' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  select * into v_ret from public.returns where id = v_item.return_id for update;
  select ext_id into v_order_ext from public.orders where id = v_ret.order_id;

  insert into public.decisions (warehouse_id, return_item_id, grade, location_code, refund_nok, cause, flags, engine_version)
  values (v_wh, v_item.id, p->'decision'->>'grade', p->'decision'->>'location_code',
          (p->'decision'->>'refund_nok')::int, p->'decision'->>'cause',
          coalesce(array(select jsonb_array_elements_text(p->'decision'->'flags')), '{}'),
          p->>'engine_version')
  returning id into v_decision;

  update public.return_items set received_sku = p->>'received_sku', status = 'decided' where id = v_item.id;

  for e in select * from jsonb_array_elements(coalesce(p->'stock', '[]')) loop
    insert into public.stock_adjustments (warehouse_id, sku, delta, reason, source_type, source_id)
    values (v_wh, e->>'sku', (e->>'delta')::int, e->>'reason', 'return_item', v_item.id);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p->'confusion', '[]')) loop
    insert into public.confusion_events (warehouse_id, sku_a, sku_b, kind, source_type, source_id)
    values (v_wh, e->>'sku_a', e->>'sku_b', e->>'kind', 'return_item', v_item.id);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p->'escalations', '[]')) loop
    perform app.open_escalation(v_wh,
      case when e->>'entity' = 'return' then 'return' else 'return_item' end,
      case when e->>'entity' = 'return' then v_ret.id else v_item.id end,
      e->>'reason', e->>'summary_nb');
  end loop;

  insert into public.integration_events (warehouse_id, type, payload)
  values (v_wh, 'return.item.decided', coalesce(p->'item_event', '{}'::jsonb)
          || jsonb_build_object('decisionId', v_decision));

  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_device, payload)
  values (v_wh, 'return', 'RETURN_ITEM_DECIDED', 'return_item', v_item.id, p->'audit'->>'ref_label',
          p->'audit'->>'summary_nb', p->'audit'->>'summary_en', v_device, p->'audit'->'payload');

  v_status := app.refresh_return_status(v_ret.id);

  if v_status = 'confirmed' then
    insert into public.integration_events (warehouse_id, type, payload)
    select v_wh, 'return.confirmed', jsonb_build_object(
      'retur', v_ret.ext_id, 'ordre', v_order_ext, 'returaarsak', v_ret.customer_reason_nb,
      'varer', jsonb_agg(jsonb_build_object(
        'bestiltSku', ri.ordered_sku, 'mottattSku', ri.received_sku, 'grad', d.grade,
        'lokasjon', d.location_code, 'refusjonNok', d.refund_nok, 'sannsynligAarsak', d.cause,
        'flagg', d.flags) order by ri.item_index))
    from public.return_items ri
    join lateral (select * from public.decisions x where x.return_item_id = ri.id
                  order by x.decided_at desc limit 1) d on true
    where ri.return_id = v_ret.id;

    insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                     summary_nb, summary_en, actor_device)
    values (v_wh, 'return', 'RETURN_CONFIRMED', 'return', v_ret.id, v_ret.ext_id,
            'Retur ' || v_ret.ext_id || ' bekreftet', 'Return ' || v_ret.ext_id || ' confirmed', v_device);
  end if;

  return jsonb_build_object('decisionId', v_decision, 'returnStatus', v_status);
end $$;

/*
 escalate_return_item(p jsonb)
 { warehouse_id, return_item_id, device_id?, escalations: [{ reason, summary_nb }], audit: {...} }
 Marks the item as escalated (the lead decides it in M5).
*/
create or replace function public.escalate_return_item(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_item public.return_items;
  v_status text;
  e jsonb;
  v_ids uuid[] := '{}';
begin
  select * into v_item from public.return_items
   where id = (p->>'return_item_id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'return_item_not_found' using errcode = 'P0002'; end if;
  if v_item.status = 'decided' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  update public.return_items set status = 'escalated' where id = v_item.id;
  for e in select * from jsonb_array_elements(coalesce(p->'escalations', '[]')) loop
    v_ids := v_ids || app.open_escalation(v_wh, 'return_item', v_item.id, e->>'reason', e->>'summary_nb');
  end loop;

  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_device, payload)
  values (v_wh, 'return', 'RETURN_ITEM_ESCALATED', 'return_item', v_item.id, p->'audit'->>'ref_label',
          p->'audit'->>'summary_nb', p->'audit'->>'summary_en', nullif(p->>'device_id', '')::uuid,
          p->'audit'->'payload');

  v_status := app.refresh_return_status(v_item.return_id);
  return jsonb_build_object('escalationIds', to_jsonb(v_ids), 'returnStatus', v_status);
end $$;

revoke all on function public.commit_return_item(jsonb), public.escalate_return_item(jsonb) from public, anon, authenticated;
grant execute on function public.commit_return_item(jsonb), public.escalate_return_item(jsonb) to service_role;
revoke all on function app.open_escalation(uuid, text, uuid, text, text), app.refresh_return_status(uuid) from public, anon, authenticated;
grant usage on schema app to service_role;
grant execute on function app.open_escalation(uuid, text, uuid, text, text), app.refresh_return_status(uuid) to service_role;
