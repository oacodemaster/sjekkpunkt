-- Sjekkpunkt schema (addendum section 4).
-- Every table carries id, warehouse_id and created_at. Workers read through RLS and
-- write only through API routes (server, service role). audit_events is append-only.

create schema if not exists app;

-- ---------------------------------------------------------------- tables

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('packer','returns','lead','admin')),
  preferred_lang text not null default 'nb' check (preferred_lang in ('nb','en','pl','uk','ro','lt')),
  display_name text,
  privacy_info_read_at timestamptz
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  label text not null unique
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  code text not null unique,
  kind text not null check (kind in ('stock','outlet','repair','scrap'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  sku text not null unique,
  name_nb text not null,
  name_en text not null,
  category text not null check (category in ('apparel','accessory')),
  color text not null,
  size text,
  price_nok int not null check (price_nok >= 0),
  location_code text not null references public.locations(code),
  variant_group text,
  barcode text unique,
  reference_photo_paths text[] not null default '{}'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  ext_id text not null unique,
  customer_ref text not null,
  status text not null check (status in ('picked','packed','shipped','returned_partial')),
  shipped_at timestamptz
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null references public.products(sku),
  qty int not null check (qty > 0),
  price_nok int not null check (price_nok >= 0)
);
create index on public.order_lines (order_id);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  storage_path text,                       -- null once deleted (face discard, retention)
  purpose text not null check (purpose in ('pack_check','label_closeup','front','label','damage','customer_note','packaging','customer_portal','reference')),
  entity_type text not null check (entity_type in ('order','return_item','return','product')),
  entity_id uuid not null,
  faces_discarded boolean not null default false,
  expires_at timestamptz
);
create index on public.photos (entity_type, entity_id);
create index on public.photos (expires_at) where storage_path is not null;

create table public.vision_results (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  photo_id uuid references public.photos(id) on delete set null,
  purpose text not null,
  model text not null,
  latency_ms int,
  schema_valid boolean not null,
  output jsonb
);
create index on public.vision_results (photo_id);

create table public.pack_checks (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('VERIFIED','MISMATCH','NEEDS_LABEL_PHOTO','MANUAL_CONFIRM')),
  method text not null check (method in ('camera','barcode','manual')),
  size_verified boolean not null default false,
  confidence numeric(4,3) not null default 0,
  evidence_photo_id uuid references public.photos(id) on delete set null,
  photo_ref text,                         -- demo/seed illustration name
  device_id uuid references public.devices(id),
  manual_reason text check (manual_reason in ('polybag','glare','other')),
  line_results jsonb,
  engine_version text,
  check (method <> 'manual' or manual_reason is not null or engine_version = 'seed')
);
create index on public.pack_checks (order_id, created_at desc);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  ext_id text not null unique,
  order_id uuid references public.orders(id),
  customer_reason_nb text,
  registered_at timestamptz,
  customer_photo_id uuid references public.photos(id) on delete set null,
  status text not null check (status in ('pending','inspecting','awaiting_confirm','confirmed','escalated'))
);
create index on public.returns (order_id);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  return_id uuid not null references public.returns(id) on delete cascade,
  item_index int not null default 0,
  ordered_sku text not null references public.products(sku),
  received_sku text references public.products(sku),
  qty int not null default 1 check (qty > 0),
  status text not null default 'pending' check (status in ('pending','inspecting','decided','escalated')),
  unique (return_id, item_index)
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  return_item_id uuid not null references public.return_items(id) on delete cascade,
  condition jsonb,
  worker_note_original text,
  worker_note_lang text,
  worker_note_nb text,
  customer_note_text text,
  suspicious_note boolean not null default false
);
create index on public.inspections (return_item_id);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  return_item_id uuid not null references public.return_items(id) on delete cascade,
  grade text not null check (grade in ('A','B','C','D')),
  location_code text not null references public.locations(code),
  refund_nok int check (refund_nok >= 0),
  cause text check (cause in ('likely_warehouse_error','inconclusive','unknown','customer_side','transit_damage')),
  flags text[] not null default '{}',
  engine_version text not null,
  is_override boolean not null default false,
  override_reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz not null default now(),
  check (not is_override or (override_reason is not null and length(trim(override_reason)) > 0))
);
create index on public.decisions (return_item_id, decided_at desc);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  sku text not null references public.products(sku),
  delta int not null check (delta <> 0),
  reason text not null,
  source_type text not null,
  source_id uuid,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz
);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid,
  reason text not null check (reason in ('suspicious_note','low_confidence_after_retakes','wrong_item_inconclusive','customer_caused_damage','unknown_return','late_return','manual_confirm_on_alert','face_in_frame_repeated')),
  summary_nb text,
  summary_audio_path text,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution jsonb,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);
