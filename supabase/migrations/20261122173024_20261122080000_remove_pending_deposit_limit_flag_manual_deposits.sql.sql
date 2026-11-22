/*
# Remove pending-deposit limit and flag non-HarakaPay approved deposits

## Purpose
1. Players can now deposit even if they already have pending deposit requests.
   The old 3-pending limit was blocking legitimate deposits and creating friction.
2. Any approved deposit that was NOT processed through HarakaPay (provider IS NULL
   or provider != 'harakapay') gets a fraud flag so the operator can review it.
3. The review_deposit function (manual admin approval) also raises a flag, since
   manual approval bypasses HarakaPay's automatic payment verification.

## Changes
- `request_deposit`: removed the `count(*) >= 3` pending check. Deposits now
  always proceed regardless of how many pending deposits the user has.
- `review_deposit`: when an admin manually approves a deposit, a fraud flag of
  type 'manual_deposit' (severity 'medium') is raised automatically.
- A one-time backfill marks all existing approved deposits without a HarakaPay
  provider with a fraud flag so the operator can review them.

## Security
- No RLS or policy changes. All existing grants and policies remain intact.
- The fraud flag is raised by the SECURITY DEFINER function, not by the client.
*/

-- 1. Remove the pending-deposit limit from request_deposit
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
  insert into deposit_requests (user_id, network, phone, amount) values (uid, _network, '255' || d, _amount) returning id into rid;
  return rid;
end $$;
REVOKE EXECUTE ON FUNCTION public.request_deposit(text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(text, text, bigint) TO authenticated;

-- 2. review_deposit: raise a fraud flag when an admin manually approves a deposit
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
    values (r.user_id, r.amount, coalesce(_note, 'Manual deposit approval'), auth.uid());
    insert into public.fraud_flags (user_id, flag_type, severity, details)
    values (r.user_id, 'manual_deposit', 'medium',
            jsonb_build_object('deposit_id', r.id, 'amount', r.amount, 'network', r.network, 'approved_by', auth.uid()));
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, auth.uid(), 'deposit_approved',
            jsonb_build_object('amount', r.amount, 'network', r.network, 'manual', true));
  else
    insert into public.activity_events (user_id, actor_id, event_type, metadata)
    values (r.user_id, auth.uid(), 'deposit_rejected',
            jsonb_build_object('amount', r.amount, 'network', r.network, 'note', _note));
  end if;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, 'review_deposit',
          jsonb_build_object('approved', _approve, 'amount', r.amount, 'network', r.network, 'note', _note));
  return case when _approve then 'approved' else 'rejected' end;
end $$;
REVOKE EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text) TO authenticated;

-- 3. Backfill: flag all existing approved deposits that were NOT processed through HarakaPay
INSERT INTO public.fraud_flags (user_id, flag_type, severity, details)
SELECT d.user_id, 'manual_deposit', 'medium',
       jsonb_build_object('deposit_id', d.id, 'amount', d.amount, 'network', d.network,
                          'approved_at', d.reviewed_at, 'provider', d.provider)
FROM deposit_requests d
WHERE d.status = 'approved'
  AND (d.provider IS NULL OR d.provider <> 'harakapay')
  AND NOT EXISTS (
    SELECT 1 FROM public.fraud_flags f
    WHERE f.user_id = d.user_id
      AND f.flag_type = 'manual_deposit'
      AND f.details->>'deposit_id' = d.id::text
  );
