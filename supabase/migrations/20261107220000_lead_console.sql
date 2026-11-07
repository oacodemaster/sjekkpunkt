-- M5: the loop and the lead console.
-- 1. Auto pack alerts: every confusion event, from either station, is checked in the same
--    transaction that stores it (trigger). Mirrors lib/engine/loop.ts recordConfusion.
-- 2. Lead actions as atomic functions: resolve an escalation (approve, override, reject), decide a
--    stock adjustment, create and clear a pack alert. Each writes its audit row with actor_user
--    (approvals and overrides are the only places a person is recorded, addendum section 4).
-- 3. Live feed: audit rows are broadcast (reduced, no payload, no actor) to a private Realtime
--    channel per warehouse that only leads and admins may join.
-- Only the server's service role may execute the lead functions.

-- ---------------------------------------------------------------- pair label (engine pairLabelNb)

create or replace function app.size_rank(s text) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when s is null then 1e12
    when array_position(array['XXS','XS','S','M','L','XL','XXL','XXXL'], upper(s)) is not null
      then array_position(array['XXS','XS','S','M','L','XL','XXL','XXXL'], upper(s)) - 1
    when s ~ '^\s*-?\d+(\.\d+)?' then 100 + (substring(s from '^\s*(-?\d+(?:\.\d+)?)'))::numeric
    else 1e12 - 1
  end
$$;

/** "Skalljakke M/L", "Hettegenser marineblå/sort", or "A / B" for unrelated products. */
create or replace function app.pair_label_nb(p_a text, p_b text) returns text
language plpgsql stable set search_path = '' as $$
declare
  a public.products; b public.products; base_a text; base_b text; sep text;
begin
  select * into a from public.products where sku = p_a;
  select * into b from public.products where sku = p_b;
  if a.sku is null or b.sku is null then return p_a || ' / ' || p_b; end if;
  base_a := btrim(split_part(a.name_nb, ',', 1));
  base_b := btrim(split_part(b.name_nb, ',', 1));
  if base_a = base_b then
    if a.size is not null and b.size is not null and a.size <> b.size then
      sep := case when position('/' in a.size) > 0 or position('/' in b.size) > 0 then ' / ' else '/' end;
      if app.size_rank(a.size) <= app.size_rank(b.size) then
        return base_a || ' ' || a.size || sep || b.size;
      end if;
      return base_a || ' ' || b.size || sep || a.size;
    end if;
    return base_a || ' '
      || case when position(',' in a.name_nb) > 0 then btrim(split_part(a.name_nb, ',', 2)) else a.color end || '/'
      || case when position(',' in b.name_nb) > 0 then btrim(split_part(b.name_nb, ',', 2)) else b.color end;
  end if;
  return a.name_nb || ' / ' || b.name_nb;
end $$;

create or replace function app.setting_int(p_wh uuid, p_key text, p_default int) returns int
language sql stable set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric::int from public.settings where warehouse_id = p_wh and key = p_key), p_default)
$$;

-- ---------------------------------------------------------------- auto alerts (the loop)

/*
 Counts the pair inside the confusion window and opens a REQUIRE_LABEL_PHOTO alert when the
 threshold is reached and none is active. Serialized per pair with an advisory lock, so two
 commits at the same moment cannot both miss (or both create) the alert.
*/
create or replace function app.check_pack_alert(p_wh uuid, p_a text, p_b text) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_threshold int := app.setting_int(p_wh, 'confusion_threshold', 3);
  v_days int := app.setting_int(p_wh, 'confusion_window_days', 7);
  v_count int; v_id uuid; v_label text; v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_wh::text || '|' || p_a || '|' || p_b, 0));
  if exists (select 1 from public.pack_alerts
              where warehouse_id = p_wh and sku_a = p_a and sku_b = p_b and active) then
    return null;
  end if;
  select count(*) into v_count from public.confusion_events
   where warehouse_id = p_wh and sku_a = p_a and sku_b = p_b
     and at > now() - make_interval(days => v_days) and at <= now();
  if v_count < v_threshold then return null; end if;

  v_label := app.pair_label_nb(p_a, p_b);
  v_reason := v_label || ' forvekslet ' || v_count || ' ganger siste ' || v_days || ' dager';
  insert into public.pack_alerts (warehouse_id, sku_a, sku_b, rule, reason_nb, active, origin)
  values (p_wh, p_a, p_b, 'REQUIRE_LABEL_PHOTO', v_reason, true, 'auto')
  returning id into v_id;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label, summary_nb, summary_en, payload)
  values (p_wh, 'system', 'PACK_ALERT_CREATED', 'pack_alert', v_id, p_a || '/' || p_b,
          'Pakkevarsel: ' || v_reason,
          'Packing alert: ' || v_label || ' mixed up ' || v_count || ' times in ' || v_days || ' days',
          jsonb_build_object('origin', 'auto', 'count', v_count, 'windowDays', v_days));
  return v_id;
