-- 011: редкие материалы (выпадают с шансом при производстве) и лицензии на топ-бизнесы (город продаёт на аукционе).
-- Редкое = строка в goods с rare=true: лежит на складе, торгуется на бирже/аукционе, НЕ продаётся и НЕ покупается на базе.
-- Синхронно с js/config.js (GOODS rare, BLD.mat, BLV.mat, MODS, FURN lux_*).

alter table public.goods add column if not exists rare boolean not null default false;
insert into public.goods(good, name, base, target, stock, rare) values
  ('marble','Мрамор',300,1,0,true), ('parts','Запчасти',250,1,0,true), ('wine','Выдержанное вино',200,1,0,true),
  ('truffle','Трюфели',200,1,0,true), ('dfurn','Дизайнерская мебель',600,1,0,true),
  ('lic_restaurant','Лицензия: ресторан',5400,1,0,true), ('lic_canteen','Лицензия: столовая',1980,1,0,true),
  ('lic_cafe','Лицензия: кафе',1620,1,0,true), ('lic_confectionery','Лицензия: кондитерская',1080,1,0,true),
  ('lic_tailor','Лицензия: ателье',990,1,0,true), ('lic_workshop','Лицензия: мебельная мастерская',900,1,0,true)
on conflict (good) do update set name = excluded.name, base = excluded.base, rare = true;

-- откуда падает: 1 штука в среднем на per единиц выпуска (шанс растёт на 10% за уровень здания)
create table if not exists public.rare_drops(building text references public.recipes(building), item text references public.goods(good), per numeric not null, min_lvl int not null default 1, primary key(building, item));
alter table public.rare_drops enable row level security;
do $$ begin if not exists(select 1 from pg_policies where tablename='rare_drops' and policyname='read all') then
  create policy "read all" on public.rare_drops for select to anon, authenticated using (true); end if; end $$;
insert into public.rare_drops(building, item, per, min_lvl) values
  ('quarry','marble',400,1), ('brickworks','marble',150,1), ('sawmill','parts',150,1), ('workshop','parts',40,1),
  ('workshop','dfurn',40,5), ('orchard','wine',300,1), ('juicery','wine',100,1), ('garden','truffle',300,1)
on conflict (building, item) do update set per = excluded.per, min_lvl = excluded.min_lvl;

-- требования к постройке топ-бизнесов: лицензия + редкое (только для новых построек)
update public.recipes set mat = mat || '{"lic_restaurant":1,"wine":2,"truffle":2,"marble":2}' where building = 'restaurant';
update public.recipes set mat = mat || '{"lic_canteen":1,"truffle":1}' where building = 'canteen';
update public.recipes set mat = mat || '{"lic_cafe":1,"wine":1}' where building = 'cafe';
update public.recipes set mat = mat || '{"lic_confectionery":1}' where building = 'confectionery';
update public.recipes set mat = mat || '{"lic_tailor":1}' where building = 'tailor';
update public.recipes set mat = mat || '{"lic_workshop":1}' where building = 'workshop';

-- люкс-мебель
insert into public.furn_items(item, name, cost, money) values
  ('lux_sofa','Дизайнерский диван','{"dfurn":1,"furniture":2}',300), ('lux_lamp','Хрустальная люстра','{"dfurn":1}',200)
on conflict (item) do update set cost = excluded.cost, money = excluded.money;

-- редкое нельзя докупить на базе
create or replace function public._buy_missing(need jsonb, INOUT inv jsonb, OUT cost numeric) returns record language plpgsql set search_path to 'public' as $function$
declare k text; v text; have numeric; miss numeric; st numeric; g goods;
begin
  cost := 0;
  for k, v in select key, value from jsonb_each_text(need) loop
    have := public._g(inv, k); miss := greatest(v::numeric - have, 0);
    if miss > 0 then
      select * into g from public.goods where good = k;
      if g.rare then raise exception 'Нужно: «%» ×% — это редкое, его можно достать только у игроков (биржа, аукцион) или найти на производстве', g.name, miss; end if;
      if g.stock < miss then raise exception 'На оптовой базе нет: % (нужно %, есть %)', g.name, miss, floor(g.stock); end if;
      cost := cost + ceil(miss * public._price(k, -miss / 2) * 1.15);
    end if;
  end loop;
end $function$;

