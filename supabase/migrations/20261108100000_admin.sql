-- M7: admin and privacy.
-- Each admin action is one SQL function: the change and its audit row (actor_user = the admin)
-- in one transaction. Only the service role may execute them; the API routes call them after
-- authorize(['admin']) and zod validation.

-- ---------------------------------------------------------------- settings

/*
 admin_update_settings(p jsonb) { warehouse_id, user_id, values: { key: value, ... } }
 Writes only keys whose value changed. A new photo_retention_days moves the expiry of every
 stored photo (except product reference photos, which never expire) to created_at + days.
*/
create or replace function public.admin_update_settings(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_user uuid := nullif(p->>'user_id', '')::uuid;
  k text;
  v jsonb;
  v_old jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_keys text;
begin
  for k, v in select * from jsonb_each(coalesce(p->'values', '{}'::jsonb)) loop
    select value into v_old from public.settings where warehouse_id = v_wh and key = k;
    if v_old is distinct from v then
      insert into public.settings (warehouse_id, key, value) values (v_wh, k, v)
        on conflict (warehouse_id, key) do update set value = excluded.value;
      v_changed := v_changed || jsonb_build_object(k, jsonb_build_object('from', v_old, 'to', v));
    end if;
  end loop;

  if v_changed ? 'photo_retention_days' then
    update public.photos
       set expires_at = created_at + make_interval(days => (p->'values'->>'photo_retention_days')::int)
     where warehouse_id = v_wh and storage_path is not null and purpose <> 'reference';
  end if;

  if v_changed <> '{}'::jsonb then
    select string_agg(x, ', ' order by x) into v_keys from jsonb_object_keys(v_changed) x;
    insert into public.audit_events (warehouse_id, station, type, ref_type, ref_label, summary_nb, summary_en, actor_user, payload)
    values (v_wh, 'admin', 'SETTINGS_UPDATED', 'settings', v_keys,
            'Innstillinger endret: ' || v_keys, 'Settings changed: ' || v_keys, v_user,
            jsonb_build_object('changed', v_changed));
  end if;
  return jsonb_build_object('changed', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from jsonb_object_keys(v_changed) x));
end $$;

-- ---------------------------------------------------------------- products

/* A product's own shelf must be a stock location. A new code becomes a stock location. */
create or replace function app.ensure_stock_location(p_wh uuid, p_code text) returns void
language plpgsql set search_path = '' as $$
declare v_kind text;
begin
  select kind into v_kind from public.locations where code = p_code;
  if v_kind is null then
    insert into public.locations (warehouse_id, code, kind) values (p_wh, p_code, 'stock');
  elsif v_kind <> 'stock' then
    raise exception 'not_stock_location' using errcode = 'P0001';
  end if;
end $$;

/* Insert or update one product row from jsonb. Returns true when it was created. */
create or replace function app.write_product(p_wh uuid, pr jsonb, p_create boolean) returns boolean
language plpgsql set search_path = '' as $$
declare v_created boolean;
begin
  perform app.ensure_stock_location(p_wh, pr->>'location_code');
  begin
    if p_create then
      insert into public.products (warehouse_id, sku, name_nb, name_en, category, color, size, price_nok,
                                   location_code, variant_group, barcode)
      values (p_wh, pr->>'sku', pr->>'name_nb', pr->>'name_en', pr->>'category', pr->>'color', nullif(pr->>'size', ''),
              (pr->>'price_nok')::int, pr->>'location_code', nullif(pr->>'variant_group', ''), nullif(pr->>'barcode', ''))
      on conflict (sku) do update set
        name_nb = excluded.name_nb, name_en = excluded.name_en, category = excluded.category, color = excluded.color,
        size = excluded.size, price_nok = excluded.price_nok, location_code = excluded.location_code,
        variant_group = excluded.variant_group, barcode = excluded.barcode
      where public.products.warehouse_id = p_wh
      returning (xmax = 0) into v_created;
      if v_created is null then raise exception 'sku_taken' using errcode = 'P0001'; end if;
    else
      update public.products set
        name_nb = pr->>'name_nb', name_en = pr->>'name_en', category = pr->>'category', color = pr->>'color',
        size = nullif(pr->>'size', ''), price_nok = (pr->>'price_nok')::int, location_code = pr->>'location_code',
        variant_group = nullif(pr->>'variant_group', ''), barcode = nullif(pr->>'barcode', '')
      where sku = pr->>'sku' and warehouse_id = p_wh;
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
      v_created := false;
    end if;
  exception when unique_violation then
    raise exception 'barcode_taken' using errcode = 'P0001';
  end;
  return v_created;
end $$;

