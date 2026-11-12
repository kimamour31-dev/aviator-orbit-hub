ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS payment_numbers jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_payment_numbers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select coalesce((select payment_numbers from game_settings where id = 1), '{}'::jsonb) $$;
REVOKE ALL ON FUNCTION public.get_payment_numbers() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_numbers() TO authenticated;

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  network text NOT NULL CHECK (network IN ('mpesa','tigo','airtel','halopesa')),
  phone text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 1000 AND amount <= 10000000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  reference text,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX withdrawal_requests_user_idx ON public.withdrawal_requests (user_id, created_at DESC);
CREATE INDEX withdrawal_requests_status_idx ON public.withdrawal_requests (status, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin withdrawals" ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.request_withdrawal(_network text, _phone text, _amount bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  insert into withdrawal_requests (user_id, network, phone, amount)
  values (uid, _network, '255' || d, _amount) returning id into rid;
  return rid;
end $$;

CREATE OR REPLACE FUNCTION public.review_withdrawal(_id uuid, _paid boolean, _reference text, _note text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare r withdrawal_requests;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  select * into r from withdrawal_requests where id = _id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if r.status <> 'pending' then raise exception 'This withdrawal was already reviewed'; end if;
  update withdrawal_requests
    set status = case when _paid then 'paid' else 'rejected' end,
        reference = nullif(trim(coalesce(_reference,'')), ''),
        admin_note = nullif(trim(coalesce(_note,'')), ''),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = _id;
  if not _paid then
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id)
    values (r.user_id, r.amount, 'Withdrawal declined, refunded', auth.uid());
    return 'rejected';
  end if;
  return 'paid';
end $$;

REVOKE ALL ON FUNCTION public.request_withdrawal(text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, text, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.review_withdrawal(uuid, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, boolean, text, text) TO authenticated;