create or replace function public.sell(p_good text, p_q integer) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); pr profiles; rev numeric; tax numeric; pl int; d numeric; mins numeric;
begin
  perform _settle(u);
  if p_q <= 0 then raise exception 'Нечего продавать'; end if;
  if coalesce((select rare from goods where good = p_good), true) then raise exception 'Это на базу не продаётся — только биржа и аукцион'; end if;
  select * into pr from profiles where id = u;
  if floor(_g(pr.inv, p_good)) < p_q then raise exception 'На складе столько нет'; end if;
  rev := round(p_q * _price(p_good, p_q / 2.0));
  tax := round(rev * (select sales_tax from city where id = 1));
  select q.plot into pl from props q join recipes r on r.building = q.building where q.owner = u and r.outputs ? p_good limit 1;
  if pl is null then select plot into pl from props where owner = u and kind = 'land' limit 1; end if;
  select sqrt((x - 97.5)^2 + (y - 92.5)^2) into d from props where id = pl;
  mins := least(8, 2 + coalesce(d, 40) / 40.0);
  update profiles set inv = _add(inv, p_good, -p_q), sold = sold + 1 where id = u;
  insert into shipments(uid, good, q, rev, tax, plot, arrive_at) values(u, p_good, p_q, rev, tax, pl, now() + make_interval(secs => mins * 60));
  perform _ev(u, 'sell', pr.nick || ' · отправил ' || p_q || ' «' || (select name from goods where good = p_good) || '» на базу', jsonb_build_object('plot', pl, 'good', p_good, 'q', p_q));
  return _prof(u);
end $function$;

create or replace function public.buy(p_good text, p_q integer) returns profiles language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); pr profiles; st numeric; c numeric; fee numeric;
begin
  perform _settle(u);
  if p_q <= 0 then raise exception 'Неверное количество'; end if;
  if coalesce((select rare from goods where good = p_good), true) then raise exception 'Редкое на базе не продаётся'; end if;
  if _lvl((select xp from profiles where id = u)) < 3 then raise exception 'Закупки на базе откроются на 3 уровне'; end if;
  select stock into st from goods where good = p_good for update;
  if st < p_q then raise exception 'На базе столько нет (есть %)', floor(st); end if;
  c := ceil(p_q * _price(p_good, -p_q / 2.0) * 1.15);
  fee := ceil(c * (select trade_fee from city where id = 1));
  select * into pr from profiles where id = u;
  if pr.money < c + fee then raise exception 'Не хватает денег: нужно %💰', c + fee; end if;
  update goods set stock = stock - p_q where good = p_good;
  update city set treasury = treasury + fee where id = 1;
  update profiles set money = money - c - fee, inv = _add(inv, p_good, p_q) where id = u;
  return _prof(u);
end $function$;

-- производство + шанс найти редкое
create or replace function public._produce(p props, wm numeric, minutes numeric, INOUT inv jsonb, INOUT money numeric, pay_wages boolean DEFAULT true)
 RETURNS record LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare r public.recipes; cyc numeric; k text; v text; comp int; boost numeric := 1; g text; q numeric; left_ numeric; cap numeric;
  lv numeric := public._blv_mult(coalesce(p.level,1)); m jsonb := coalesce(p.mods, '[]'); dr record; e numeric; n int; outn numeric;
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
        money := money + q * public._price(g, q / 2.0) * 1.2;
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
  -- редкие находки
  select coalesce(sum(value::numeric), 0) into outn from jsonb_each_text(r.outputs);
  for dr in select d.item, d.per, gd.name from public.rare_drops d join public.goods gd on gd.good = d.item
            where d.building = p.building and coalesce(p.level,1) >= d.min_lvl loop
    e := cyc * outn / dr.per * (1 + 0.1 * (coalesce(p.level,1) - 1));
    n := floor(e)::int + (random() < e - floor(e))::int;
    if n > 0 then
      inv := public._add(inv, dr.item, n);
      perform public._ev(p.owner, 'rare', (select nick from public.profiles where id = p.owner) || ' нашёл «' || dr.name || '»' || case when n > 1 then ' ×' || n else '' end || '!',
        jsonb_build_object('item', dr.item, 'n', n, 'plot', p.plot));
    end if;
  end loop;
end $function$;

-- улучшения 6–10: мрамор, с 8-го — запчасти
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
    || case when nl >= 6 then jsonb_build_object('stone', 20 * (nl - 5), 'marble', nl - 5) else '{}'::jsonb end
    || case when nl >= 8 then jsonb_build_object('parts', 1) else '{}'::jsonb end;
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
    when 'tech'  then need_pl := 11; need_bl := 4; cost := r.cost * 5; mat := '{"bricks":10,"stone":20,"parts":2}'; nm := 'Техника';
    when 'ads'   then need_pl := 11; need_bl := 4; cost := r.cost * 5; mat := '{"planks":10,"bricks":10}'; nm := 'Реклама';
    when 'auto'  then need_pl := 13; need_bl := 5; cost := r.cost * 8; mat := '{"bricks":20,"stone":30,"parts":3}'; nm := 'Автоматика';
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

-- ===== аукцион вещей (редкое и лицензии) =====
alter table public.auctions add column if not exists good text references public.goods(good);
alter table public.auctions add column if not exists qty int;

