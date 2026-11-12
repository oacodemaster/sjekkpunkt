-- Leads from the landing page form (landing page brief, section 9).
--
-- A visitor asks for more information or a pilot. The row holds only what the form asked for:
-- no IP address (the rate limit counts a hash of it in app.rate_limit_hits, which is purged
-- daily), no user agent, no device. Not warehouse data: there is no warehouse_id, and no
-- insights_* view reads this table.
--
-- RLS is on with no policy, and anon and authenticated have no grant at all: the only way in is
-- the service role, which the server uses after its own checks (zod, honeypot, time to submit,
-- rate limits). Each write goes through one function, executable only by the service role.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  company text not null check (char_length(company) between 1 and 160),
  role text check (role in ('warehouse_manager', 'logistics_manager', 'owner', 'it', 'other')),
  orders_per_day text check (orders_per_day in ('lt50', '50_200', '200_500', '500_2000', 'gt2000')),
  interest text check (interest in ('packing', 'returns', 'both')),
  message text check (char_length(message) <= 2000),
  lang text not null check (lang in ('nb', 'en')),
  -- when the email to the owner went out; null when it was skipped or failed
  notified_at timestamptz
);

create index leads_created_at_idx on public.leads (created_at);

alter table public.leads enable row level security;
revoke all on public.leads from public, anon, authenticated;
grant select, insert, update, delete on public.leads to service_role;

/*
 insert_lead(p jsonb) { name, email, company, role?, orders_per_day?, interest?, message?, lang }
 The one way a lead is stored. The checks on the table hold the limits; the server validated
 the same fields with zod before calling.
*/
create or replace function public.insert_lead(p jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.leads (name, email, company, role, orders_per_day, interest, message, lang)
  values (p->>'name', lower(p->>'email'), p->>'company', nullif(p->>'role', ''), nullif(p->>'orders_per_day', ''),
          nullif(p->>'interest', ''), nullif(p->>'message', ''), p->>'lang')
  returning id into v_id;
  return v_id;
end $$;

/* lead_notified(p jsonb) { id }: the email to the owner went out. */
create or replace function public.lead_notified(p jsonb) returns void
language sql set search_path = '' as $$
  update public.leads set notified_at = now() where id = (p->>'id')::uuid and notified_at is null;
$$;

/*
 purge_old_leads(p jsonb) { days }: deletes leads older than `days` (the retention job, daily).
 Returns how many were deleted.
*/
create or replace function public.purge_old_leads(p jsonb) returns int
language plpgsql set search_path = '' as $$
declare
  v_n int;
begin
  delete from public.leads where created_at < now() - make_interval(days => (p->>'days')::int);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.insert_lead(jsonb), public.lead_notified(jsonb), public.purge_old_leads(jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_lead(jsonb), public.lead_notified(jsonb), public.purge_old_leads(jsonb)
  to service_role;
