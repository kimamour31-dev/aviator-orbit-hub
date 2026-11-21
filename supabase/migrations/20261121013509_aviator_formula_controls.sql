/*
# Aviator crash formula controls

## Purpose
Lets the operator fine-tune the math behind every Real-mode round beyond the
existing house edge. Currently the crash point is computed as
  crash = (1 - house_edge) / (1 - random()).
This migration adds a dedicated `aviator_formula` table (single row, like
game_settings) with four extra dials:

- `growth_per_ms` (numeric, default 0.00008) — how fast the multiplier climbs.
  Lower = slower, longer rounds; higher = faster, more volatile.
- `instant_crash_prob` (numeric, 0–0.2, default 0.03) — chance a round is forced
  to crash at exactly 1.00x (the plane "doesn't take off"). Adds edge and
  realism; 3% matches many crash games.
- `min_crash` (numeric, default 1.00) — lowest possible crash point. Raising it
  removes the lowest outcomes, making the game feel friendlier.
- `max_crash` (numeric, default 1000) — hard ceiling independent of time-of-day
  caps. The plane never flies above this even if no time cap is active.

The new RPCs `admin_get_formula()` / `admin_save_formula(...)` let the admin UI
read and write these values. `start_real_round` is updated to read them and
apply: instant-crash roll, clamp to [min_crash, max_crash], and the existing
house-edge formula. `public_get_formula()` (anon-readable) lets the client sync
its animation growth rate to the operator's setting.

## New table
- `aviator_formula` (id int pk = 1, single row)

## Security
- Admin-only read/write via RLS + has_role check.
- Public read on `public_get_formula()` so the client animation matches.
- service_role full access.

## Idempotent — safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.aviator_formula (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  growth_per_ms numeric NOT NULL DEFAULT 0.00008 CHECK (growth_per_ms > 0),
  instant_crash_prob numeric NOT NULL DEFAULT 0.03 CHECK (instant_crash_prob >= 0 AND instant_crash_prob <= 0.2),
  min_crash numeric NOT NULL DEFAULT 1.00 CHECK (min_crash >= 1),
  max_crash numeric NOT NULL DEFAULT 1000 CHECK (max_crash >= 1 AND max_crash >= min_crash),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.aviator_formula (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.aviator_formula TO authenticated;
GRANT ALL ON public.aviator_formula TO service_role;
ALTER TABLE public.aviator_formula ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read formula" ON public.aviator_formula;
CREATE POLICY "admin read formula"
ON public.aviator_formula FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin update formula" ON public.aviator_formula;
CREATE POLICY "admin update formula"
ON public.aviator_formula FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.public_get_formula()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'growth_per_ms', growth_per_ms,
    'min_crash', min_crash,
    'max_crash', max_crash
  ) FROM public.aviator_formula WHERE id = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.public_get_formula() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_formula() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_formula()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'growth_per_ms', f.growth_per_ms,
    'instant_crash_prob', f.instant_crash_prob,
    'min_crash', f.min_crash,
    'max_crash', f.max_crash,
    'updated_at', f.updated_at
  ) INTO result
  FROM public.aviator_formula f WHERE f.id = 1;
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_formula() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_formula() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_formula(
  _growth_per_ms numeric,
  _instant_crash_prob numeric,
  _min_crash numeric,
  _max_crash numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _growth_per_ms IS NULL OR _growth_per_ms <= 0 THEN RAISE EXCEPTION 'Growth rate must be above 0'; END IF;
  IF _instant_crash_prob IS NULL OR _instant_crash_prob < 0 OR _instant_crash_prob > 0.2 THEN
    RAISE EXCEPTION 'Instant crash chance must be between 0%% and 20%%';
  END IF;
  IF _min_crash IS NULL OR _min_crash < 1 THEN RAISE EXCEPTION 'Lowest crash point must be at least 1.00x'; END IF;
  IF _max_crash IS NULL OR _max_crash < 1 OR _max_crash < _min_crash THEN
    RAISE EXCEPTION 'Crash ceiling must be at least 1x and at least the lowest crash point';
  END IF;
  UPDATE public.aviator_formula
    SET growth_per_ms = _growth_per_ms,
        instant_crash_prob = _instant_crash_prob,
        min_crash = _min_crash,
        max_crash = _max_crash,
        updated_at = now()
    WHERE id = 1
    RETURNING jsonb_build_object(
      'growth_per_ms', growth_per_ms,
      'instant_crash_prob', instant_crash_prob,
      'min_crash', min_crash,
      'max_crash', max_crash,
      'updated_at', updated_at
    ) INTO result;
  INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
  VALUES (auth.uid(), null, 'save_formula', jsonb_build_object(
    'growth_per_ms', _growth_per_ms,
    'instant_crash_prob', _instant_crash_prob,
    'min_crash', _min_crash,
    'max_crash', _max_crash
  ));
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_save_formula(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_formula(numeric, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- start_real_round: apply formula dials (instant crash, min/max clamp)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_real_round(_stake1 bigint, _auto1 numeric, _stake2 bigint, _auto2 numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.game_settings;
  frm public.aviator_formula;
  r public.user_risk;
  edge numeric; cap numeric; maxb bigint; total bigint; bal bigint;
  h int; rr numeric; crash numeric; rid uuid; st timestamptz;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into s from game_settings where id = 1;
  if not s.real_mode_enabled then raise exception 'Real mode is paused by the operator'; end if;
  select * into frm from aviator_formula where id = 1;
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
  -- start from the formula ceiling, then apply the lower of time-of-day caps
  cap := least(frm.max_crash, s.max_multiplier);
  select least(cap, coalesce(min(max_multiplier), cap)) into cap from odds_rules
    where enabled and ((start_hour <= end_hour and h >= start_hour and h < end_hour)
                    or (start_hour > end_hour and (h >= start_hour or h < end_hour)));
  rr := random();
  -- instant-crash roll: with prob instant_crash_prob the round ends at min_crash
  if random() < frm.instant_crash_prob then
    crash := frm.min_crash;
  else
    crash := floor(((1 - edge) / (1 - rr)) * 100) / 100;
    if crash < frm.min_crash then crash := frm.min_crash; end if;
  end if;
  if crash > cap then crash := cap; end if;
  insert into real_rounds (user_id, crash_point) values (uid, crash) returning id, started_at into rid, st;
  if _stake1 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 0, _stake1, _auto1); end if;
  if _stake2 > 0 then insert into real_bets (round_id, user_id, slot, stake, auto_cashout) values (rid, uid, 1, _stake2, _auto2); end if;
  insert into public.activity_events (user_id, actor_id, event_type, metadata)
  values (uid, uid, 'bet_placed', jsonb_build_object('round_id', rid, 'stake1', _stake1, 'stake2', _stake2, 'total', total, 'balance', bal - total));
  return jsonb_build_object('round_id', rid, 'balance', bal - total);
end $$;
