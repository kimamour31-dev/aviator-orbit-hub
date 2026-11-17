revoke execute on function public.admin_adjust_balance(uuid, bigint, text) from public, anon;
revoke execute on function public.admin_stats(int) from public, anon;
revoke execute on function public.cash_out_real(uuid, int) from public, anon;
revoke execute on function public.real_round_status(uuid) from public, anon;
revoke execute on function public.start_real_round(bigint, numeric, bigint, numeric) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, app_role) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated;