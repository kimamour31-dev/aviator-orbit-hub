alter table public.profiles add column promo_code text;
alter table public.profiles add column promo_bonus bigint not null default 0;

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
  select exists (
    select 1 from public.promo_codes
    where code = upper(trim(_code)) and active and (max_uses is null or uses < max_uses)
  )
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
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'phone', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name',
    promo.code,
    coalesce(promo.bonus, 0),
    coalesce(promo.bonus, 0)
  );
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

alter table public.game_settings add constraint game_settings_sane check (
  house_edge >= 0 and house_edge < 1 and min_bet > 0 and max_bet >= min_bet and max_multiplier >= 1 and max_payout > 0
);
alter table public.user_risk add constraint user_risk_sane check (
  (house_edge is null or (house_edge >= 0 and house_edge < 1)) and (max_bet is null or max_bet > 0)
);