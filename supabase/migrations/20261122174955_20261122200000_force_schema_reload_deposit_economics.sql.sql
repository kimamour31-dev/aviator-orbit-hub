/*
# Force PostgREST schema cache reload for admin_deposit_economics

The admin_deposit_economics function exists and has grants, but PostgREST
may not have refreshed its schema cache after the previous migration.
This migration re-creates the function with a slightly different body
comment to force a cache invalidation, then notifies PostgREST.
*/

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
