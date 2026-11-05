-- 007: награда за подписку на Telegram-канал @pixel_grad + прогрессивный налог на роскошь.
-- Применено в базе 2026-11-05. Значения синхронны с js/config.js (TG, WEALTH_TAX).

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

-- ===== 2. Налог на роскошь + лимит владений =====
-- Объекты игрока (land/apt/office), кроме квартиры-дома, сортируются от дешёвого к дорогому.
-- База налога = max(цена, 1000) + стоимость стройки × уровень здания (чтобы дешёвая земля с бизнесом тоже облагалась).
-- 1–3-й: 0%, 4–6-й: 1%, 7–10-й: 2%, 11-й и дальше: 3% базы в сутки. Всё идёт в казну.
-- Не хватает денег — остаток копится в tax_debt; пока есть долг, новые объекты купить нельзя.
-- Жёсткий лимит: не больше 15 объектов на игрока (включая дом).
alter table public.profiles add column if not exists tax_debt numeric not null default 0;

create or replace function public._wealth_rate(n bigint) returns numeric language sql immutable as $$
  select case when n <= 3 then 0 when n <= 6 then 0.01 when n <= 10 then 0.02 else 0.03 end::numeric $$;

create or replace function public.wealth_tax() returns numeric
language plpgsql security definer set search_path = public as $$
declare r record; due numeric; pay numeric; m numeric; total numeric := 0;
begin
  for r in
    with base as (
      select pr.owner, pr.id,
             greatest(pr.price, 1000) + coalesce(rc.cost, 0) * coalesce(pr.level, 1) b
      from props pr join profiles pf on pf.id = pr.owner
      left join recipes rc on rc.building = pr.building
      where pr.kind in ('land','apt','office') and pr.id is distinct from pf.home_unit),
    ranked as (select owner, b, row_number() over (partition by owner order by b, id) n from base)
    select owner, round(sum(b * _wealth_rate(n))) amt, count(*) cnt
    from ranked group by owner having count(*) > 3
  loop
    select money into m from profiles where id = r.owner for update;
    due := r.amt + (select tax_debt from profiles where id = r.owner);
    pay := least(due, greatest(m, 0));
    update profiles set money = money - pay, tax_debt = due - pay where id = r.owner;
    total := total + pay;
    insert into events(uid, kind, txt, data)
      values (r.owner, 'tax', (select nick from profiles where id = r.owner) || ' заплатил налог на роскошь ' || pay || '💰 (' || r.cnt || ' объектов)'
        || case when due > pay then ', долг ' || (due - pay) || '💰' else '' end,
        jsonb_build_object('amt', pay, 'cnt', r.cnt, 'debt', due - pay));
  end loop;
  -- у кого объектов стало ≤3, старый долг всё равно гасится из денег
  update profiles set money = money - least(tax_debt, greatest(money,0)), tax_debt = tax_debt - least(tax_debt, greatest(money,0))
    where tax_debt > 0 and money > 0 and id not in (select owner from props where owner is not null group by owner having count(*) > 3);
  if total > 0 then update city set treasury = treasury + total where id = 1; end if;
  return total;
end $$;
-- только для cron, из API не вызывается
revoke all on function public.wealth_tax() from public, anon, authenticated;

-- Лимит владений и запрет покупок при налоговом долге (отдельный триггер, _gate не трогаем).
-- В фоновых задачах (auth.uid() is null — аукцион, cron) не мешаем, чтобы не ломать тик.
create or replace function public._prop_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare cnt int; d numeric;
begin
  if new.owner is not null and old.owner is distinct from new.owner and auth.uid() is not null then
    select tax_debt into d from profiles where id = new.owner;
    if d > 0 then raise exception 'Сначала погаси налоговый долг: % 💰 (спишется ночью из денег)', round(d); end if;
    select count(*) into cnt from props where owner = new.owner and kind in ('land','apt','office');
    if cnt >= 15 then raise exception 'Лимит: не больше 15 объектов на игрока. Продай что-нибудь, чтобы купить новое'; end if;
  end if;
  return new;
end $$;
create or replace trigger props_limit before update on public.props for each row execute function public._prop_limit();

-- раз в сутки, сразу после базового налога (city_daily в 00:00 UTC)
select cron.schedule('pixelgrad_wealth_tax', '10 0 * * *', 'select public.wealth_tax()');
