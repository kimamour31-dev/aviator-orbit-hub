create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique,
  display_name text,
  balance bigint not null default 0,
  promo_code text,
  promo_bonus bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table public.promo_codes (
  code text primary key check (code = upper(code) and length(code) between 2 and 30),
  bonus bigint not null default 0 check (bonus >= 0),
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.promo_codes to authenticated;
grant all on public.promo_codes to service_role;
alter table public.promo_codes enable row level security;
create policy "admin all promo" on public.promo_codes for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.check_promo_code(_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.promo_codes
    where code = upper(trim(_code)) and active and (max_uses is null or uses < max_uses))
$$;
grant execute on function public.check_promo_code(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pc text := nullif(upper(trim(coalesce(new.raw_user_meta_data->>'promo_code', ''))), '');
  promo public.promo_codes;
begin
  if pc is not null then
    update public.promo_codes set uses = uses + 1
      where code = pc and active and (max_uses is null or uses < max_uses)
      returning * into promo;
  end if;
  insert into public.profiles (id, phone, display_name, promo_code, promo_bonus, balance)
  values (new.id, coalesce(new.raw_user_meta_data->>'phone', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name', promo.code, coalesce(promo.bonus, 0), coalesce(promo.bonus, 0));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.game_settings (
  id int primary key default 1 check (id = 1),
  house_edge numeric not null default 0.03,
  min_bet bigint not null default 100,
  max_bet bigint not null default 100000,
  max_multiplier numeric not null default 1000,
  max_payout bigint not null default 10000000,
  real_mode_enabled boolean not null default true,
  payment_numbers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint game_settings_sane check (house_edge >= 0 and house_edge < 1 and min_bet > 0 and max_bet >= min_bet and max_multiplier >= 1 and max_payout > 0)
);
insert into public.game_settings (id) values (1);
grant select, update on public.game_settings to authenticated;
grant all on public.game_settings to service_role;
alter table public.game_settings enable row level security;
create policy "admin read settings" on public.game_settings for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin update settings" on public.game_settings for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.odds_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Rule',
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 0 and 24),
  max_multiplier numeric not null check (max_multiplier >= 1),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.odds_rules to authenticated;
grant all on public.odds_rules to service_role;
alter table public.odds_rules enable row level security;
create policy "admin all rules" on public.odds_rules for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.user_risk (
  user_id uuid primary key,
  house_edge numeric,
  max_bet bigint,
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint user_risk_sane check ((house_edge is null or (house_edge >= 0 and house_edge < 1)) and (max_bet is null or max_bet > 0))
);
grant select, insert, update, delete on public.user_risk to authenticated;
grant all on public.user_risk to service_role;
alter table public.user_risk enable row level security;
create policy "admin all risk" on public.user_risk for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.real_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  crash_point numeric not null,
  started_at timestamptz not null default clock_timestamp(),
  ended boolean not null default false
);
grant all on public.real_rounds to service_role;
grant select on public.real_rounds to authenticated;
alter table public.real_rounds enable row level security;
create policy "admin rounds" on public.real_rounds for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.real_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.real_rounds(id) on delete cascade,
  user_id uuid not null,
  slot int not null,
  stake bigint not null,
  auto_cashout numeric,
  status text not null default 'active',
  cashed_at numeric,
  payout bigint not null default 0,
  created_at timestamptz not null default now()
);
create index on public.real_bets (user_id, created_at desc);
grant select on public.real_bets to authenticated;
grant all on public.real_bets to service_role;
alter table public.real_bets enable row level security;
create policy "own bets" on public.real_bets for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount bigint not null,
  note text,
  admin_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.balance_adjustments to authenticated;
grant all on public.balance_adjustments to service_role;
alter table public.balance_adjustments enable row level security;
create policy "own or admin adj" on public.balance_adjustments for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public._mult_since(_t timestamptz)
returns numeric language sql volatile set search_path = public as $$
  select floor(exp(0.00008 * greatest(0, extract(epoch from clock_timestamp() - _t) * 1000)) * 100) / 100
$$;