end $$;

create or replace function app.confusion_event_inserted() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform app.check_pack_alert(new.warehouse_id, new.sku_a, new.sku_b);
  return null;
end $$;

create trigger confusion_events_check_alert after insert on public.confusion_events
  for each row execute function app.confusion_event_inserted();

-- ---------------------------------------------------------------- shared helpers

/** The return.confirmed event and audit row, once every item of the return has a decision. */
create or replace function app.emit_return_confirmed(p_wh uuid, p_return uuid, p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare v_ret public.returns; v_order_ext text;
begin
  select * into v_ret from public.returns where id = p_return;
  select ext_id into v_order_ext from public.orders where id = v_ret.order_id;
  insert into public.integration_events (warehouse_id, type, payload)
  select p_wh, 'return.confirmed', jsonb_build_object(
    'retur', v_ret.ext_id, 'ordre', v_order_ext, 'returaarsak', v_ret.customer_reason_nb,
    'varer', jsonb_agg(jsonb_build_object(
      'bestiltSku', ri.ordered_sku, 'mottattSku', ri.received_sku, 'grad', d.grade,
      'lokasjon', d.location_code, 'refusjonNok', d.refund_nok, 'sannsynligAarsak', d.cause,
      'flagg', d.flags, 'overstyrt', d.is_override) order by ri.item_index))
  from public.return_items ri
  join lateral (select * from public.decisions x where x.return_item_id = ri.id
                order by x.decided_at desc limit 1) d on true
  where ri.return_id = v_ret.id;

  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_user)
  values (p_wh, 'lead', 'RETURN_CONFIRMED', 'return', v_ret.id, v_ret.ext_id,
          'Retur ' || v_ret.ext_id || ' bekreftet av teamleder', 'Return ' || v_ret.ext_id || ' confirmed by team lead', p_user);
end $$;

-- ---------------------------------------------------------------- escalations

