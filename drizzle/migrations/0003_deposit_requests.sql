CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  network text NOT NULL CHECK (network IN ('mpesa','tigo','airtel','halopesa')),
  phone text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 1000 AND amount <= 10000000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deposit_requests_user_idx ON public.deposit_requests (user_id, created_at DESC);
CREATE INDEX deposit_requests_status_idx ON public.deposit_requests (status, created_at DESC);

GRANT SELECT ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;

ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin deposits" ON public.deposit_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.request_deposit(_network text, _phone text, _amount bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  uid uuid := auth.uid();
  d text;
  rid uuid;
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
  insert into deposit_requests (user_id, network, phone, amount)
  values (uid, _network, '255' || d, _amount) returning id into rid;
  return rid;
end $$;

CREATE OR REPLACE FUNCTION public.review_deposit(_id uuid, _approve boolean, _note text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare r deposit_requests;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  select * into r from deposit_requests where id = _id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if r.status <> 'pending' then raise exception 'This deposit was already reviewed'; end if;
  update deposit_requests
    set status = case when _approve then 'approved' else 'rejected' end,
        admin_note = nullif(trim(coalesce(_note,'')), ''),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = _id;
  if _approve then
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id)
    values (r.user_id, r.amount, 'Deposit ' || r.network || ' ' || r.phone || coalesce(' — ' || nullif(trim(coalesce(_note,'')), ''), ''), auth.uid());
    return 'approved';
  end if;
  return 'rejected';
end $$;

REVOKE ALL ON FUNCTION public.request_deposit(text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(text, text, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.review_deposit(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text) TO authenticated;