/*
 admin_save_product(p jsonb) { warehouse_id, user_id, mode: 'create' | 'update', product: {...} }
 Creating an existing SKU is refused (sku_exists); the import uses upsert instead.
*/
create or replace function public.admin_save_product(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_pr jsonb := p->'product';
  v_create boolean := p->>'mode' = 'create';
  v_id uuid;
begin
  if v_create and exists (select 1 from public.products where sku = v_pr->>'sku') then
    raise exception 'sku_exists' using errcode = 'P0001';
  end if;
  perform app.write_product(v_wh, v_pr, v_create);
  select id into v_id from public.products where sku = v_pr->>'sku';
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label, summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'admin', case when v_create then 'PRODUCT_CREATED' else 'PRODUCT_UPDATED' end, 'product', v_id, v_pr->>'sku',
          case when v_create then 'Ny vare: ' else 'Vare endret: ' end || (v_pr->>'sku') || ' (' || (v_pr->>'name_nb') || ')',
          case when v_create then 'Product created: ' else 'Product updated: ' end || (v_pr->>'sku'),
          nullif(p->>'user_id', '')::uuid, jsonb_build_object('product', v_pr));
  return jsonb_build_object('id', v_id, 'sku', v_pr->>'sku');
end $$;

/*
 admin_add_reference_photo(p jsonb) { warehouse_id, user_id, sku, photo_id, storage_path }
 Reference photos belong to the product and never expire (they show an item, never a person).
 At most four per product; vision sends the first one per candidate SKU.
*/
create or replace function public.admin_add_reference_photo(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_prod public.products;
begin
  select * into v_prod from public.products where sku = p->>'sku' and warehouse_id = v_wh for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(array_length(v_prod.reference_photo_paths, 1), 0) >= 4 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;
  insert into public.photos (id, warehouse_id, storage_path, purpose, entity_type, entity_id, expires_at)
  values ((p->>'photo_id')::uuid, v_wh, p->>'storage_path', 'reference', 'product', v_prod.id, null);
  update public.products set reference_photo_paths = array_append(reference_photo_paths, p->>'storage_path') where id = v_prod.id;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label, summary_nb, summary_en, actor_user)
  values (v_wh, 'admin', 'REFERENCE_PHOTO_ADDED', 'product', v_prod.id, v_prod.sku,
          'Referansebilde lagt til: ' || v_prod.sku, 'Reference photo added: ' || v_prod.sku, nullif(p->>'user_id', '')::uuid);
  return jsonb_build_object('photoId', p->>'photo_id');
end $$;

/* admin_remove_reference_photo(p jsonb) { warehouse_id, user_id, sku, photo_id } → { path } to delete from Storage. */
create or replace function public.admin_remove_reference_photo(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_prod public.products;
  v_path text;
begin
  select * into v_prod from public.products where sku = p->>'sku' and warehouse_id = v_wh for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select storage_path into v_path from public.photos
   where id = (p->>'photo_id')::uuid and entity_type = 'product' and entity_id = v_prod.id and purpose = 'reference';
  if v_path is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.products set reference_photo_paths = array_remove(reference_photo_paths, v_path) where id = v_prod.id;
  update public.photos set storage_path = null where id = (p->>'photo_id')::uuid;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_id, ref_label, summary_nb, summary_en, actor_user)
  values (v_wh, 'admin', 'REFERENCE_PHOTO_REMOVED', 'product', v_prod.id, v_prod.sku,
          'Referansebilde fjernet: ' || v_prod.sku, 'Reference photo removed: ' || v_prod.sku, nullif(p->>'user_id', '')::uuid);
  return jsonb_build_object('path', v_path);
end $$;

-- ---------------------------------------------------------------- CSV import

