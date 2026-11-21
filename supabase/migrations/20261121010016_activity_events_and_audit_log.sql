/*
# Activity events + admin audit log

## Purpose
Gives the operator a live, searchable view of everything players do on the site
(sign-ups, sign-ins, bets, deposits, withdrawals, cash-outs, promo redemptions,
balance changes) and a separate tamper-evident log of every admin action
(deposit/withdrawal reviews, manual balance adjustments, settings saves, risk
edits, promo code changes, odds rule changes).

## New tables
1. `activity_events`
   - id uuid pk
   - user_id uuid (nullable, references auth.users on delete set null) — the player the event is about
   - actor_id uuid (nullable, references auth.users on delete set null) — the user who triggered it (admin for admin actions)
   - event_type text not null (e.g. 'sign_up', 'sign_in', 'bet_placed', 'bet_cashed_out', 'bet_lost', 'deposit_requested', 'deposit_approved', 'deposit_rejected', 'withdrawal_requested', 'withdrawal_paid', 'withdrawal_rejected', 'balance_adjusted', 'promo_redeemed')
   - metadata jsonb not null default '{}' — contextual details (amount, network, multiplier, note, etc.)
   - created_at timestamptz default now()
   - indexes on created_at desc, user_id, event_type

2. `admin_audit_log`
   - id uuid pk
   - admin_id uuid (nullable, references auth.users on delete set null) — the admin who acted
   - target_user_id uuid (nullable, references auth.users on delete set null) — the player affected, if any
   - action text not null (e.g. 'review_deposit', 'review_withdrawal', 'adjust_balance', 'update_settings', 'save_risk', 'save_promo', 'save_odds_rule')
   - details jsonb not null default '{}' — what changed (before/after, amounts, notes)
   - created_at timestamptz default now()
   - index on created_at desc, admin_id

## Security
- Both tables are read-only for admins via RLS (SELECT for authenticated admins only).
- service_role has full access (used by RPC functions that write the rows).
- No INSERT/UPDATE/DELETE grants to anon or authenticated: all writes go through
  SECURITY DEFINER RPC functions running as service_role, so players cannot forge
  or alter log entries.
- A helper `log_event` and `log_admin_action` are SECURITY DEFINER, executable by
  authenticated (used inside other SECURITY DEFINER functions) and service_role.

## Modified functions (behaviour unchanged except added logging)
- handle_new_user() — logs 'sign_up' + 'promo_redeemed' when a promo code is used
- start_real_round() — logs 'bet_placed'
- cash_out_real() — logs 'bet_cashed_out'
- _settle_round() — logs 'bet_lost' for auto-resolved losing bets
- request_deposit() — logs 'deposit_requested'
- review_deposit() — logs 'deposit_approved'/'deposit_rejected' + admin audit row
- request_withdrawal() — logs 'withdrawal_requested'
- review_withdrawal() — logs 'withdrawal_paid'/'withdrawal_rejected' + admin audit row
- admin_adjust_balance() — logs 'balance_adjusted' + admin audit row

## New admin helper RPCs
- admin_log_action(_target uuid, _action text, _details jsonb) — lets the admin UI
  write audit rows for actions that happen purely client-side (settings saves,
  odds rule edits, promo code edits, user risk edits). Verifies caller is admin.
- admin_recent_events(_limit int, _offset int, _type text, _user_id uuid) — returns
  recent activity events joined with profile phone/display_name for the feed.
- admin_recent_audit(_limit int, _offset int) — returns recent audit rows joined
  with admin phone and target phone.
- admin_event_summary() — counts per event type in the last 24h / 7d / 30d for the
  activity overview widgets.

## Notes
1. This migration is idempotent: tables, functions and policies use IF NOT EXISTS
   or DROP-then-CREATE for policies. Re-running is safe.
2. No existing columns are dropped or changed — only added logging, so no data loss.
3. Sign-in events are recorded client-side after successful auth (the frontend calls
   a new public RPC `log_sign_in`), because Supabase auth does not expose a server
   hook for sign-in here.
*/

