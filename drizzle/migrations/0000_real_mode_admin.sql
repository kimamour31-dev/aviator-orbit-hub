
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique,
  display_name text,
  balance bigint not null default 0,
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

-- first user to sign up becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'phone', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'display_name');
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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
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
  admin_id uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.balance_adjustments to authenticated;
grant all on public.balance_adjustments to service_role;
alter table public.balance_adjustments enable row level security;
create policy "own or admin adj" on public.balance_adjustments for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- multiplier from elapsed ms (matches client: e^(0.00008 t))
create or replace function public._mult_since(_t timestamptz)
returns numeric language sql volatile as $$
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
declare rd real_rounds; s game_settings;
begin
  select * into rd from real_rounds where id = _rid for update;
  if rd.ended then return; end if;
  select * into s from game_settings where id = 1;
  update real_bets set status = 'won', cashed_at = auto_cashout,
    payout = least(s.max_payout, floor(stake * auto_cashout))
    where round_id = _rid and status = 'active' and auto_cashout is not null and auto_cashout < rd.crash_point;
  update profiles p set balance = p.balance + b.payout
    from real_bets b where b.round_id = _rid and b.status = 'won' and b.cashed_at = b.auto_cashout and p.id = b.user_id
    and b.id in (select id from real_bets where round_id = _rid and status = 'won' and auto_cashout is not null and cashed_at = auto_cashout and payout > 0 and created_at = b.created_at);
  update real_bets set status = 'lost' where round_id = _rid and status = 'active';
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

-- admin helpers
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
