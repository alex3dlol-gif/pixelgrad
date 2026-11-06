-- 012: реферальная система «Пригласи друга». Значения синхронны с js/config.js (REF).
-- Деньги пригласившему НЕ даём (в экономике их и так много). Награды — то, чего за монеты не купить:
--   • за каждого друга, дошедшего до 5 ур.: +40💎, 2🏛️ мрамора, 1⚙️ запчасти (не больше 5 наград в сутки);
--   • 1 друг — скин «Берет вербовщика», 5 — титул «Градообразующий», 15 — скин «Золотая каска» (не продаются);
--   • наставничество: 10% опыта друга в его первые 7 дней;
--   • скидка налога на роскошь: −10% за каждые 3 друга, максимум −50%.
-- Новичок: ×1.5 опыта 3 дня после привязки и +300💰 на 5 уровне.
-- Засчёт только на 5 уровне — фейковые аккаунты (почта не подтверждается) ничего не дают сразу.

alter table public.profiles add column if not exists ref_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists ref_at timestamptz;        -- когда привязан
alter table public.profiles add column if not exists ref_done_at timestamptz;   -- когда засчитан (5 ур.)
alter table public.profiles add column if not exists ref_count int not null default 0;
create index if not exists profiles_ref_by on public.profiles(ref_by);

-- Привязка: только новый аккаунт (≤48 ч, ниже 5 ур.), один раз, не сам себя и не «по кругу».
create or replace function public.set_referrer(p_nick text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); p profiles; m profiles;
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  select * into p from profiles where id = u for update;
  if not found then raise exception 'Сначала создай персонажа'; end if;
  if p.ref_by is not null then raise exception 'Пригласивший уже указан'; end if;
  if p.created_at < now() - interval '48 hours' or _lvl(p.xp) >= 5 then
    raise exception 'Указать пригласившего можно только в первые 48 часов игры'; end if;
  select * into m from profiles where lower(nick) = lower(trim(p_nick));
  if not found then raise exception 'Игрок «%» не найден', p_nick; end if;
  if m.id = u then raise exception 'Нельзя пригласить самого себя'; end if;
  if m.ref_by = u then raise exception 'Этот игрок сам пришёл по твоей ссылке'; end if;
  update profiles set ref_by = m.id, ref_at = now() where id = u returning * into p;
  insert into events(uid, kind, txt, data)
    values (m.id, 'ref', p.nick || ' пришёл в город по приглашению ' || m.nick, jsonb_build_object('from', u));
  return p;
end $$;
revoke all on function public.set_referrer(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;

-- Бонус опыта новичку, доля наставнику и засчёт на 5 уровне.
-- Имя триггера «profiles_zref» — срабатывает после profiles_xp (порядок BEFORE-триггеров по алфавиту).
create or replace function public._ref_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int; m profiles; today int;
begin
  if new.ref_by is null or coalesce(current_setting('pixelgrad.ref_inner', true), '') = '1' then return new; end if;
  d := new.xp - old.xp;
  if d > 0 then
    if new.ref_at > now() - interval '3 days' then
      new.xp := new.xp + d / 2; d := d + d / 2; end if;
    if new.created_at > now() - interval '7 days' and d >= 10 then
      perform set_config('pixelgrad.ref_inner', '1', true);
      update profiles set xp = xp + d / 10 where id = new.ref_by;
      perform set_config('pixelgrad.ref_inner', '', true);
    end if;
  end if;
  if new.ref_done_at is null and _lvl(new.xp) >= 5 then
    new.ref_done_at := now();
    new.money := new.money + 300;
    select count(*) into today from profiles
      where ref_by = new.ref_by and ref_done_at > now() - interval '24 hours' and id <> new.id;
    perform set_config('pixelgrad.ref_inner', '1', true);
    update profiles set
      ref_count = ref_count + 1,
      gems = gems + case when today < 5 then 40 else 0 end,
      inv = case when today < 5 then _add(_add(inv, 'marble', 2), 'parts', 1) else inv end,
      skins = skins
        || case when not skins ? 'beret' then '["beret"]'::jsonb else '[]'::jsonb end
        || case when ref_count + 1 >= 15 and not skins ? 'goldhelm' then '["goldhelm"]'::jsonb else '[]'::jsonb end
      where id = new.ref_by returning * into m;
    perform set_config('pixelgrad.ref_inner', '', true);
    if m.id is not null then
      insert into events(uid, kind, txt, data)
        values (m.id, 'ref', new.nick || ' дорос до 5 уровня — ' || m.nick || ' получает награду за приглашение ('
          || m.ref_count || ')', jsonb_build_object('friend', new.id, 'cnt', m.ref_count, 'paid', today < 5));
    end if;
  end if;
  return new;
end $$;
create or replace trigger profiles_zref before update on public.profiles for each row execute function public._ref_xp();

-- Налог на роскошь: та же функция, что в 007, плюс скидка за друзей.
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
    select rk.owner, round(sum(rk.b * _wealth_rate(rk.n)) * (1 - least(0.5, floor(max(pf.ref_count) / 3) * 0.1))) amt, count(*) cnt
    from ranked rk join profiles pf on pf.id = rk.owner group by rk.owner having count(*) > 3
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
  update profiles set money = money - least(tax_debt, greatest(money,0)), tax_debt = tax_debt - least(tax_debt, greatest(money,0))
    where tax_debt > 0 and money > 0 and id not in (select owner from props where owner is not null group by owner having count(*) > 3);
  if total > 0 then update city set treasury = treasury + total where id = 1; end if;
  return total;
end $$;
revoke all on function public.wealth_tax() from public, anon, authenticated;