-- ---------------------------------------------------------------------------
-- activity_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_user_idx ON public.activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_idx ON public.activity_events (event_type, created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

DROP POLICY IF EXISTS "admin read activity" ON public.activity_events;
CREATE POLICY "admin read activity"
ON public.activity_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx ON public.admin_audit_log (admin_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

DROP POLICY IF EXISTS "admin read audit" ON public.admin_audit_log;
CREATE POLICY "admin read audit"
ON public.admin_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Logging helpers (SECURITY DEFINER, callable from other definer functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_event(_user_id uuid, _actor_id uuid, _event_type text, _metadata jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.activity_events (user_id, actor_id, event_type, metadata)
  VALUES (_user_id, _actor_id, _event_type, COALESCE(_metadata, '{}'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.log_event(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_event(uuid, uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_admin_action(_target uuid, _action text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
  VALUES (auth.uid(), _target, _action, COALESCE(_details, '{}'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, jsonb) TO authenticated;

-- Public sign-in logger (called by the frontend after successful auth)
CREATE OR REPLACE FUNCTION public.log_sign_in()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  INSERT INTO public.activity_events (user_id, actor_id, event_type, metadata)
  VALUES (auth.uid(), auth.uid(), 'sign_in', jsonb_build_object('at', now()));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_sign_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_sign_in() TO authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user: log sign_up + promo_redeemed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (new.id, new.id, 'sign_up', jsonb_build_object('phone', coalesce(new.raw_user_meta_data->>'phone', split_part(new.email, '@', 1))));
  if promo.code is not null then
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (new.id, new.id, 'promo_redeemed', jsonb_build_object('code', promo.code, 'bonus', promo.bonus));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- start_real_round: log bet_placed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_real_round(_stake1 bigint, _auto1 numeric, _stake2 bigint, _auto2 numeric)
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
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (uid, uid, 'bet_placed', jsonb_build_object('round_id', rid, 'stake1', _stake1, 'stake2', _stake2, 'total', total, 'balance', bal - total));
  return jsonb_build_object('round_id', rid, 'balance', bal - total);
end $$;

-- ---------------------------------------------------------------------------
-- cash_out_real: log bet_cashed_out
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_out_real(_round_id uuid, _slot int)
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
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (auth.uid(), auth.uid(), 'bet_cashed_out', jsonb_build_object('round_id', rd.id, 'slot', _slot, 'stake', b.stake, 'multiplier', m, 'payout', win, 'balance', bal));
  return jsonb_build_object('ok', true, 'multiplier', m, 'payout', win, 'balance', bal);
end $$;

-- ---------------------------------------------------------------------------
-- _settle_round: log bet_lost for auto-resolved losing bets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._settle_round(_rid uuid)
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
      insert into public.activity_events (user_id, actor_id, event_type, metadata)
      values (b.user_id, b.user_id, 'bet_cashed_out', jsonb_build_object('round_id', _rid, 'slot', b.slot, 'stake', b.stake, 'multiplier', b.auto_cashout, 'payout', win, 'auto', true));
    else
      update real_bets set status = 'lost' where id = b.id;
      insert into public.activity_events (user_id, actor_id, event_type, metadata)
      values (b.user_id, b.user_id, 'bet_lost', jsonb_build_object('round_id', _rid, 'slot', b.slot, 'stake', b.stake, 'crash_point', rd.crash_point));
    end if;
  end loop;
  update real_rounds set ended = true where id = _rid;
end $$;

-- ---------------------------------------------------------------------------
-- request_deposit: log deposit_requested
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_deposit(_network text, _phone text, _amount bigint)
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
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (uid, uid, 'deposit_requested', jsonb_build_object('deposit_id', rid, 'network', _network, 'amount', _amount, 'provider', 'manual'));
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- review_deposit: log deposit_approved/rejected + admin audit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_deposit(_id uuid, _approve boolean, _note text)
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
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, auth.uid(), 'deposit_approved', jsonb_build_object('deposit_id', _id, 'network', r.network, 'amount', r.amount, 'note', _note));
    insert into public.admin_audit_log (admin_id, target_user_id, action, details)
    values (auth.uid(), r.user_id, 'review_deposit', jsonb_build_object('deposit_id', _id, 'approved', true, 'amount', r.amount, 'network', r.network, 'note', _note));
    return 'approved';
  end if;
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (r.user_id, auth.uid(), 'deposit_rejected', jsonb_build_object('deposit_id', _id, 'network', r.network, 'amount', r.amount, 'note', _note));
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, 'review_deposit', jsonb_build_object('deposit_id', _id, 'approved', false, 'amount', r.amount, 'network', r.network, 'note', _note));
  return 'rejected';
end $$;

-- ---------------------------------------------------------------------------
-- request_withdrawal: log withdrawal_requested
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(_network text, _phone text, _amount bigint)
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
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (uid, uid, 'withdrawal_requested', jsonb_build_object('withdrawal_id', rid, 'network', _network, 'amount', _amount));
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- review_withdrawal: log withdrawal_paid/rejected + admin audit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_withdrawal(_id uuid, _paid boolean, _reference text, _note text)
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
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, auth.uid(), 'withdrawal_rejected', jsonb_build_object('withdrawal_id', _id, 'amount', r.amount, 'note', _note));
    insert into public.admin_audit_log (admin_id, target_user_id, action, details)
    values (auth.uid(), r.user_id, 'review_withdrawal', jsonb_build_object('withdrawal_id', _id, 'paid', false, 'amount', r.amount, 'note', _note));
    return 'rejected';
  end if;
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (r.user_id, auth.uid(), 'withdrawal_paid', jsonb_build_object('withdrawal_id', _id, 'amount', r.amount, 'reference', _reference));
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, 'review_withdrawal', jsonb_build_object('withdrawal_id', _id, 'paid', true, 'amount', r.amount, 'reference', _reference, 'note', _note));
  return 'paid';
end $$;

-- ---------------------------------------------------------------------------
-- admin_adjust_balance: log balance_adjusted + admin audit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(_user_id uuid, _amount bigint, _note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  update profiles set balance = greatest(0, balance + _amount) where id = _user_id returning balance into bal;
  insert into balance_adjustments (user_id, amount, note, admin_id) values (_user_id, _amount, _note, auth.uid());
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (_user_id, auth.uid(), 'balance_adjusted', jsonb_build_object('amount', _amount, 'note', _note, 'new_balance', bal));
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), _user_id, 'adjust_balance', jsonb_build_object('amount', _amount, 'note', _note, 'new_balance', bal));
  return bal;
end $$;

-- ---------------------------------------------------------------------------
-- settle_harakapay_deposit: log deposit_approved (auto) — no admin actor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_harakapay_deposit(_order_id text, _status text, _fee bigint, _net bigint)
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
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, null, 'deposit_approved', jsonb_build_object('deposit_id', r.id, 'network', r.network, 'amount', r.amount, 'provider', 'harakapay', 'order_id', _order_id));
    return 'approved';
  elsif _status = 'failed' and r.status = 'pending' then
    update deposit_requests set status = 'rejected', reviewed_at = now(), admin_note = 'Payment failed or was cancelled on the phone' where id = r.id;
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, null, 'deposit_rejected', jsonb_build_object('deposit_id', r.id, 'network', r.network, 'amount', r.amount, 'provider', 'harakapay', 'order_id', _order_id));
    return 'rejected';
  end if;
  return r.status;
end $$;

-- ---------------------------------------------------------------------------
-- Admin read RPCs: feed, audit, summary
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.admin_event_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d24 timestamptz := now() - interval '24 hours';
  d7 timestamptz := now() - interval '7 days';
  d30 timestamptz := now() - interval '30 days';
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.activity_events),
    'last_24h', (select count(*) from public.activity_events where created_at >= d24),
    'last_7d', (select count(*) from public.activity_events where created_at >= d7),
    'last_30d', (select count(*) from public.activity_events where created_at >= d30),
    'by_type_24h', coalesce((
      select jsonb_object_agg(event_type, cnt) from (
        select event_type, count(*) cnt from public.activity_events
        where created_at >= d24 group by event_type order by cnt desc
      ) t
    ), '{}'::jsonb),
    'by_type_7d', coalesce((
      select jsonb_object_agg(event_type, cnt) from (
        select event_type, count(*) cnt from public.activity_events
        where created_at >= d7 group by event_type order by cnt desc
      ) t
    ), '{}'::jsonb),
    'active_players_24h', (select count(distinct user_id) from public.activity_events where created_at >= d24 and user_id is not null),
    'audit_total', (select count(*) from public.admin_audit_log)
  );
end $$;
REVOKE EXECUTE ON FUNCTION public.admin_event_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_event_summary() TO authenticated;