/*
 resolve_escalation(p jsonb)
 {
   warehouse_id, escalation_id, user_id, action ('approve' | 'override' | 'reject'), note?,
   decision?: { return_item_id, grade, location_code, refund_nok?, cause?, flags[], engine_version,
                is_override, override_reason?, received_sku? },
   stock?: [{ sku, delta, reason }], confusion?: [{ sku_a, sku_b, kind }],   (only for an item with no decision yet)
   item_event?: {...}, audit: { summary_nb, summary_en, ref_label, payload }
 }
 The route reruns the engine and applies R15 (reason required, refund capped) before calling this.
*/
create or replace function public.resolve_escalation(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_user uuid := (p->>'user_id')::uuid;
  v_esc public.escalations;
  v_item public.return_items;
  v_was_decided boolean;
  v_old_status text;
  v_status text;
  v_decision uuid;
  d jsonb := p->'decision';
  e jsonb;
begin
  select * into v_esc from public.escalations where id = (p->>'escalation_id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'escalation_not_found' using errcode = 'P0002'; end if;
  if v_esc.status <> 'open' then raise exception 'already_resolved' using errcode = 'P0001'; end if;

  if d is not null and jsonb_typeof(d) = 'object' then
    if v_esc.entity_type <> 'return_item' or v_esc.entity_id is distinct from (d->>'return_item_id')::uuid then
      raise exception 'wrong_entity' using errcode = 'P0001';
    end if;
    select * into v_item from public.return_items where id = v_esc.entity_id and warehouse_id = v_wh for update;
    if not found then raise exception 'return_item_not_found' using errcode = 'P0002'; end if;
    v_was_decided := v_item.status = 'decided';
    select status into v_old_status from public.returns where id = v_item.return_id for update;

    insert into public.decisions (warehouse_id, return_item_id, grade, location_code, refund_nok, cause, flags,
                                  engine_version, is_override, override_reason, decided_by)
    values (v_wh, v_item.id, d->>'grade', d->>'location_code', (d->>'refund_nok')::int, d->>'cause',
            coalesce(array(select jsonb_array_elements_text(d->'flags')), '{}'), d->>'engine_version',
            coalesce((d->>'is_override')::boolean, false), nullif(d->>'override_reason', ''), v_user)
    returning id into v_decision;

    update public.return_items
       set status = 'decided', received_sku = coalesce(d->>'received_sku', received_sku)
     where id = v_item.id;

    if not v_was_decided then
      for e in select * from jsonb_array_elements(coalesce(p->'stock', '[]')) loop
        insert into public.stock_adjustments (warehouse_id, sku, delta, reason, source_type, source_id)
        values (v_wh, e->>'sku', (e->>'delta')::int, e->>'reason', 'return_item', v_item.id);
      end loop;
      for e in select * from jsonb_array_elements(coalesce(p->'confusion', '[]')) loop
        insert into public.confusion_events (warehouse_id, sku_a, sku_b, kind, source_type, source_id)
        values (v_wh, e->>'sku_a', e->>'sku_b', e->>'kind', 'return_item', v_item.id);
      end loop;
    end if;

    insert into public.integration_events (warehouse_id, type, payload)
    values (v_wh, 'return.item.decided', coalesce(p->'item_event', '{}'::jsonb) || jsonb_build_object('decisionId', v_decision));

    v_status := app.refresh_return_status(v_item.return_id);
    if v_status = 'confirmed' and v_old_status <> 'confirmed' then
      perform app.emit_return_confirmed(v_wh, v_item.return_id, v_user);
    end if;
  end if;

  update public.escalations
     set status = 'resolved', resolved_by = v_user, resolved_at = now(),
         resolution = coalesce(resolution, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'action', p->>'action', 'note', nullif(p->>'note', ''), 'decisionId', v_decision,
           'grade', d->>'grade', 'locationCode', d->>'location_code', 'refundNok', (d->>'refund_nok')::int,
           'isOverride', (d->>'is_override')::boolean))
   where id = v_esc.id;

  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'lead',
          case p->>'action' when 'override' then 'ESCALATION_OVERRIDDEN' when 'reject' then 'ESCALATION_REJECTED' else 'ESCALATION_APPROVED' end,
          'escalation', v_esc.id, p->'audit'->>'ref_label', p->'audit'->>'summary_nb', p->'audit'->>'summary_en',
          v_user, p->'audit'->'payload');

  return jsonb_strip_nulls(jsonb_build_object('decisionId', v_decision, 'returnStatus', v_status));
end $$;

-- ---------------------------------------------------------------- stock adjustments

/* decide_stock_adjustment(p jsonb) { warehouse_id, id, user_id, decision ('approved' | 'rejected'), event, audit } */
create or replace function public.decide_stock_adjustment(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_user uuid := (p->>'user_id')::uuid;
  v_adj public.stock_adjustments;
  v_decision text := p->>'decision';
begin
  if v_decision not in ('approved', 'rejected') then raise exception 'bad_decision' using errcode = 'P0001'; end if;
  select * into v_adj from public.stock_adjustments where id = (p->>'id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'adjustment_not_found' using errcode = 'P0002'; end if;
  if v_adj.status <> 'proposed' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  update public.stock_adjustments set status = v_decision, decided_by = v_user, decided_at = now() where id = v_adj.id;
  if v_decision = 'approved' then
    insert into public.integration_events (warehouse_id, type, payload)
    values (v_wh, 'stock.adjustment.approved', coalesce(p->'event', '{}'::jsonb) || jsonb_build_object('lagerjusteringId', v_adj.id));
  end if;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'lead', case when v_decision = 'approved' then 'STOCK_ADJUSTMENT_APPROVED' else 'STOCK_ADJUSTMENT_REJECTED' end,
          'stock_adjustment', v_adj.id, v_adj.sku, p->'audit'->>'summary_nb', p->'audit'->>'summary_en', v_user,
          jsonb_build_object('sku', v_adj.sku, 'delta', v_adj.delta, 'reason', v_adj.reason));
  return jsonb_build_object('status', v_decision);
end $$;

-- ---------------------------------------------------------------- pack alerts

/* create_manual_alert(p jsonb) { warehouse_id, sku_a, sku_b (sorted), reason_nb, user_id, audit } */
create or replace function public.create_manual_alert(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_wh::text || '|' || (p->>'sku_a') || '|' || (p->>'sku_b'), 0));
  if exists (select 1 from public.pack_alerts where warehouse_id = v_wh and sku_a = p->>'sku_a' and sku_b = p->>'sku_b' and active) then
    raise exception 'already_active' using errcode = 'P0001';
  end if;
  insert into public.pack_alerts (warehouse_id, sku_a, sku_b, rule, reason_nb, active, origin)
  values (v_wh, p->>'sku_a', p->>'sku_b', 'REQUIRE_LABEL_PHOTO', p->>'reason_nb', true, 'manual')
  returning id into v_id;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'lead', 'PACK_ALERT_CREATED', 'pack_alert', v_id, (p->>'sku_a') || '/' || (p->>'sku_b'),
          p->'audit'->>'summary_nb', p->'audit'->>'summary_en', (p->>'user_id')::uuid, jsonb_build_object('origin', 'manual'));
  return jsonb_build_object('id', v_id);
