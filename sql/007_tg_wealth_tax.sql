-- 007: награда за подписку на Telegram-канал @pixel_grad + прогрессивный налог на роскошь.
-- Применять в Supabase → SQL Editor целиком. Значения синхронны с js/config.js (TG, WEALTH_TAX).

-- ===== 1. Разовая награда за подписку на канал =====
alter table public.profiles add column if not exists tg_bonus boolean not null default false;

create or replace function public.claim_tg() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); p profiles;
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  update profiles set tg_bonus = true, gems = gems + 50
    where id = u and not tg_bonus returning * into p;
  if not found then raise exception 'Награда за подписку уже получена'; end if;
  return p;
end $$;
revoke all on function public.claim_tg() from public, anon;
grant execute on function public.claim_tg() to authenticated;

-- ===== 2. Налог на роскошь (прогрессивный, сверх базового prop_tax) =====
-- Объекты игрока (land/apt/office), кроме квартиры-дома, сортируются от дешёвого к дорогому.
-- 1–3-й: 0%, 4–6-й: 1%, 7–10-й: 2%, 11-й и дальше: 3% стоимости объекта в сутки. Всё идёт в казну.
-- Если денег не хватает — списывается, сколько есть (в минус не уходит).
create or replace function public._wealth_rate(n bigint) returns numeric language sql immutable as $$
  select case when n <= 3 then 0 when n <= 6 then 0.01 when n <= 10 then 0.02 else 0.03 end::numeric $$;

create or replace function public.wealth_tax() returns numeric
language plpgsql security definer set search_path = public as $$
declare r record; pay numeric; total numeric := 0;
begin
  for r in
    with ranked as (
      select pr.owner, pr.price,
             row_number() over (partition by pr.owner order by pr.price, pr.id) n
      from props pr join profiles pf on pf.id = pr.owner
      where pr.kind in ('land','apt','office') and pr.id is distinct from pf.home_unit)
    select owner, round(sum(price * _wealth_rate(n))) amt, count(*) cnt
    from ranked group by owner having count(*) > 3
  loop
    select least(r.amt, greatest(money, 0)) into pay from profiles where id = r.owner for update;
    if pay > 0 then
      update profiles set money = money - pay where id = r.owner;
      total := total + pay;
      insert into events(uid, kind, txt, data)
        values (r.owner, 'tax', (select nick from profiles where id = r.owner) || ' заплатил налог на роскошь ' || pay || '💰 (' || r.cnt || ' объектов)', jsonb_build_object('amt', pay, 'cnt', r.cnt));
    end if;
  end loop;
  if total > 0 then update city set treasury = treasury + total where id = 1; end if;
  return total;
end $$;
-- только для cron, из API не вызывается
revoke all on function public.wealth_tax() from public, anon, authenticated;
revoke all on function public._wealth_rate(bigint) from anon, authenticated;

-- раз в сутки, сразу после базового налога (city_daily в 00:00 UTC)
select cron.schedule('pixelgrad_wealth_tax', '10 0 * * *', 'select public.wealth_tax()');