create or replace function public.start_real_round(_stake1 bigint, _auto1 numeric, _stake2 bigint, _auto2 numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.game_settings;
  r public.user_risk;
  edge numeric; cap numeric; maxb bigint; total bigint; bal bigint;
  h int; rr numeric; crash numeric; rid uuid; st timestamptz;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into s from game_settings where id = 1;
  if not s.real_mode_enabled then raise exception 'Real mode is paused by the operator'; end if;
  select * into r from user_risk where user_id = uid;
  if r.blocked then raise exception 'Your account is blocked from betting'; end if;
  edge := coalesce(r.house_edge, s.house_edge);
  maxb := coalesce(r.max_bet, s.max_bet);
  _stake1 := coalesce(_stake1, 0); _stake2 := coalesce(_stake2, 0);
  if _stake1 = 0 and _stake2 = 0 then raise exception 'No bet'; end if;
  if (_stake1 > 0 and (_stake1 < s.min_bet or _stake1 > maxb)) or (_stake2 > 0 and (_stake2 < s.min_bet or _stake2 > maxb)) then
    raise exception 'Bet must be between % and % TSh', s.min_bet, maxb;
  end if;
  total := _stake1 + _stake2;
  select balance into bal from profiles where id = uid for update;
  if bal < total then raise exception 'Not enough balance'; end if;
  update profiles set balance = balance - total where id = uid;
  h := extract(hour from now() at time zone 'Africa/Dar_es_Salaam');
  cap := s.max_multiplier;
  select least(cap, coalesce(min(max_multiplier), cap)) into cap from odds_rules
    where enabled and ((start_hour <= end_hour and h >= start_hour and h < end_hour)
                    or (start_hour > end_hour and (h >= start_hour or h < end_hour)));
  rr := random();
  crash := floor(((1 - edge) / (1 - rr)) * 100) / 100;
  if crash < 1 then crash := 1; end if;
  if crash > cap then crash := cap; end if;
  insert into real_rounds (user_id, crash_point) values (uid, crash) returning id, started_at into rid, st;
  if _stake1 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 0, _stake1, _auto1); end if;
  if _stake2 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 1, _stake2, _auto2); end if;
  return jsonb_build_object('round_id', rid, 'balance', bal - total);
end $$;

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

create or replace function public.real_round_status(_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rd real_rounds; m numeric; bal bigint;
begin
  select * into rd from real_rounds where id = _round_id and user_id = auth.uid();
  if rd.id is null then raise exception 'Round not found'; end if;
  m := _mult_since(rd.started_at);
  if rd.ended or m >= rd.crash_point then
    perform _settle_round(rd.id);
    select balance into bal from profiles where id = auth.uid();
    return jsonb_build_object('crashed', true, 'crash_point', rd.crash_point, 'balance', bal,
      'bets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slot', slot, 'status', status, 'cashed_at', cashed_at, 'payout', payout, 'stake', stake)), '[]') from real_bets where round_id = rd.id));
  end if;
  return jsonb_build_object('crashed', false, 'multiplier', m);
end $$;

create or replace function public.cash_out_real(_round_id uuid, _slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rd real_rounds; b real_bets; m numeric; s game_settings; win bigint; bal bigint;
begin
  select * into rd from real_rounds where id = _round_id and user_id = auth.uid() for update;
  if rd.id is null then raise exception 'Round not found'; end if;
  select * into b from real_bets where round_id = rd.id and slot = _slot for update;
  if b.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'Bet already settled'); end if;
  m := _mult_since(rd.started_at);
  if b.auto_cashout is not null and m >= b.auto_cashout then m := b.auto_cashout; end if;
  if rd.ended or m >= rd.crash_point then
    return jsonb_build_object('ok', false, 'reason', 'Too late — the plane flew away');
  end if;
  select * into s from game_settings where id = 1;
  win := least(s.max_payout, floor(b.stake * m));
  update real_bets set status = 'won', cashed_at = m, payout = win where id = b.id;
  update profiles set balance = balance + win where id = auth.uid() returning balance into bal;
  return jsonb_build_object('ok', true, 'multiplier', m, 'payout', win, 'balance', bal);
end $$;

