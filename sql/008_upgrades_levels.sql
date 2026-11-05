-- 008: здания до 10 уровня + модули улучшений, уровни игрока до 30 (новая кривая XP), фикс энергии долгой смены.
-- Значения синхронны с js/config.js (BLV, MODS, xpFor, ENERGY, LONG).

-- ===== Уровни игрока: XP(L) = 100·(L−1)² + 20·max(0, L−10)³ — после 10-го растёт заметно медленнее =====
create or replace function public._xp_for(l int) returns int language sql immutable as $$
  select (100 * (l - 1) * (l - 1) + 20 * power(greatest(0, l - 10), 3))::int $$;
create or replace function public._lvl(x integer) returns integer language sql immutable set search_path to 'public' as $$
  select coalesce(max(l), 1) from generate_series(1, 60) l where public._xp_for(l) <= greatest(x, 0) $$;
-- энергия: +10 за уровень до 10-го (150), дальше +5 за уровень, максимум 250
create or replace function public._emax(x integer) returns numeric language sql immutable set search_path to 'public' as $$
  select (case when public._lvl(x) <= 10 then 60 + 10 * (public._lvl(x) - 1) else least(250, 150 + 5 * (public._lvl(x) - 10)) end)::numeric $$;

-- ===== Здания: уровни 1..10 =====
-- выпуск: ×(1+0.4·(ур−1)) до 5-го, дальше +0.2 за уровень (10-й = ×3.6)
create or replace function public._blv_mult(l int) returns numeric language sql immutable as $$
  select case when l <= 5 then 1 + 0.4 * (l - 1) else 2.6 + 0.2 * (l - 5) end::numeric $$;
-- уровень игрока для уровня здания
create or replace function public._blv_need(l int) returns int language sql immutable as $$
  select case when l <= 5 then l else (array[9,10,12,15,18])[l - 5] end $$;
-- работники: 3, +1 на 3/5/7/10 ур.
create or replace function public._blv_workers(l int) returns int language sql immutable as $$
  select 3 + (l >= 3)::int + (l >= 5)::int + (l >= 7)::int + (l >= 10)::int $$;

alter table public.props add column if not exists mods jsonb not null default '[]';

-- модули сбрасываются при сносе/смене здания
create or replace function public._mods_reset() returns trigger language plpgsql as $$
begin
  if new.building is distinct from old.building then new.mods := '[]'; end if;
  return new;
end $$;
create or replace trigger props_mods before update on public.props for each row execute function public._mods_reset();

-- склад: 100 + 50 за каждый уровень зданий + 200 за модуль «Склад»
create or replace function public._cap(u uuid) returns numeric language sql stable set search_path to 'public' as $$
  select 100 + coalesce(sum(50 * level + case when mods ? 'store' then 200 else 0 end), 0) from props where owner = u and building is not null $$;

create or replace function public._produce(p props, wm numeric, minutes numeric, INOUT inv jsonb, INOUT money numeric, pay_wages boolean DEFAULT true)
 RETURNS record LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare r public.recipes; cyc numeric; k text; v text; comp int; boost numeric := 1; g text; q numeric; left_ numeric; cap numeric;
  lv numeric := public._blv_mult(coalesce(p.level,1)); m jsonb := coalesce(p.mods, '[]');
  retail text[] := array['cake','clothes','furniture','cheese','smoked','juice','bread','honey','eggs','milk','veg','apples'];
begin
  select * into r from public.recipes where building = p.building;
  if not found or wm <= 0 then return; end if;
  if pay_wages then money := money - r.wage * wm * (case when m ? 'brig' then 0.7 else 1 end); end if;
  if m ? 'tech' and r.kind in ('gather','proc') then lv := lv * 1.15; end if;
  cyc := r.rate * wm * public._gear_mult(p.owner, r) * lv;
  if r.kind in ('service','retail') then
    select count(*) into comp from public.props q
      where q.building = p.building and q.workers > 0 and q.built_at <= now()
        and abs(q.x - p.x) + abs(q.y - p.y) < 16;
    if exists(select 1 from public.city where id = 1 and boost_until > now()) then boost := 1.3; end if;
    cyc := least(cyc, p.demand * boost * (1 + 0.25 * (coalesce(p.level,1) - 1)) * (case when m ? 'ads' then 1.3 else 1 end) / greatest(comp, 1) * minutes);
  end if;
  if r.kind = 'retail' then
    left_ := greatest(cyc, 0);
    foreach g in array retail loop
      exit when left_ <= 0;
      q := least(public._g(inv, g), left_);
      if q > 0 then
        inv := public._add(inv, g, -q);
        money := money + q * (select base from public.goods where good = g) * 1.6;
        left_ := left_ - q;
      end if;
    end loop;
    return;
  end if;
  for k, v in select key, value from jsonb_each_text(r.inputs) loop
    cyc := least(cyc, public._g(inv, k) / v::numeric);
  end loop;
  cyc := greatest(cyc, 0);
  if cyc = 0 then return; end if;
  cap := public._cap(p.owner);
  for k, v in select key, value from jsonb_each_text(r.inputs) loop
    inv := public._add(inv, k, -cyc * v::numeric);
  end loop;
  for k, v in select key, value from jsonb_each_text(r.outputs) loop
    inv := public._add(inv, k, least(cyc * v::numeric, greatest(0, cap - public._g(inv, k))));
  end loop;
  if r.kind = 'service' then money := money + r.pay * cyc; end if;