create index on public.escalations (status, created_at desc);

create table public.confusion_events (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  sku_a text not null references public.products(sku),
  sku_b text not null references public.products(sku),
  kind text not null check (kind in ('caught_at_packing','found_at_returns')),
  source_type text,
  source_id uuid,
  at timestamptz not null default now(),
  check (sku_a < sku_b)
);
create index on public.confusion_events (sku_a, sku_b, at desc);

create table public.pack_alerts (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  sku_a text not null references public.products(sku),
  sku_b text not null references public.products(sku),
  rule text not null default 'REQUIRE_LABEL_PHOTO' check (rule in ('REQUIRE_LABEL_PHOTO')),
  reason_nb text not null,
  active boolean not null default true,
  origin text not null check (origin in ('auto','manual')),
  cleared_by uuid references auth.users(id),
  cleared_at timestamptz,
  check (sku_a < sku_b)
);
create unique index pack_alerts_one_active_per_pair on public.pack_alerts (warehouse_id, sku_a, sku_b) where active;

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  type text not null check (type in ('pack.verified','pack.manual_confirm','return.item.decided','return.confirmed','stock.adjustment.approved')),
  payload jsonb not null
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  at timestamptz not null default now(),
  station text not null check (station in ('pack','return','lead','admin','system')),
  type text not null,
  ref_type text,
  ref_id uuid,
  ref_label text,
  summary_nb text not null,
  summary_en text not null,
  actor_device uuid references public.devices(id),
  actor_user uuid references auth.users(id),
  payload jsonb
);
create index on public.audit_events (at desc);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  created_at timestamptz not null default now(),
  key text not null,
  value jsonb not null,
  unique (warehouse_id, key)
);

-- ---------------------------------------------------------------- append-only audit

create or replace function app.audit_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only a deliberate demo reset (M9) may purge the log, and only from a privileged session.
  if coalesce(current_setting('sjekkpunkt.allow_audit_purge', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then return new; end if;
    return null; -- statement-level TRUNCATE: return value is ignored
  end if;
  raise exception 'audit_events is append-only';
end $$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function app.audit_events_immutable();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.audit_events_immutable();

-- ---------------------------------------------------------------- role helpers

create or replace function app.user_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = (select auth.uid())
$$;

create or replace function app.user_warehouse() returns uuid
language sql stable security definer set search_path = '' as $$
  select warehouse_id from public.profiles where user_id = (select auth.uid())
$$;

create or replace function app.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where user_id = (select auth.uid())) = any (roles), false)
$$;

revoke all on schema app from public;
grant usage on schema app to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.user_role(), app.user_warehouse(), app.has_role(text[]) to authenticated;

-- ---------------------------------------------------------------- grants

-- Nobody writes through the Data API with a user token. Writes happen in API routes.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;

-- Append-only for every API role, including the server's service role.
revoke update, delete, truncate on public.audit_events from service_role, authenticated, anon;
-- Raw audit payloads are admin-only; leads read the audit_log view below.

-- ---------------------------------------------------------------- RLS

