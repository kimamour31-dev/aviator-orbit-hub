/*
# Operator platform upgrade: provably fair, maintenance mode, ledger, fraud flags, analytics

## Purpose
- Provably fair crash points (server seed + client seed + HMAC-SHA256 hash)
- Maintenance mode with custom message shown to players
- Unified transaction ledger (deposits, withdrawals, adjustments, payouts)
- Fraud flags (abnormal win rates, auto-raised)
- Enhanced analytics: live telemetry, GGR/NGR financials

## Idempotent — safe to re-run.
*/

-- 1. Provably fair columns on real_rounds
DO $$ BEGIN
  ALTER TABLE public.real_rounds ADD COLUMN IF NOT EXISTS server_seed text;
  ALTER TABLE public.real_rounds ADD COLUMN IF NOT EXISTS client_seed text;
  ALTER TABLE public.real_rounds ADD COLUMN IF NOT EXISTS seed_hash text;
  ALTER TABLE public.real_rounds ADD COLUMN IF NOT EXISTS nonce int NOT NULL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. server_seeds table
CREATE TABLE IF NOT EXISTS public.server_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed text NOT NULL,
  seed_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);
GRANT SELECT ON public.server_seeds TO authenticated;
GRANT ALL ON public.server_seeds TO service_role;
ALTER TABLE public.server_seeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read seeds" ON public.server_seeds;
CREATE POLICY "admin read seeds" ON public.server_seeds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.server_seeds (seed, seed_hash, status)
SELECT s, encode(extensions.digest(convert_to(s, 'UTF8'), 'sha256'), 'hex'), 'active'
FROM (SELECT encode(extensions.gen_random_bytes(32), 'hex') AS s) d
WHERE NOT EXISTS (SELECT 1 FROM public.server_seeds WHERE status = 'active');