end $function$;

-- офлайн: 25%, с модулем «Автоматика» — 50% (до 8 ч)
create or replace function public._settle(p_uid uuid) returns void language plpgsql set search_path to 'public' as $function$
declare pr public.profiles; p public.props; t0 timestamptz; mins numeric; onl numeric; eff numeric; i jsonb; m numeric;
begin
  perform 1 from profiles where id = p_uid for update;
  select * into pr from public.profiles where id = p_uid for update;
  if not found then raise exception 'Сначала создай профиль'; end if;
  i := pr.inv; m := pr.money;
  for p in select q.* from public.props q join public.recipes r on r.building = q.building
           where q.owner = p_uid and q.built_at is not null and q.built_at <= now() order by r.ord, q.id loop
    t0 := greatest(coalesce(p.last_tick, p.built_at), p.built_at);
    mins := extract(epoch from now() - t0) / 60.0;
    if mins > 0.01 then
      onl := greatest(0, least(mins, extract(epoch from (pr.last_seen + interval '90 seconds') - t0) / 60.0));
      eff := onl + least(mins - onl, 480) * (case when coalesce(p.mods, '[]') ? 'auto' then 0.5 else 0.25 end);
      if m > 0 then
        select o.inv, o.money into i, m from public._produce(p, p.workers * eff, eff, i, m, true) o;
      end if;
      update public.props set last_tick = now() where id = p.id;
    end if;
  end loop;
  update public.profiles set inv = i, money = round(m, 2), last_seen = now() where id = p_uid;
end $function$;

create or replace function public.upgrade(p_id integer) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); p props; r recipes; pr profiles; cost numeric; extra numeric; i jsonb; mat jsonb; mins int; nl int;
begin
  perform 1 from profiles where id = auth.uid() for update;
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u or p.building is null then raise exception 'Это не твой бизнес'; end if;
  if p.built_at > now() then raise exception 'Дождись окончания стройки'; end if;
  if p.level >= 10 then raise exception 'Максимальный уровень'; end if;
  nl := p.level + 1;
  select * into pr from profiles where id = u;
  if _lvl(pr.xp) < _blv_need(nl) then raise exception 'Для % уровня здания нужен % уровень игрока', nl, _blv_need(nl); end if;
  select * into r from recipes where building = p.building;
  cost := r.cost * (array[1,2,4,8,12,16,24,32,48])[nl-1];
  mat := jsonb_build_object('planks', 6 * nl)
    || case when nl >= 3 then jsonb_build_object('bricks', 5 * (nl - 2)) else '{}'::jsonb end
    || case when nl >= 6 then jsonb_build_object('stone', 20 * (nl - 5)) else '{}'::jsonb end;
  select b.inv, b.cost into i, extra from _buy_missing(mat, pr.inv) b;
  if pr.money < cost + extra then raise exception 'Нужно %💰 (с материалами)', cost + extra; end if;
  i := _take(mat, pr.inv);
  mins := (case when p.kind = 'office' then 60 when r.kind = 'service' then 30 when r.kind = 'proc' then 15 when r.kind = 'retail' then 10 else 3 end)
    * (array[3,8,20,60,90,120,180,240,360])[nl-1];
  update profiles set money = money - cost - extra, inv = i where id = u;
  update props set level = nl, built_at = now() + make_interval(mins => mins), last_tick = null where id = p_id;
  perform _ev(u, 'build', pr.nick || ' · улучшает «' || r.name || '» до ' || nl || ' уровня', jsonb_build_object('plot', p.plot, 'building', p.building));
  return _prof(u);
end $function$;

create or replace function public.hire(p_id integer, p_delta integer) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); p props; pr profiles; mx int;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u or p.building is null then raise exception 'Это не твой бизнес'; end if;
  select * into pr from profiles where id = u;
  mx := _blv_workers(p.level);
  if p_delta > 0 then
    if p.workers >= mx then raise exception 'Максимум % работников (улучши здание)', mx; end if;
    if pr.money < 100 then raise exception 'Найм стоит 100💰'; end if;
    update profiles set money = money - 100 where id = u;
    update props set workers = workers + 1 where id = p_id;
  else
    if p.workers <= 0 then raise exception 'Некого увольнять'; end if;
    update props set workers = workers - 1 where id = p_id;
  end if;
  return _prof(u);