create or replace function public.admin_adjust_balance(_user_id uuid, _amount bigint, _note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  update profiles set balance = greatest(0, balance + _amount) where id = _user_id returning balance into bal;
  insert into balance_adjustments (user_id, amount, note, admin_id) values (_user_id, _amount, _note, auth.uid());
  return bal;
end $$;

create or replace function public.admin_stats(_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => _days);
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'staked', (select coalesce(sum(stake),0) from real_bets where created_at >= since and status <> 'active'),
    'paid', (select coalesce(sum(payout),0) from real_bets where created_at >= since and status <> 'active'),
    'bets', (select count(*) from real_bets where created_at >= since),
    'players', (select count(distinct user_id) from real_bets where created_at >= since),
    'users_total', (select count(*) from profiles),
    'balances_total', (select coalesce(sum(balance),0) from profiles),
    'daily', (select coalesce(jsonb_agg(d order by d->>'day'), '[]') from (
      select jsonb_build_object('day', to_char(date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam'), 'YYYY-MM-DD'),
        'staked', sum(stake), 'paid', sum(payout)) d
      from real_bets where created_at >= since and status <> 'active'
      group by date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam')) x)
  );
end $$;

revoke execute on function public._settle_round(uuid) from public, anon, authenticated;
revoke execute on function public._mult_since(timestamptz) from anon;
grant execute on function public.start_real_round(bigint, numeric, bigint, numeric) to authenticated;
grant execute on function public.real_round_status(uuid) to authenticated;
grant execute on function public.cash_out_real(uuid, int) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, bigint, text) to authenticated;
grant execute on function public.admin_stats(int) to authenticated;

create table public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  network text not null check (network in ('mpesa','tigo','airtel','halopesa')),
  phone text not null,
  amount bigint not null check (amount >= 1000 and amount <= 10000000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  provider text not null default 'manual' check (provider in ('manual','harakapay')),
  provider_order_id text unique,
  provider_fee bigint,
  provider_net bigint,
  created_at timestamptz not null default now()
);
create index deposit_requests_user_idx on public.deposit_requests (user_id, created_at desc);
create index deposit_requests_status_idx on public.deposit_requests (status, created_at desc);
grant select on public.deposit_requests to authenticated;
grant all on public.deposit_requests to service_role;
alter table public.deposit_requests enable row level security;
create policy "own or admin deposits" on public.deposit_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.request_deposit(_network text, _phone text, _amount bigint)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); d text; rid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if _network not in ('mpesa','tigo','airtel','halopesa') then raise exception 'Choose a mobile money network'; end if;
  if _amount is null or _amount < 1000 then raise exception 'Minimum deposit is 1,000 TSh'; end if;
  if _amount > 10000000 then raise exception 'Maximum deposit is 10,000,000 TSh'; end if;
  d := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  if d like '255%' then d := substr(d, 4); elsif d like '0%' then d := substr(d, 2); end if;
  if d !~ '^[67][0-9]{8}$' then raise exception 'Enter a valid Tanzanian mobile number'; end if;
  if (select count(*) from deposit_requests where user_id = uid and status = 'pending') >= 3 then
    raise exception 'You already have 3 deposits waiting for confirmation';
  end if;
  insert into deposit_requests (user_id, network, phone, amount) values (uid, _network, '255' || d, _amount) returning id into rid;
  return rid;
end $$;

create or replace function public.review_deposit(_id uuid, _approve boolean, _note text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare r deposit_requests;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  select * into r from deposit_requests where id = _id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if r.provider = 'harakapay' then raise exception 'HarakaPay deposits are confirmed automatically by HarakaPay'; end if;
  if r.status <> 'pending' then raise exception 'This deposit was already reviewed'; end if;
  update deposit_requests
    set status = case when _approve then 'approved' else 'rejected' end,
        admin_note = nullif(trim(coalesce(_note,'')), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = _id;
  if _approve then
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id)
    values (r.user_id, r.amount, 'Deposit ' || r.network || ' ' || r.phone || coalesce(' — ' || nullif(trim(coalesce(_note,'')), ''), ''), auth.uid());
    return 'approved';
  end if;
  return 'rejected';
end $$;

revoke all on function public.request_deposit(text, text, bigint) from public, anon;
grant execute on function public.request_deposit(text, text, bigint) to authenticated;
revoke all on function public.review_deposit(uuid, boolean, text) from public, anon;
grant execute on function public.review_deposit(uuid, boolean, text) to authenticated;

create or replace function public.settle_harakapay_deposit(_order_id text, _status text, _fee bigint, _net bigint)
returns text language plpgsql security definer set search_path to 'public' as $$
declare r deposit_requests;
begin
  select * into r from deposit_requests where provider = 'harakapay' and provider_order_id = _order_id for update;
  if not found then return 'not_found'; end if;
  if r.status = 'approved' then return 'approved'; end if;
  if _status = 'completed' then
    update deposit_requests set status = 'approved', reviewed_at = now(), provider_fee = _fee, provider_net = _net,
          admin_note = 'Paid via HarakaPay ' || _order_id where id = r.id;
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id)
    values (r.user_id, r.amount, 'HarakaPay deposit ' || r.network || ' ' || r.phone || ' — ' || _order_id, null);
    return 'approved';
  elsif _status = 'failed' and r.status = 'pending' then
    update deposit_requests set status = 'rejected', reviewed_at = now(), admin_note = 'Payment failed or was cancelled on the phone' where id = r.id;
    return 'rejected';
  end if;
  return r.status;
end $$;
revoke all on function public.settle_harakapay_deposit(text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.settle_harakapay_deposit(text, text, bigint, bigint) to service_role;

create or replace function public.get_payment_numbers()
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select coalesce((select payment_numbers from game_settings where id = 1), '{}'::jsonb) $$;
revoke all on function public.get_payment_numbers() from public, anon;
grant execute on function public.get_payment_numbers() to authenticated;

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  network text not null check (network in ('mpesa','tigo','airtel','halopesa')),
  phone text not null,
  amount bigint not null check (amount >= 1000 and amount <= 10000000),
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  reference text,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index withdrawal_requests_user_idx on public.withdrawal_requests (user_id, created_at desc);
create index withdrawal_requests_status_idx on public.withdrawal_requests (status, created_at desc);
grant select on public.withdrawal_requests to authenticated;
grant all on public.withdrawal_requests to service_role;
alter table public.withdrawal_requests enable row level security;
create policy "own or admin withdrawals" on public.withdrawal_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.request_withdrawal(_network text, _phone text, _amount bigint)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); d text; rid uuid; bal bigint;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if _network not in ('mpesa','tigo','airtel','halopesa') then raise exception 'Choose a mobile money network'; end if;
  if _amount is null or _amount < 1000 then raise exception 'Minimum withdrawal is 1,000 TSh'; end if;
  if _amount > 10000000 then raise exception 'Maximum withdrawal is 10,000,000 TSh'; end if;
  d := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  if d like '255%' then d := substr(d, 4); elsif d like '0%' then d := substr(d, 2); end if;
  if d !~ '^[67][0-9]{8}$' then raise exception 'Enter a valid Tanzanian mobile number'; end if;
  if exists (select 1 from user_risk where user_id = uid and blocked) then raise exception 'Your account is blocked'; end if;
  if (select count(*) from withdrawal_requests where user_id = uid and status = 'pending') >= 3 then
    raise exception 'You already have 3 withdrawals waiting';
  end if;
  select balance into bal from profiles where id = uid for update;
  if bal < _amount then raise exception 'Not enough balance'; end if;
  update profiles set balance = balance - _amount where id = uid;
  insert into withdrawal_requests (user_id, network, phone, amount) values (uid, _network, '255' || d, _amount) returning id into rid;
  return rid;
end $$;

create or replace function public.review_withdrawal(_id uuid, _paid boolean, _reference text, _note text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare r withdrawal_requests;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  select * into r from withdrawal_requests where id = _id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if r.status <> 'pending' then raise exception 'This withdrawal was already reviewed'; end if;
  update withdrawal_requests
    set status = case when _paid then 'paid' else 'rejected' end,
        reference = nullif(trim(coalesce(_reference,'')), ''),
        admin_note = nullif(trim(coalesce(_note,'')), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = _id;
  if not _paid then
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id) values (r.user_id, r.amount, 'Withdrawal declined, refunded', auth.uid());
    return 'rejected';
  end if;
  return 'paid';
end $$;
revoke all on function public.request_withdrawal(text, text, bigint) from public, anon;
grant execute on function public.request_withdrawal(text, text, bigint) to authenticated;
revoke all on function public.review_withdrawal(uuid, boolean, text, text) from public, anon;
grant execute on function public.review_withdrawal(uuid, boolean, text, text) to authenticated;