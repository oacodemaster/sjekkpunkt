-- M8: the nightly retention job also removes rate-limit windows older than a day, so the hashed
-- keys never outlive the day they were counted in (docs/privacy.md).
create or replace function public.purge_rate_limit_hits() returns int
language plpgsql set search_path = '' as $$
declare v_n int;
begin
  delete from app.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.purge_rate_limit_hits() from public, anon, authenticated;
grant execute on function public.purge_rate_limit_hits() to service_role;