end $$;

/* clear_pack_alert(p jsonb) { warehouse_id, id, user_id, audit } */
create or replace function public.clear_pack_alert(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_alert public.pack_alerts;
begin
  select * into v_alert from public.pack_alerts where id = (p->>'id')::uuid and warehouse_id = v_wh for update;
  if not found then raise exception 'alert_not_found' using errcode = 'P0002'; end if;
  if not v_alert.active then raise exception 'already_cleared' using errcode = 'P0001'; end if;
  update public.pack_alerts set active = false, cleared_by = (p->>'user_id')::uuid, cleared_at = now() where id = v_alert.id;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label,
                                   summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'lead', 'PACK_ALERT_CLEARED', 'pack_alert', v_alert.id, v_alert.sku_a || '/' || v_alert.sku_b,
          p->'audit'->>'summary_nb', p->'audit'->>'summary_en', (p->>'user_id')::uuid,
          jsonb_build_object('origin', v_alert.origin));
  return jsonb_build_object('id', v_alert.id);
end $$;

-- ---------------------------------------------------------------- live feed (Realtime)

/*
 Every audit row goes to the private channel feed:<warehouse_id> as a reduced message: no payload,
 no device, no user. Broadcast problems never block a commit.
*/
create or replace function app.audit_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'at', new.at, 'station', new.station, 'type', new.type,
                         'ref_label', new.ref_label, 'summary_nb', new.summary_nb, 'summary_en', new.summary_en),
      'audit',
      'feed:' || new.warehouse_id::text,
      true);
  exception when others then
    null;
  end;
  return null;
end $$;

create trigger audit_events_broadcast after insert on public.audit_events
  for each row execute function app.audit_broadcast();

-- Only leads and admins of the warehouse may join its feed channel.
create policy sjekkpunkt_lead_feed on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and (select app.has_role(array['lead','admin']))
    and (select realtime.topic()) = 'feed:' || (select app.user_warehouse())::text
  );

-- ---------------------------------------------------------------- grants

revoke all on function public.resolve_escalation(jsonb), public.decide_stock_adjustment(jsonb),
  public.create_manual_alert(jsonb), public.clear_pack_alert(jsonb) from public, anon, authenticated;
grant execute on function public.resolve_escalation(jsonb), public.decide_stock_adjustment(jsonb),
  public.create_manual_alert(jsonb), public.clear_pack_alert(jsonb) to service_role;

revoke all on function app.size_rank(text), app.pair_label_nb(text, text), app.setting_int(uuid, text, int),
  app.check_pack_alert(uuid, text, text), app.confusion_event_inserted(), app.emit_return_confirmed(uuid, uuid, uuid),
  app.audit_broadcast() from public, anon, authenticated;
grant execute on function app.size_rank(text), app.pair_label_nb(text, text), app.setting_int(uuid, text, int),
  app.check_pack_alert(uuid, text, text), app.confusion_event_inserted(), app.emit_return_confirmed(uuid, uuid, uuid)
  to service_role;
