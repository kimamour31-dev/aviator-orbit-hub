ALTER TABLE public.balance_adjustments ALTER COLUMN admin_id DROP NOT NULL;

ALTER TABLE public.deposit_requests
  ADD COLUMN provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','harakapay')),
  ADD COLUMN provider_order_id text UNIQUE,
  ADD COLUMN provider_fee bigint,
  ADD COLUMN provider_net bigint;

CREATE OR REPLACE FUNCTION public.settle_harakapay_deposit(_order_id text, _status text, _fee bigint, _net bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare r deposit_requests;
begin
  select * into r from deposit_requests
    where provider = 'harakapay' and provider_order_id = _order_id for update;
  if not found then return 'not_found'; end if;
  if r.status = 'approved' then return 'approved'; end if;
  if _status = 'completed' then
    update deposit_requests
      set status = 'approved', reviewed_at = now(), provider_fee = _fee, provider_net = _net,
          admin_note = 'Paid via HarakaPay ' || _order_id
      where id = r.id;
    update profiles set balance = balance + r.amount where id = r.user_id;
    insert into balance_adjustments (user_id, amount, note, admin_id)
    values (r.user_id, r.amount, 'HarakaPay deposit ' || r.network || ' ' || r.phone || ' — ' || _order_id, null);
    return 'approved';
  elsif _status = 'failed' and r.status = 'pending' then
    update deposit_requests
      set status = 'rejected', reviewed_at = now(), admin_note = 'Payment failed or was cancelled on the phone'
      where id = r.id;
    return 'rejected';
  end if;
  return r.status;
end $$;

REVOKE ALL ON FUNCTION public.settle_harakapay_deposit(text, text, bigint, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_harakapay_deposit(text, text, bigint, bigint) TO service_role;

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
  if r.provider = 'harakapay' then raise exception 'HarakaPay deposits are confirmed automatically by HarakaPay'; end if;
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

REVOKE ALL ON FUNCTION public.review_deposit(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text) TO authenticated;