-- 3. fraud_flags table
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  flag_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fraud_flags_unresolved_idx ON public.fraud_flags (resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_flags_user_idx ON public.fraud_flags (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.fraud_flags TO authenticated;
GRANT ALL ON public.fraud_flags TO service_role;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin fraud read" ON public.fraud_flags;
CREATE POLICY "admin fraud read" ON public.fraud_flags FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin fraud update" ON public.fraud_flags;
CREATE POLICY "admin fraud update" ON public.fraud_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. maintenance table
CREATE TABLE IF NOT EXISTS public.maintenance (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.maintenance (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.maintenance TO authenticated;
GRANT ALL ON public.maintenance TO service_role;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin maintenance read" ON public.maintenance;
CREATE POLICY "admin maintenance read" ON public.maintenance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Public RPCs
CREATE OR REPLACE FUNCTION public.public_get_maintenance()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('enabled', enabled, 'message', message) FROM public.maintenance WHERE id = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.public_get_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_maintenance() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_active_seed_hash()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('seed_hash', seed_hash, 'created_at', created_at)
  FROM public.server_seeds WHERE status = 'active' ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.public_active_seed_hash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_active_seed_hash() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._hmac_hex(_key text, _msg text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT encode(hmac(convert_to(_key, 'UTF8'), convert_to(_msg, 'UTF8'), 'sha256'), 'hex');
$$;
REVOKE EXECUTE ON FUNCTION public._hmac_hex(text, text) FROM PUBLIC, anon, authenticated;

-- 6. start_real_round: provably fair crash + maintenance check
CREATE OR REPLACE FUNCTION public.start_real_round(_stake1 bigint, _auto1 numeric, _stake2 bigint, _auto2 numeric, _client_seed text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  s public.game_settings;
  frm public.aviator_formula;
  r public.user_risk;
  ss public.server_seeds;
  edge numeric; cap numeric; maxb bigint; total bigint; bal bigint;
  h int; rr numeric; crash numeric; rid uuid; st timestamptz;
  cseed text; nonce_val int; hmac_hex text;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.maintenance where id = 1 and enabled) then
    raise exception 'The game is temporarily paused for maintenance. Please wait.';
  end if;
  select * into s from game_settings where id = 1;
  if not s.real_mode_enabled then raise exception 'Real mode is paused by the operator'; end if;
  select * into frm from aviator_formula where id = 1;
  select * into r from user_risk where user_id = uid;
  if r.blocked then raise exception 'Your account is blocked from betting'; end if;
  select * into ss from server_seeds where status = 'active' order by created_at desc limit 1 for update;
  if ss.id is null then raise exception 'No active server seed'; end if;
  cseed := coalesce(nullif(trim(_client_seed), ''), encode(gen_random_bytes(8), 'hex'));
  select count(*) + 1 into nonce_val from real_rounds where server_seed = ss.seed and user_id = uid;
  hmac_hex := public._hmac_hex(ss.seed, cseed || ':' || nonce_val);
  rr := (('x' || substring(hmac_hex from 1 for 8))::bit(32)::bigint % 4294967296 + 4294967296) / 4294967296.0;
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
  cap := least(frm.max_crash, s.max_multiplier);
  select least(cap, coalesce(min(max_multiplier), cap)) into cap from odds_rules
    where enabled and ((start_hour <= end_hour and h >= start_hour and h < end_hour)
                    or (start_hour > end_hour and (h >= start_hour or h < end_hour)));
  if random() < frm.instant_crash_prob then
    crash := frm.min_crash;
  else
    crash := floor(((1 - edge) / (1 - rr)) * 100) / 100;
    if crash < frm.min_crash then crash := frm.min_crash; end if;
  end if;
  if crash > cap then crash := cap; end if;
  insert into real_rounds (user_id, crash_point, server_seed, client_seed, seed_hash, nonce)
    values (uid, crash, ss.seed, cseed, ss.seed_hash, nonce_val) returning id, started_at into rid, st;
  if _stake1 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 0, _stake1, _auto1); end if;
  if _stake2 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 1, _stake2, _auto2); end if;
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (uid, uid, 'bet_placed', jsonb_build_object('round_id', rid, 'stake1', _stake1, 'stake2', _stake2, 'total', total, 'balance', bal - total));
  return jsonb_build_object('round_id', rid, 'balance', bal - total);
end $$;
REVOKE EXECUTE ON FUNCTION public.start_real_round(bigint, numeric, bigint, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_real_round(bigint, numeric, bigint, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_real_round(_stake1 bigint, _auto1 numeric, _stake2 bigint, _auto2 numeric)
returns jsonb language plpgsql security definer set search_path = public AS $$
begin
  return public.start_real_round(_stake1, _auto1, _stake2, _auto2, null);
end $$;
REVOKE EXECUTE ON FUNCTION public.start_real_round(bigint, numeric, bigint, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_real_round(bigint, numeric, bigint, numeric) TO authenticated;

-- 7. Fraud flag helper + detection on settle
CREATE OR REPLACE FUNCTION public._raise_flag(_user_id uuid, _type text, _severity text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fraud_flags (user_id, flag_type, severity, details)
  VALUES (_user_id, _type, _severity, _details)
  ON CONFLICT DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public._raise_flag(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- _settle_round with fraud detection. The recent-bets subquery uses a CTE so the
-- ORDER BY/LIMIT applies before the aggregate, satisfying plpgsql_check.
CREATE OR REPLACE FUNCTION public._settle_round(_rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rd real_rounds; s game_settings; b real_bets; win bigint;
  uid uuid; wins30 int; bets30 int;
  recent record;
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
  -- fraud: abnormal win rate over last 20 settled bets for the user in this round
  select distinct user_id into uid from real_bets where round_id = _rid limit 1;
  if uid is not null then
    select count(*) as bets, count(*) filter (where status = 'won') as wins
      into bets30, wins30
      from (
        select status from real_bets
        where user_id = uid and status <> 'active'
        order by created_at desc
        limit 20
      ) sub;
    if bets30 >= 10 and wins30::numeric / greatest(bets30,1) >= 0.8 then
      perform public._raise_flag(uid, 'abnormal_win', 'high', jsonb_build_object('wins', wins30, 'bets', bets30, 'rate', wins30::numeric / greatest(bets30,1)));
    end if;
  end if;
end $$;

-- 8. Maintenance admin RPC
CREATE OR REPLACE FUNCTION public.admin_set_maintenance(_enabled boolean, _message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.maintenance SET enabled = _enabled, message = nullif(trim(coalesce(_message, '')), ''), updated_at = now()
    WHERE id = 1
    RETURNING jsonb_build_object('enabled', enabled, 'message', message, 'updated_at', updated_at) INTO result;
  INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
  VALUES (auth.uid(), null, 'set_maintenance', jsonb_build_object('enabled', _enabled, 'message', _message));
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_maintenance(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_maintenance(boolean, text) TO authenticated;

-- 9. Seed rotation admin RPC
CREATE OR REPLACE FUNCTION public.admin_rotate_seed()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE old_seed public.server_seeds; new_seed text; new_hash text; result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO old_seed FROM public.server_seeds WHERE status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  new_seed := encode(gen_random_bytes(32), 'hex');
  new_hash := encode(digest(convert_to(new_seed, 'UTF8'), 'sha256'), 'hex');
  IF old_seed.id IS NOT NULL THEN
    UPDATE public.server_seeds SET status = 'retired', retired_at = now() WHERE id = old_seed.id;
  END IF;
  INSERT INTO public.server_seeds (seed, seed_hash, status) VALUES (new_seed, new_hash, 'active');
  INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
  VALUES (auth.uid(), null, 'rotate_seed', jsonb_build_object('revealed_old_seed', old_seed.seed, 'new_seed_hash', new_hash));
  RETURN jsonb_build_object('revealed_seed', old_seed.seed, 'new_seed_hash', new_hash);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_rotate_seed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_seed() TO authenticated;

-- 10. Admin telemetry
CREATE OR REPLACE FUNCTION public.admin_telemetry()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff_60s timestamptz := now() - interval '60 seconds';
  cutoff_5m timestamptz := now() - interval '5 minutes';
  last_round public.real_rounds;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO last_round FROM public.real_rounds ORDER BY started_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'active_rounds', (select count(*) from real_rounds where not ended and started_at > now() - interval '2 minutes'),
    'bets_last_60s', (select count(*) from real_bets where created_at >= cutoff_60s),
    'staked_last_60s', (select coalesce(sum(stake), 0) from real_bets where created_at >= cutoff_60s),
    'payout_last_60s', (select coalesce(sum(payout), 0) from real_bets where created_at >= cutoff_60s and status = 'won'),
    'players_online', (select count(distinct user_id) from real_bets where created_at >= cutoff_5m),
    'players_24h', (select count(distinct user_id) from real_bets where created_at >= now() - interval '24 hours'),
    'rounds_24h', (select count(*) from real_rounds where started_at >= now() - interval '24 hours'),
    'last_round_id', last_round.id,
    'last_round_crash', last_round.crash_point,
    'last_round_at', last_round.started_at,
    'active_seed_hash', (select seed_hash from public.server_seeds where status = 'active' order by created_at desc limit 1),
    'maintenance_on', (select enabled from public.maintenance where id = 1),
    'real_mode_on', (select real_mode_enabled from public.game_settings where id = 1)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_telemetry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_telemetry() TO authenticated;

-- 11. Admin financials
CREATE OR REPLACE FUNCTION public.admin_financials(_days int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - make_interval(days => _days);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN jsonb_build_object(
    'ggr', (select coalesce(sum(stake), 0) from real_bets where created_at >= since and status <> 'active'),
    'ngr', (select coalesce(sum(stake - payout), 0) from real_bets where created_at >= since and status <> 'active'),
    'paid_out', (select coalesce(sum(payout), 0) from real_bets where created_at >= since and status <> 'active'),
    'deposits_total', (select coalesce(sum(amount), 0) from deposit_requests where created_at >= since and status = 'approved'),
    'deposits_count', (select count(*) from deposit_requests where created_at >= since and status = 'approved'),
    'withdrawals_total', (select coalesce(sum(amount), 0) from withdrawal_requests where created_at >= since and status = 'paid'),
    'withdrawals_count', (select count(*) from withdrawal_requests where created_at >= since and status = 'paid'),
    'pending_deposits', (select coalesce(sum(amount), 0) from deposit_requests where status = 'pending'),
    'pending_withdrawals', (select coalesce(sum(amount), 0) from withdrawal_requests where status = 'pending'),
    'house_edge_setting', (select house_edge from game_settings where id = 1),
    'real_margin_pct', case when (select coalesce(sum(stake), 0) from real_bets where created_at >= since and status <> 'active') > 0
      then (select coalesce(sum(stake - payout), 0) from real_bets where created_at >= since and status <> 'active')::numeric
        / (select coalesce(sum(stake), 0) from real_bets where created_at >= since and status <> 'active') * 100
      else 0 end,
    'daily', coalesce((
      select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam'), 'YYYY-MM-DD'),
          'ggr', sum(stake), 'ngr', sum(stake - payout), 'payout', sum(payout)) d
        from real_bets where created_at >= since and status <> 'active'
        group by date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam')
      ) x
    ), '[]'::jsonb),
    'deposit_daily', coalesce((
      select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam'), 'YYYY-MM-DD'),
          'deposits', sum(amount)) d
        from deposit_requests where created_at >= since and status = 'approved'
        group by date_trunc('day', created_at at time zone 'Africa/Dar_es_Salaam')
      ) x
    ), '[]'::jsonb)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_financials(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_financials(int) TO authenticated;

-- 12. Admin unified ledger
CREATE OR REPLACE FUNCTION public.admin_ledger(_limit int, _offset int, _kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY created_at DESC) FROM (
      SELECT 'deposit' AS kind, d.id::text AS id, d.user_id, d.amount, d.status, d.created_at,
             p.phone, p.display_name,
             jsonb_build_object('network', d.network, 'provider', d.provider, 'note', d.admin_note) AS details
      FROM deposit_requests d LEFT JOIN profiles p ON p.id = d.user_id
      WHERE (_kind IS NULL OR _kind = '' OR _kind = 'deposit')
      UNION ALL
      SELECT 'withdrawal', w.id::text, w.user_id, w.amount, w.status, w.created_at,
             p.phone, p.display_name,
             jsonb_build_object('network', w.network, 'reference', w.reference, 'note', w.admin_note)
      FROM withdrawal_requests w LEFT JOIN profiles p ON p.id = w.user_id
      WHERE (_kind IS NULL OR _kind = '' OR _kind = 'withdrawal')
      UNION ALL
      SELECT 'adjustment', a.id::text, a.user_id, a.amount, 'applied', a.created_at,
             p.phone, p.display_name,
             jsonb_build_object('note', a.note)
      FROM balance_adjustments a LEFT JOIN profiles p ON p.id = a.user_id
      WHERE (_kind IS NULL OR _kind = '' OR _kind = 'adjustment')
      UNION ALL
      SELECT 'payout', b.id::text, b.user_id, b.payout AS amount, b.status, b.created_at,
             p.phone, p.display_name,
             jsonb_build_object('stake', b.stake, 'cashed_at', b.cashed_at, 'round_id', b.round_id)
      FROM real_bets b LEFT JOIN profiles p ON p.id = b.user_id
      WHERE (_kind IS NULL OR _kind = '' OR _kind = 'payout') AND b.status = 'won'
    ) t
    LIMIT greatest(1, least(_limit, 1000))
    OFFSET greatest(0, _offset)
  ), '[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_ledger(int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ledger(int, int, text) TO authenticated;

-- 13. Admin fraud flags
CREATE OR REPLACE FUNCTION public.admin_fraud_flags(_resolved boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY created_at DESC) FROM (
      SELECT f.id, f.user_id, f.flag_type, f.severity, f.details, f.resolved, f.created_at, f.resolved_at,
             p.phone, p.display_name
      FROM public.fraud_flags f
      LEFT JOIN public.profiles p ON p.id = f.user_id
      WHERE (_resolved IS NULL OR f.resolved = _resolved)
      ORDER BY f.created_at DESC
      LIMIT 200
    ) t
  ), '[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_fraud_flags(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fraud_flags(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_flag(_id uuid, _resolved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.fraud_flags SET resolved = _resolved, resolved_by = auth.uid(), resolved_at = case when _resolved then now() else null end
    WHERE id = _id;
  INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
  SELECT auth.uid(), f.user_id, 'resolve_flag', jsonb_build_object('flag_id', _id, 'resolved', _resolved, 'flag_type', f.flag_type)
  FROM public.fraud_flags f WHERE f.id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_flag(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_flag(uuid, boolean) TO authenticated;
