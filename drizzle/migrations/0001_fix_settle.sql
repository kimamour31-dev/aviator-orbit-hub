
create or replace function public._settle_round(_rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rd real_rounds; s game_settings; b real_bets; win bigint;
begin
  select * into rd from real_rounds where id = _rid for update;
  if rd.ended then return; end if;
  select * into s from game_settings where id = 1;
  for b in select * from real_bets where round_id = _rid and status = 'active' for update loop
    if b.auto_cashout is not null and b.auto_cashout < rd.crash_point then
      win := least(s.max_payout, floor(b.stake * b.auto_cashout));
      update real_bets set status = 'won', cashed_at = b.auto_cashout, payout = win where id = b.id;
      update profiles set balance = balance + win where id = b.user_id;
    else
      update real_bets set status = 'lost' where id = b.id;
    end if;
  end loop;
  update real_rounds set ended = true where id = _rid;
end $$;
revoke execute on function public._settle_round(uuid) from public, anon, authenticated;