do $$
declare t text;
begin
  foreach t in array array[
    'warehouses','profiles','devices','locations','products','orders','order_lines','photos',
    'vision_results','pack_checks','returns','return_items','inspections','decisions',
    'stock_adjustments','escalations','confusion_events','pack_alerts','integration_events',
    'audit_events','settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy warehouses_read on public.warehouses for select to authenticated
  using (id = (select app.user_warehouse()));

create policy profiles_read_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_read_lead on public.profiles for select to authenticated
  using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array['lead','admin'])));

-- Read by every role (what both stations need)
do $$
declare t text;
begin
  foreach t in array array[
    'devices','locations','products','orders','order_lines','photos','vision_results',
    'pack_checks','pack_alerts','settings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array[''packer'',''returns'',''lead'',''admin''])))',
      t || '_read', t);
  end loop;
end $$;

-- Returns station, lead and admin
do $$
declare t text;
begin
  foreach t in array array['returns','return_items','inspections','decisions'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array[''returns'',''lead'',''admin''])))',
      t || '_read', t);
  end loop;
end $$;

-- Lead and admin
do $$
declare t text;
begin
  foreach t in array array['stock_adjustments','escalations','confusion_events','integration_events'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array[''lead'',''admin''])))',
      t || '_read', t);
  end loop;
end $$;

-- Admin only: raw audit events with payloads
create policy audit_events_read_admin on public.audit_events for select to authenticated
  using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array['admin'])));

-- ---------------------------------------------------------------- views

-- Leads read the audit log without raw payloads. security_invoker is off on purpose
-- (the base table is admin-only), so the role and warehouse filter lives in the view.
create view public.audit_log with (security_barrier = true) as
  select id, warehouse_id, at, station, type, ref_type, ref_id, ref_label,
         summary_nb, summary_en, actor_device, actor_user
  from public.audit_events
  where warehouse_id = (select app.user_warehouse())
    and (select app.has_role(array['lead','admin']));
revoke all on public.audit_log from anon;
grant select on public.audit_log to authenticated;

-- Insights read only from these. They contain no user or device columns
-- (tests/db/insights-anonymous.test.ts fails if one appears). RLS applies (invoker).
create view public.insights_confusion with (security_invoker = true) as
  select id, warehouse_id, sku_a, sku_b, kind, at from public.confusion_events;

create view public.insights_pack_checks with (security_invoker = true) as
  select id, warehouse_id, order_id, status, method, size_verified, confidence, created_at
  from public.pack_checks;

create view public.insights_returns with (security_invoker = true) as
  select ri.id, ri.warehouse_id, r.customer_reason_nb, r.registered_at, ri.ordered_sku,
         ri.received_sku, p.category, ri.status
  from public.return_items ri
  join public.returns r on r.id = ri.return_id
  join public.products p on p.sku = ri.ordered_sku;

create view public.insights_decisions with (security_invoker = true) as
  select distinct on (d.return_item_id)
         d.id, d.warehouse_id, d.return_item_id, d.grade, d.location_code, d.refund_nok, d.cause,
         d.flags, d.is_override, d.decided_at, ri.ordered_sku, ri.received_sku, p.category,
         coalesce(pr.price_nok, p.price_nok) * ri.qty as item_value_nok
  from public.decisions d
  join public.return_items ri on ri.id = d.return_item_id
  join public.products p on p.sku = ri.ordered_sku
  left join public.products pr on pr.sku = ri.received_sku
  order by d.return_item_id, d.decided_at desc;

revoke all on public.insights_confusion, public.insights_pack_checks, public.insights_returns, public.insights_decisions from anon;
grant select on public.insights_confusion, public.insights_pack_checks, public.insights_returns, public.insights_decisions to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('audio', 'audio', false, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;
-- No storage.objects policies: uploads use signed upload URLs and reads use
-- short-lived signed URLs, both minted by API routes.