/*
 admin_import(p jsonb) { warehouse_id, user_id, kind, plan } — all or nothing.
 products: upsert by SKU. orders: new orders (status 'picked'); a line without a price takes the
 product's price. returns: new returns (status 'pending') against existing orders.
 The route checks SKUs, orders and duplicates first and reports them by line; the errors raised
 here are the backstop for a race.
*/
create or replace function public.admin_import(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_kind text := p->>'kind';
  v_created int := 0;
  v_updated int := 0;
  v_lines int := 0;
  e jsonb;
  l jsonb;
  v_id uuid;
  v_order uuid;
  i int;
  v_summary_nb text;
  v_summary_en text;
begin
  if v_kind = 'products' then
    for e in select * from jsonb_array_elements(p->'plan'->'products') loop
      if app.write_product(v_wh, e, true) then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    end loop;
    v_summary_nb := format('Import: %s nye varer, %s oppdatert', v_created, v_updated);
    v_summary_en := format('Import: %s products created, %s updated', v_created, v_updated);

  elsif v_kind = 'orders' then
    for e in select * from jsonb_array_elements(p->'plan'->'orders') loop
      begin
        insert into public.orders (warehouse_id, ext_id, customer_ref, status)
        values (v_wh, e->>'ext_id', e->>'customer_ref', 'picked') returning id into v_id;
      exception when unique_violation then
        raise exception 'order_exists: %', e->>'ext_id' using errcode = 'P0001';
      end;
      for l in select * from jsonb_array_elements(e->'lines') loop
        insert into public.order_lines (warehouse_id, order_id, sku, qty, price_nok)
        select v_wh, v_id, pr.sku, (l->>'qty')::int, coalesce((l->>'price_nok')::int, pr.price_nok)
          from public.products pr where pr.sku = l->>'sku' and pr.warehouse_id = v_wh;
        if not found then raise exception 'unknown_sku: %', l->>'sku' using errcode = 'P0001'; end if;
        v_lines := v_lines + 1;
      end loop;
      v_created := v_created + 1;
    end loop;
    v_summary_nb := format('Import: %s ordrer med %s linjer', v_created, v_lines);
    v_summary_en := format('Import: %s orders with %s lines', v_created, v_lines);

  elsif v_kind = 'returns' then
    for e in select * from jsonb_array_elements(p->'plan'->'returns') loop
      select id into v_order from public.orders where ext_id = e->>'order_ext_id' and warehouse_id = v_wh;
      if v_order is null then raise exception 'unknown_order: %', e->>'order_ext_id' using errcode = 'P0001'; end if;
      begin
        insert into public.returns (warehouse_id, ext_id, order_id, customer_reason_nb, registered_at, status)
        values (v_wh, e->>'ext_id', v_order, e->>'customer_reason_nb',
                coalesce((e->>'registered_at')::timestamptz, now()), 'pending') returning id into v_id;
      exception when unique_violation then
        raise exception 'return_exists: %', e->>'ext_id' using errcode = 'P0001';
      end;
      i := 0;
      for l in select * from jsonb_array_elements(e->'items') loop
        if not exists (select 1 from public.order_lines where order_id = v_order and sku = l->>'sku') then
          raise exception 'sku_not_in_order: %', l->>'sku' using errcode = 'P0001';
        end if;
        insert into public.return_items (warehouse_id, return_id, item_index, ordered_sku, qty, status)
        values (v_wh, v_id, i, l->>'sku', (l->>'qty')::int, 'pending');
        i := i + 1;
        v_lines := v_lines + 1;
      end loop;
      v_created := v_created + 1;
    end loop;
    v_summary_nb := format('Import: %s returer med %s varer', v_created, v_lines);
    v_summary_en := format('Import: %s returns with %s items', v_created, v_lines);
  else
    raise exception 'bad_kind' using errcode = 'P0001';
  end if;

  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_label, summary_nb, summary_en, actor_user, payload)
  values (v_wh, 'admin', 'CSV_IMPORT', 'import', v_kind, v_summary_nb, v_summary_en, nullif(p->>'user_id', '')::uuid,
          jsonb_build_object('kind', v_kind, 'created', v_created, 'updated', v_updated, 'lines', v_lines,
                             'file', nullif(p->>'file_name', '')));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'lines', v_lines);
end $$;

-- ---------------------------------------------------------------- photo retention

/*
 record_retention_run(p jsonb) { warehouse_id, deleted_ids: uuid[], failed: int, trigger: 'cron' | 'admin', user_id? }
 Called after the route removed the files from Storage: clears their paths and logs the run.
 The photo rows stay (the event that a photo existed), only the file and its path are gone.
*/
create or replace function public.record_retention_run(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_n int;
  v_failed int := coalesce((p->>'failed')::int, 0);
  v_admin boolean := p->>'trigger' = 'admin';
begin
  update public.photos set storage_path = null
   where warehouse_id = v_wh
     and id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p->'deleted_ids', '[]'::jsonb)) x);
  get diagnostics v_n = row_count;
  insert into public.audit_events (warehouse_id, station, type, ref_type, ref_label, summary_nb, summary_en, actor_user, payload)
  values (v_wh, case when v_admin then 'admin' else 'system' end, 'RETENTION_RUN', 'photos', p->>'trigger',
          format('Sletting: %s utløpte bilder slettet', v_n) || case when v_failed > 0 then format(', %s feilet', v_failed) else '' end,
          format('Retention: %s expired photos deleted', v_n) || case when v_failed > 0 then format(', %s failed', v_failed) else '' end,
          case when v_admin then nullif(p->>'user_id', '')::uuid end,
          jsonb_build_object('deleted', v_n, 'failed', v_failed, 'trigger', p->>'trigger'));
  return jsonb_build_object('deleted', v_n, 'failed', v_failed);
end $$;

revoke all on function public.admin_update_settings(jsonb), public.admin_save_product(jsonb),
  public.admin_add_reference_photo(jsonb), public.admin_remove_reference_photo(jsonb),
  public.admin_import(jsonb), public.record_retention_run(jsonb),
  app.ensure_stock_location(uuid, text), app.write_product(uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_settings(jsonb), public.admin_save_product(jsonb),
  public.admin_add_reference_photo(jsonb), public.admin_remove_reference_photo(jsonb),
  public.admin_import(jsonb), public.record_retention_run(jsonb) to service_role;
grant usage on schema app to service_role;
grant execute on function app.ensure_stock_location(uuid, text), app.write_product(uuid, jsonb, boolean) to service_role;
