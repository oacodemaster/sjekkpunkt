-- M8: hardening. Rate limits and daily spend caps for the paid AI calls (addendum sections 6 and 10).
-- Both live in Postgres because Vercel functions share no memory between instances.
-- Only the service role may call the functions; the API routes call them after authorize().

-- ---------------------------------------------------------------- rate limits

/*
 Fixed-window counters. `key` is a SHA-256 hash made on the server from the route and the user id
 or device label, so the table holds no readable identity. Rows older than a day are removed by
 the function itself and by the nightly retention job. Never read for statistics.
*/
create table app.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table app.rate_limit_hits enable row level security;
revoke all on app.rate_limit_hits from public, anon, authenticated;
grant select, insert, update, delete on app.rate_limit_hits to service_role;

/* The Oslo calendar day: spend caps reset at local midnight. */
create or replace function app.oslo_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Oslo')::date
$$;

-- ---------------------------------------------------------------- spend

/*
 Estimated spend per warehouse, day and provider, in øre. No user or device column: it is a
 budget, not a measure of anyone's work. `vision` covers every Gemini call (vision and
 translation), `elevenlabs` covers conversation sessions and spoken summaries.
*/
create table public.spend_daily (
  warehouse_id uuid not null references public.warehouses(id),
  day date not null,
  provider text not null check (provider in ('vision', 'elevenlabs')),
  cost_ore bigint not null default 0 check (cost_ore >= 0),
  calls int not null default 0 check (calls >= 0),
  cap_reached_at timestamptz,
  primary key (warehouse_id, day, provider)
);
alter table public.spend_daily enable row level security;
revoke all on public.spend_daily from anon;
revoke insert, update, delete, truncate on public.spend_daily from authenticated;
grant select on public.spend_daily to authenticated;
create policy spend_daily_read on public.spend_daily for select to authenticated
  using (warehouse_id = (select app.user_warehouse()) and (select app.has_role(array['lead','admin'])));

/*
 api_gate(p jsonb) { warehouse_id, provider?, checks: [{ key, window, limit }] }
 Counts one hit in every window, then reports whether any window is over its limit and how
 much the provider has spent today. A refused call still counts, so hammering stays refused
 until the window ends. One round trip before every paid call.
*/
create or replace function public.api_gate(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  c jsonb;
  v_now timestamptz := clock_timestamp();
  v_win int;
  v_start timestamptz;
  v_hits int;
  v_retry int := 0;
  v_spent bigint := 0;
begin
  for c in select * from jsonb_array_elements(coalesce(p->'checks', '[]'::jsonb)) loop
    v_win := (c->>'window')::int;
    v_start := to_timestamp(floor(extract(epoch from v_now) / v_win) * v_win);
    insert into app.rate_limit_hits as h (key, window_start, hits) values (c->>'key', v_start, 1)
      on conflict (key, window_start) do update set hits = h.hits + 1
      returning hits into v_hits;
    if v_hits > (c->>'limit')::int then
      v_retry := greatest(v_retry, ceil(extract(epoch from (v_start + make_interval(secs => v_win) - v_now)))::int, 1);
    end if;
  end loop;

  if p ? 'provider' then
    select cost_ore into v_spent from public.spend_daily
     where warehouse_id = (p->>'warehouse_id')::uuid and day = app.oslo_today() and provider = p->>'provider';
  end if;

  -- Opportunistic cleanup; the nightly retention job also clears old windows.
  if random() < 0.02 then
    delete from app.rate_limit_hits where window_start < v_now - interval '1 day';
  end if;

  return jsonb_build_object('ok', v_retry = 0, 'retry_after', v_retry, 'spent_ore', coalesce(v_spent, 0));
end $$;

/*
 record_spend(p jsonb) { warehouse_id, provider, ore, calls?, cap_ore }
 Adds today's estimated cost. The first time the total reaches the cap, one SPEND_CAP_REACHED
 audit row tells the lead and admin why the stations went tap-only.
*/
create or replace function public.record_spend(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_wh uuid := (p->>'warehouse_id')::uuid;
  v_provider text := p->>'provider';
  v_cap bigint := (p->>'cap_ore')::bigint;
  v_total bigint;
  v_reached timestamptz;
  v_label text;
begin
  insert into public.spend_daily as s (warehouse_id, day, provider, cost_ore, calls)
  values (v_wh, app.oslo_today(), v_provider, greatest((p->>'ore')::bigint, 0), coalesce((p->>'calls')::int, 1))
  on conflict (warehouse_id, day, provider) do update
    set cost_ore = s.cost_ore + excluded.cost_ore, calls = s.calls + excluded.calls
  returning cost_ore, cap_reached_at into v_total, v_reached;

  if v_reached is null and v_total >= v_cap then
    update public.spend_daily set cap_reached_at = now()
     where warehouse_id = v_wh and day = app.oslo_today() and provider = v_provider;
    v_label := case v_provider when 'vision' then 'bildeanalyse og oversettelse' else 'tale' end;
    insert into public.audit_events (warehouse_id, station, type, ref_type, ref_label, summary_nb, summary_en, payload)
    values (v_wh, 'system', 'SPEND_CAP_REACHED', 'settings', v_provider,
            'Dagens kostnadsgrense nådd for ' || v_label || ': stasjonene bruker trykk uten ' || v_label || ' til midnatt',
            'Daily spend cap reached for ' || case v_provider when 'vision' then 'vision and translation' else 'voice' end || ': stations are tap-only until midnight',
            jsonb_build_object('provider', v_provider, 'cost_ore', v_total, 'cap_ore', v_cap));
  end if;
  return jsonb_build_object('cost_ore', v_total);
end $$;

revoke all on function public.api_gate(jsonb), public.record_spend(jsonb), app.oslo_today() from public, anon, authenticated;
grant execute on function public.api_gate(jsonb), public.record_spend(jsonb), app.oslo_today() to service_role;
