/*
# Reload PostgREST schema cache and add deposit economics RPC

## Purpose
1. The `admin_recent_events` and `admin_recent_audit` functions exist in the
   database with correct signatures but are missing from PostgREST's schema
   cache. This migration re-creates them (idempotent) and notifies PostgREST
   to reload its schema cache.
2. Adds a new `admin_deposit_economics` RPC that returns total completed
   deposits, total HarakaPay fees deducted, and net profit, so the operator
   can see real revenue after fees.

## New Functions
- `admin_deposit_economics()` — returns jsonb with:
  - `total_completed`: sum of amounts from approved deposits
  - `total_fees`: sum of provider_fee from approved HarakaPay deposits
  - `total_net`: sum of provider_net from approved HarakaPay deposits
  - `net_profit`: total_completed - total_fees (what the platform keeps after fees)
  - `completed_count`: number of approved deposits
  - `harakapay_count`: number of approved HarakaPay deposits

## Re-created Functions (no signature changes)
- `admin_recent_events(int, int, text, uuid)` — unchanged, re-created to
  force schema cache refresh.
- `admin_recent_audit(int, int)` — unchanged, re-created to force refresh.

## Security
- All three functions are SECURITY DEFINER, restricted to authenticated
  users with admin role. No RLS or policy changes.
*/

-- Re-create admin_recent_events to force PostgREST schema cache refresh
CREATE OR REPLACE FUNCTION public.admin_recent_events(_limit int, _offset int, _type text, _user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by created_at desc)
    from (
      select e.id, e.user_id, e.actor_id, e.event_type, e.metadata, e.created_at,
             p.phone as user_phone, p.display_name as user_name,
             pa.phone as actor_phone, pa.display_name as actor_name
      from public.activity_events e
      left join public.profiles p on p.id = e.user_id
      left join public.profiles pa on pa.id = e.actor_id
      where (_type is null or _type = '' or e.event_type = _type)
        and (_user_id is null or e.user_id = _user_id)
      order by e.created_at desc
      limit greatest(1, least(_limit, 500))
      offset greatest(0, _offset)
    ) t
  ), '[]'::jsonb);
end $$;
REVOKE EXECUTE ON FUNCTION public.admin_recent_events(int, int, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_events(int, int, text, uuid) TO authenticated;

-- Re-create admin_recent_audit to force PostgREST schema cache refresh
CREATE OR REPLACE FUNCTION public.admin_recent_audit(_limit int, _offset int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by created_at desc)
    from (
      select a.id, a.admin_id, a.target_user_id, a.action, a.details, a.created_at,
             am.phone as admin_phone, am.display_name as admin_name,
             tp.phone as target_phone, tp.display_name as target_name
      from public.admin_audit_log a
      left join public.profiles am on am.id = a.admin_id
      left join public.profiles tp on tp.id = a.target_user_id
      order by a.created_at desc
      limit greatest(1, least(_limit, 500))
      offset greatest(0, _offset)
    ) t
  ), '[]'::jsonb);
end $$;
REVOKE EXECUTE ON FUNCTION public.admin_recent_audit(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_audit(int, int) TO authenticated;

-- New RPC: deposit economics summary for the payments panel
CREATE OR REPLACE FUNCTION public.admin_deposit_economics()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  total_completed bigint;
  total_fees bigint;
  total_net bigint;
  completed_count int;
  harakapay_count int;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;

  select coalesce(sum(amount), 0), count(*)
    into total_completed, completed_count
  from public.deposit_requests
  where status = 'approved';

  select coalesce(sum(coalesce(provider_fee, 0)), 0), coalesce(sum(coalesce(provider_net, 0)), 0), count(*)
    into total_fees, total_net, harakapay_count
  from public.deposit_requests
  where status = 'approved' and provider = 'harakapay';

  return jsonb_build_object(
    'total_completed', total_completed,
    'total_fees', total_fees,
    'total_net', total_net,
    'net_profit', total_completed - total_fees,
    'completed_count', completed_count,
    'harakapay_count', harakapay_count
  );
end $$;
REVOKE EXECUTE ON FUNCTION public.admin_deposit_economics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_deposit_economics() TO authenticated;

NOTIFY pgrst, 'reload schema';