create or replace function public.create_item_auction(p_good text, p_qty integer, p_start numeric, p_buyout numeric, p_hours integer) returns profiles
language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); pr profiles; g goods;
begin
  perform 1 from profiles where id = auth.uid() for update;
  perform _settle(u);
  select * into g from goods where good = p_good;
  if not found or not g.rare then raise exception 'На аукцион выставляется только редкое и лицензии'; end if;
  select * into pr from profiles where id = u;
  if _lvl(pr.xp) < 2 then raise exception 'Аукцион откроется на 2 уровне'; end if;
  if p_qty <= 0 or floor(_g(pr.inv, p_good)) < p_qty then raise exception 'На складе столько нет'; end if;
  if p_start < 10 then raise exception 'Стартовая цена от 10💰'; end if;
  if p_buyout is not null and p_buyout > 0 and p_buyout <= p_start then raise exception 'Цена выкупа должна быть выше стартовой'; end if;
  if (select count(*) from auctions where seller = u and status = 'open' and good is not null) >= 5 then raise exception 'Максимум 5 лотов одновременно'; end if;
  update profiles set inv = _add(inv, p_good, -p_qty) where id = u;
  insert into auctions(prop, good, qty, seller, start_price, buyout, ends_at)
    values (null, p_good, p_qty, u, round(p_start), nullif(round(coalesce(p_buyout,0)),0), now() + make_interval(hours => least(greatest(p_hours,1),48)));
  perform _ev(u, 'auction', pr.nick || ' выставил(а) на аукцион «' || g.name || '»' || case when p_qty > 1 then ' ×' || p_qty else '' end || ' от ' || round(p_start) || '💰');
  return _prof(u);
end $function$;
revoke all on function public.create_item_auction(text, integer, numeric, numeric, integer) from public, anon;
grant execute on function public.create_item_auction(text, integer, numeric, numeric, integer) to authenticated;

create or replace function public._finish_auction(a auctions) returns void language plpgsql security definer set search_path to 'public' as $function$
declare p props; fee numeric;
begin
  update auctions set status = 'closed' where id = a.id;
  if a.good is not null then
    if a.bidder is null then
      if a.seller is not null then update profiles set inv = _add(inv, a.good, a.qty) where id = a.seller; end if;
      return;
    end if;
    fee := case when a.seller is null then a.cur_bid else round(a.cur_bid * 0.05) end;
    update city set treasury = treasury + fee where id = 1;
    if a.seller is not null then update profiles set money = money + a.cur_bid - fee where id = a.seller; end if;
    update profiles set inv = _add(inv, a.good, a.qty) where id = a.bidder;
    perform _ev(a.bidder, 'auction', (select nick from profiles where id = a.bidder) || ' выиграл(а) «' || (select name from goods where good = a.good) || '» за ' || round(a.cur_bid) || '💰');
    return;
  end if;
  if a.bidder is null then return; end if;
  select * into p from props where id = a.prop;
  fee := case when a.seller is null then a.cur_bid else round(a.cur_bid * 0.05) end;
  update city set treasury = treasury + fee where id = 1;
  if a.seller is not null then
    update profiles set money = money + a.cur_bid - fee, home_unit = case when home_unit = a.prop then null else home_unit end where id = a.seller;
  end if;
  update props set owner = a.bidder, last_tick = case when built_at is not null then now() else last_tick end where id = a.prop;
  update profiles set home_unit = coalesce(home_unit, case when p.kind = 'apt' then a.prop end) where id = a.bidder;
  perform _ev(a.bidder, 'auction', (select nick from profiles where id = a.bidder) || ' выиграл(а) аукцион за ' || round(a.cur_bid) || '💰', jsonb_build_object('plot', p.plot));
end $function$;

create or replace function public.cancel_auction(p_auction bigint) returns void language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := _uid(); a auctions;
begin
  select * into a from auctions where id = p_auction for update;
  if not found or a.seller is distinct from u or a.status <> 'open' then raise exception 'Нельзя'; end if;
  if a.bidder is not null then raise exception 'Уже есть ставки — снять нельзя'; end if;
  update auctions set status = 'closed' where id = a.id;
  if a.good is not null then update profiles set inv = _add(inv, a.good, a.qty) where id = u; end if;
end $function$;

-- город: 5 элитных лотов недвижимости + раз в сутки по лицензии каждого вида (6 ч торгов, всё в казну)
create or replace function public.auction_tick() returns void language plpgsql security definer set search_path to 'public' as $function$
declare a auctions; p props; g goods;
begin
  if session_user = 'authenticator' then raise exception 'Только для планировщика'; end if;
  for a in select * from auctions where status = 'open' and ends_at <= now() loop perform _finish_auction(a); end loop;
  while (select count(*) from auctions where status = 'open' and seller is null and prop is not null) < 5 loop
    select * into p from props where premium and owner is null and not exists(select 1 from auctions x where x.prop = props.id and x.status = 'open') order by random() limit 1;
    exit when not found;
    insert into auctions(prop, seller, start_price, ends_at) values (p.id, null, p.price, now() + interval '6 hours');
  end loop;
  for g in select * from goods where good like 'lic\_%' loop
    if not exists(select 1 from auctions where good = g.good and seller is null and created > now() - interval '24 hours') then
      insert into auctions(prop, good, qty, seller, start_price, ends_at) values (null, g.good, 1, null, g.base, now() + interval '6 hours');
      perform _ev(null, 'auction', 'Мэрия выставила на аукцион «' || g.name || '» — старт ' || round(g.base) || '💰');
    end if;
  end loop;
end $function$;