end $function$;

-- ===== Модули (по одному каждого вида на здание) =====
-- store «Склад» +200 к складу · brig «Бригадир» −30% зарплат · tech «Техника» +15% выпуска (сырьё/переработка)
-- ads «Реклама» +30% спроса (услуги/магазины) · auto «Автоматика» офлайн 50% вместо 25%
create or replace function public.add_module(p_id integer, p_mod text) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); p props; r recipes; pr profiles; cost numeric; extra numeric; i jsonb; mat jsonb; need_pl int; need_bl int; nm text;
begin
  perform 1 from profiles where id = auth.uid() for update;
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u or p.building is null then raise exception 'Это не твой бизнес'; end if;
  if p.built_at > now() then raise exception 'Дождись окончания стройки'; end if;
  if p.mods ? p_mod then raise exception 'Этот модуль уже стоит'; end if;
  select * into r from recipes where building = p.building;
  case p_mod
    when 'store' then need_pl := 5;  need_bl := 2; cost := r.cost * 2; mat := '{"planks":10}'; nm := 'Склад';
    when 'brig'  then need_pl := 9;  need_bl := 3; cost := r.cost * 3; mat := '{"planks":8,"bricks":5}'; nm := 'Бригадир';
    when 'tech'  then need_pl := 11; need_bl := 4; cost := r.cost * 5; mat := '{"bricks":10,"stone":20}'; nm := 'Техника';
    when 'ads'   then need_pl := 11; need_bl := 4; cost := r.cost * 5; mat := '{"planks":10,"bricks":10}'; nm := 'Реклама';
    when 'auto'  then need_pl := 13; need_bl := 5; cost := r.cost * 8; mat := '{"bricks":20,"stone":30}'; nm := 'Автоматика';
    else raise exception 'Нет такого модуля';
  end case;
  if p_mod = 'tech' and r.kind not in ('gather','proc') then raise exception '«Техника» — только для сырья и переработки'; end if;
  if p_mod = 'ads' and r.kind not in ('service','retail') then raise exception '«Реклама» — только для услуг и магазинов'; end if;
  select * into pr from profiles where id = u;
  if _lvl(pr.xp) < need_pl then raise exception '«%» откроется на % уровне игрока', nm, need_pl; end if;
  if p.level < need_bl then raise exception '«%» ставится на здание от % уровня', nm, need_bl; end if;
  select b.inv, b.cost into i, extra from _buy_missing(mat, pr.inv) b;
  if pr.money < cost + extra then raise exception 'Нужно %💰 (с материалами)', cost + extra; end if;
  i := _take(mat, pr.inv);
  update profiles set money = money - cost - extra, inv = i where id = u;
  update props set mods = mods || to_jsonb(p_mod) where id = p_id;
  perform _ev(u, 'build', pr.nick || ' · ставит «' || nm || '» в «' || r.name || '»', jsonb_build_object('plot', p.plot, 'building', p.building));
  return _prof(u);
end $function$;
revoke all on function public.add_module(integer, text) from public, anon;
grant execute on function public.add_module(integer, text) to authenticated;

-- ===== Долгая смена: теперь реально тратит энергию; 6 ч — с 14 уровня =====
create or replace function public.start_long_shift(p_id integer, p_hours integer) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid:=_uid(); pr profiles; p props; e employers; n int; cost int;
begin
  perform _settle(u);
  select * into pr from profiles where id=u for update;
  if pr.long_until is not null then raise exception 'Ты уже на долгой смене'; end if;
  if p_hours not in (2,3,4,6) then raise exception 'Смена бывает на 2, 3, 4 или 6 часов'; end if;
  if p_hours = 6 and _lvl(pr.xp) < 14 then raise exception 'Смена на 6 часов откроется на 14 уровне'; end if;
  select * into p from props where id=p_id;
  if not found or p.kind<>'npc' or p.sp='cityhall' then raise exception 'Здесь нельзя выйти на смену'; end if;
  select * into e from employers where sp=p.sp;
  if pr.shifts<e.req then raise exception 'Нужен опыт: % смен (у тебя %)',e.req,pr.shifts; end if;
  n:=case p_hours when 2 then 15 when 3 then 21 when 4 then 28 else 40 end;
  cost:=case p_hours when 2 then 15 when 3 then 20 when 4 then 25 else 35 end;
  perform _energy(u, cost);
  update profiles set long_prop=p_id, long_until=now()+make_interval(hours=>p_hours), long_n=n, job_prop=null where id=u;
  return _prof(u);
end $function$;
