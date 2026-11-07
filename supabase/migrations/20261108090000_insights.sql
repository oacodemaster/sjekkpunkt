-- M6: insights and integration events.
-- Insights read only insights_* views (no user or device columns; tests/db/insights-anonymous.test.ts).
-- The mix-up panel shows each pair's alert status, so alerts get their own view without cleared_by.

create view public.insights_alerts with (security_invoker = true) as
  select id, warehouse_id, sku_a, sku_b, rule, origin, active, created_at, cleared_at
  from public.pack_alerts;

revoke all on public.insights_alerts from anon;
grant select on public.insights_alerts to authenticated;

-- The Holio mock lists the newest events first.
create index if not exists integration_events_recent on public.integration_events (warehouse_id, created_at desc);
