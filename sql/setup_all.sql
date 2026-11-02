-- Пиксельград: полная установка. Вставь целиком в Supabase → SQL Editor → Run.
-- Пиксельград: схема и серверная логика. Всё изменение состояния — только через RPC (security definer).
-- Производство считается лениво по прошедшему времени (_settle), поэтому бизнес работает и офлайн (до 8 ч).

create extension if not exists pg_cron;

-- ===== справочники (заполняет 002_data.sql) =====
create table if not exists public.recipes(
  building text primary key, name text not null, kind text not null, reg text not null,
  inputs jsonb not null default '{}', outputs jsonb not null default '{}',
  rate real not null, wage real not null, pay real not null default 0,
  cost int not null, mat jsonb not null default '{}', ord int not null default 0);
create table if not exists public.goods(good text primary key, name text not null, base real not null, target real not null, stock numeric not null default 0);
create table if not exists public.furn_items(item text primary key, name text not null, cost jsonb not null, money int not null);
create table if not exists public.employers(sp text primary key, name text not null, pay real not null, req int not null, out_per_min jsonb not null default '{}');

-- ===== игроки и мир =====
create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null unique check (char_length(nick) between 2 and 16),
  color text not null default '#ffd166' check (color ~ '^#[0-9a-fA-F]{6}$'),
  money numeric not null default 150,
  inv jsonb not null default '{}', furn jsonb not null default '{}', dorm jsonb not null default '[]',
  shifts int not null default 0, job_prop int, last_shift timestamptz, home_unit int,
  tut int not null default 0, sold int not null default 0,
  created_at timestamptz not null default now());

-- props: участки земли (land), городские работодатели (npc), квартиры (apt), офисы в БЦ (office)
create table if not exists public.props(
  id int primary key, kind text not null, plot int not null, reg text not null, sp text,
  tier text, floor int, price int not null, x real not null, y real not null, demand real not null default 0,
  owner uuid references public.profiles(id) on delete set null,
  building text references public.recipes(building), workers int not null default 0,
  built_at timestamptz, last_tick timestamptz, room jsonb not null default '[]');
create index if not exists props_owner on public.props(owner);
create index if not exists props_building on public.props(building);

create table if not exists public.events(id bigserial primary key, ts timestamptz not null default now(), uid uuid, kind text, txt text, data jsonb not null default '{}');
create table if not exists public.invites(id bigserial primary key, ts timestamptz not null default now(), from_uid uuid, to_uid uuid, unit int, from_nick text);

-- ===== RLS: читать можно всем, писать — только через функции =====
do $$ declare t text; begin
  foreach t in array array['recipes','goods','furn_items','employers','profiles','props','events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('create policy "read all" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
alter table public.invites enable row level security;
drop policy if exists "own invites" on public.invites;
create policy "own invites" on public.invites for select to authenticated using (to_uid = auth.uid() or from_uid = auth.uid());

-- ===== realtime =====
do $$ declare t text; begin
  foreach t in array array['props','goods','events','invites','profiles'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ===== помощники =====
create or replace function public._uid() returns uuid language plpgsql stable as $$
begin if auth.uid() is null then raise exception 'Нужно войти'; end if; return auth.uid(); end $$;

create or replace function public._g(inv jsonb, g text) returns numeric language sql immutable as $$
  select coalesce((inv->>g)::numeric, 0) $$;

create or replace function public._add(inv jsonb, g text, q numeric) returns jsonb language sql immutable as $$
  select jsonb_set(coalesce(inv,'{}'::jsonb), array[g], to_jsonb(round(coalesce((inv->>g)::numeric,0) + q, 2))) $$;

-- цена зависит от реального склада базы: много товара — дёшево, пусто — дорого
create or replace function public._price(g text, extra numeric default 0) returns numeric language sql stable as $$
  select (base * greatest(0.3, least(2.5, 1.8 - 0.8 * greatest(stock + extra, 0) / target)))::numeric from public.goods where good = g $$;

create or replace function public._ev(p_uid uuid, p_kind text, p_txt text, p_data jsonb default '{}') returns void language sql as $$
  insert into public.events(uid, kind, txt, data) values (p_uid, p_kind, p_txt, p_data) $$;

create or replace function public._prof(u uuid) returns public.profiles language sql stable as $$
  select * from public.profiles where id = u $$;

-- производство одного объекта: wm — работник-минуты, minutes — реальные минуты (для лимита спроса)
create or replace function public._produce(p public.props, wm numeric, minutes numeric, inout inv jsonb, inout money numeric, pay_wages boolean default true)
language plpgsql as $$
declare r public.recipes; cyc numeric; k text; v text; comp int;
begin
  select * into r from public.recipes where building = p.building;
  if not found or wm <= 0 then return; end if;
  if pay_wages then money := money - r.wage * wm; end if;
  cyc := r.rate * wm;
  if r.kind = 'service' then
    select count(*) into comp from public.props q
      where q.building = p.building and q.workers > 0 and q.built_at <= now()
        and abs(q.x - p.x) + abs(q.y - p.y) < 16;
    cyc := least(cyc, p.demand / greatest(comp, 1) * minutes);
  end if;
  for k, v in select key, value from jsonb_each_text(r.inputs) loop
    cyc := least(cyc, public._g(inv, k) / v::numeric);
  end loop;
  cyc := greatest(cyc, 0);
  if cyc = 0 then return; end if;
  for k, v in select key, value from jsonb_each_text(r.inputs) loop
    inv := public._add(inv, k, -cyc * v::numeric);
  end loop;
  for k, v in select key, value from jsonb_each_text(r.outputs) loop
    inv := public._add(inv, k, cyc * v::numeric);
  end loop;
  if r.kind = 'service' then money := money + r.pay * cyc; end if;
end $$;

-- досчитать всё, что игрок произвёл с прошлого раза
create or replace function public._settle(p_uid uuid) returns void language plpgsql as $$
declare pr public.profiles; p public.props; mins numeric; i jsonb; m numeric;
begin
  select * into pr from public.profiles where id = p_uid for update;
  if not found then return; end if;
  i := pr.inv; m := pr.money;
  for p in select q.* from public.props q join public.recipes r on r.building = q.building
           where q.owner = p_uid and q.built_at is not null and q.built_at <= now() order by r.ord, q.id loop
    mins := least(extract(epoch from now() - greatest(coalesce(p.last_tick, p.built_at), p.built_at)) / 60.0, 480);
    if mins > 0.01 then
      if m > 0 then
        select o.inv, o.money into i, m from public._produce(p, p.workers * mins, mins, i, m, true) o;
      end if;
      update public.props set last_tick = now() where id = p.id;
    end if;
  end loop;
  update public.profiles set inv = i, money = round(m, 2) where id = p_uid;
end $$;

-- купить недостающее на базе (только из реального склада)
create or replace function public._buy_missing(need jsonb, inout inv jsonb, out cost numeric) language plpgsql as $$
declare k text; v text; have numeric; miss numeric; st numeric;
begin
  cost := 0;
  for k, v in select key, value from jsonb_each_text(need) loop
    have := public._g(inv, k); miss := greatest(v::numeric - have, 0);
    if miss > 0 then
      select stock into st from public.goods where good = k;
      if st < miss then raise exception 'На оптовой базе нет: % (нужно %, есть %)', (select name from public.goods where good = k), miss, floor(st); end if;
      cost := cost + ceil(miss * public._price(k, -miss / 2) * 1.15);
    end if;
  end loop;
end $$;

create or replace function public._take(need jsonb, inout inv jsonb) language plpgsql as $$
declare k text; v text; have numeric; miss numeric;
begin
  for k, v in select key, value from jsonb_each_text(need) loop
    have := public._g(inv, k); miss := greatest(v::numeric - have, 0);
    if miss > 0 then update public.goods set stock = stock - miss where good = k; end if;
    inv := public._add(inv, k, -least(have, v::numeric));
  end loop;
end $$;

-- ===== RPC =====
create or replace function public.create_profile(p_nick text, p_color text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n text := trim(p_nick);
begin
  if exists(select 1 from profiles where id = u) then return _prof(u); end if;
  if exists(select 1 from profiles where lower(nick) = lower(n)) then raise exception 'Ник уже занят'; end if;
  insert into profiles(id, nick, color) values (u, n, p_color);
  perform _ev(u, 'join', n || ' приезжает в Пиксельград');
  return _prof(u);
end $$;

create or replace function public.settle() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); begin perform _settle(u); return _prof(u); end $$;

create or replace function public.set_tut(p_n int) returns void
language sql security definer set search_path = public as $$ update profiles set tut = p_n where id = auth.uid() $$;

create or replace function public.buy_land(p_id int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; pr profiles;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.kind <> 'land' then raise exception 'Это нельзя купить'; end if;
  if p.owner is not null then raise exception 'Участок уже занят'; end if;
  select * into pr from profiles where id = u;
  if pr.money < p.price then raise exception 'Не хватает денег'; end if;
  update profiles set money = money - p.price where id = u;
  update props set owner = u where id = p_id;
  perform _ev(u, 'buy', pr.nick || ' · куплен участок #' || (p.plot + 1) || ' за ' || p.price || '💰', jsonb_build_object('plot', p.plot));
  return _prof(u);
end $$;

create or replace function public.build(p_id int, p_type text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; pr profiles; r recipes; extra numeric; i jsonb;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u or p.kind not in ('land','office') then raise exception 'Это не твой участок'; end if;
  if p.building is not null then raise exception 'Здесь уже есть здание'; end if;
  select * into r from recipes where building = p_type;
  if not found or position(p.reg in r.reg) = 0 then raise exception 'Здесь такое строить нельзя'; end if;
  select * into pr from profiles where id = u;
  select b.inv, b.cost into i, extra from _buy_missing(r.mat, pr.inv) b;
  if pr.money < r.cost + extra then raise exception 'Не хватает денег: нужно %💰', r.cost + extra; end if;
  i := _take(r.mat, pr.inv);
  update profiles set money = money - r.cost - extra, inv = i where id = u;
  update props set building = p_type, workers = 1, built_at = now() + interval '20 seconds', last_tick = null where id = p_id;
  perform _ev(u, 'build', pr.nick || ' · строит «' || r.name || '»', jsonb_build_object('plot', p.plot, 'building', p_type));
  return _prof(u);
end $$;

create or replace function public.hire(p_id int, p_delta int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; pr profiles;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u or p.building is null then raise exception 'Это не твой бизнес'; end if;
  select * into pr from profiles where id = u;
  if p_delta > 0 then
    if p.workers >= 3 then raise exception 'Максимум 3 работника'; end if;
    if pr.money < 40 then raise exception 'Найм стоит 40💰'; end if;
    update profiles set money = money - 40 where id = u;
    update props set workers = workers + 1 where id = p_id;
  else
    if p.workers <= 0 then raise exception 'Некого увольнять'; end if;
    update props set workers = workers - 1 where id = p_id;
  end if;
  return _prof(u);
end $$;

create or replace function public.sell(p_good text, p_q int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); pr profiles; rev numeric; pl int;
begin
  perform _settle(u);
  if p_q <= 0 then raise exception 'Нечего продавать'; end if;
  select * into pr from profiles where id = u;
  if floor(_g(pr.inv, p_good)) < p_q then raise exception 'На складе столько нет'; end if;
  rev := round(p_q * _price(p_good, p_q / 2.0));
  update goods set stock = stock + p_q where good = p_good;
  update profiles set money = money + rev, inv = _add(inv, p_good, -p_q), sold = sold + 1 where id = u;
  select q.plot into pl from props q join recipes r on r.building = q.building where q.owner = u and r.outputs ? p_good limit 1;
  if pl is null then select plot into pl from props where owner = u and kind = 'land' limit 1; end if;
  perform _ev(u, 'sell', pr.nick || ' · продано ' || p_q || ' «' || (select name from goods where good = p_good) || '» за ' || rev || '💰',
    jsonb_build_object('plot', pl, 'good', p_good, 'q', p_q));
  return _prof(u);
end $$;

create or replace function public.buy(p_good text, p_q int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); pr profiles; st numeric; c numeric;
begin
  perform _settle(u);
  if p_q <= 0 then raise exception 'Неверное количество'; end if;
  select stock into st from goods where good = p_good for update;
  if st < p_q then raise exception 'На базе столько нет (есть %)', floor(st); end if;
  c := ceil(p_q * _price(p_good, -p_q / 2.0) * 1.15);
  select * into pr from profiles where id = u;
  if pr.money < c then raise exception 'Не хватает денег: нужно %💰', c; end if;
  update goods set stock = stock - p_q where good = p_good;
  update profiles set money = money - c, inv = _add(inv, p_good, p_q) where id = u;
  return _prof(u);
end $$;

create or replace function public.take_job(p_id int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; pr profiles; e employers; nm text;
begin
  select * into pr from profiles where id = u;
  if not found then raise exception 'Нет профиля'; end if;
  select * into p from props where id = p_id;
  if not found then raise exception 'Нет такого места'; end if;
  if p.kind = 'npc' then
    select * into e from employers where sp = p.sp;
    if pr.shifts < e.req then raise exception 'Нужен опыт: % смен (у тебя %)', e.req, pr.shifts; end if;
    nm := e.name;
  elsif p.building is not null and p.owner is not null and p.owner <> u and p.built_at <= now() then
    nm := (select name from recipes where building = p.building);
  else raise exception 'Здесь нельзя устроиться'; end if;
  update profiles set job_prop = p_id, last_shift = now() where id = u;
  perform _ev(u, 'job', pr.nick || ' · новая работа: ' || nm, jsonb_build_object('plot', p.plot));
  return _prof(u);
end $$;

create or replace function public.quit_job() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); begin update profiles set job_prop = null where id = u; return _prof(u); end $$;

create or replace function public.work_shift() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); pr profiles; p props; e employers; o profiles; pay numeric; i jsonb; m numeric;
begin
  perform _settle(u);
  select * into pr from profiles where id = u for update;
  if pr.job_prop is null then raise exception 'Ты нигде не работаешь'; end if;
  if pr.last_shift is not null and now() - pr.last_shift < interval '18 seconds' then raise exception 'Смена ещё не закончилась'; end if;
  select * into p from props where id = pr.job_prop;
  if p.kind = 'npc' then
    select * into e from employers where sp = p.sp;
    pay := e.pay;
    if p.sp = 'bc' then pay := case when pr.shifts >= 300 then 30 when pr.shifts >= 100 then 20 else 12 end; end if;
  else
    if p.building is null or p.owner is null then update profiles set job_prop = null where id = u; raise exception 'Бизнес закрылся'; end if;
    select * into o from profiles where id = p.owner for update;
    if o.money < 7 then update profiles set job_prop = null where id = u; raise exception 'Владельцу нечем платить — ты уволен'; end if;
    pay := 7;
    select x.inv, x.money into i, m from _produce(p, 20 / 60.0, 20 / 60.0, o.inv, o.money - 7, false) x;
    update profiles set inv = i, money = round(m, 2) where id = o.id;
  end if;
  update profiles set money = money + pay, shifts = shifts + 1, last_shift = now() where id = u;
  return _prof(u);
end $$;

create or replace function public.buy_unit(p_id int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; pr profiles;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.kind not in ('apt','office') then raise exception 'Это не продаётся'; end if;
  if p.owner is not null then raise exception 'Уже куплено'; end if;
  select * into pr from profiles where id = u;
  if pr.money < p.price then raise exception 'Не хватает денег'; end if;
  update profiles set money = money - p.price, home_unit = case when p.kind = 'apt' and home_unit is null then p_id else home_unit end where id = u;
  update props set owner = u where id = p_id;
  perform _ev(u, 'unit', pr.nick || case when p.kind = 'apt' then ' · новая квартира на ' || p.floor || ' этаже' else ' · новый офис в бизнес-центре' end, jsonb_build_object('plot', p.plot));
  return _prof(u);
end $$;

create or replace function public.sell_prop(p_id int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p props; refund numeric;
begin
  perform _settle(u);
  select * into p from props where id = p_id for update;
  if not found or p.owner is distinct from u then raise exception 'Это не твоё'; end if;
  refund := round(p.price * 0.7 + coalesce((select cost from recipes where building = p.building), 0) * 0.4);
  update props set owner = null, building = null, workers = 0, built_at = null, last_tick = null, room = '[]' where id = p_id;
  update profiles set money = money + refund, home_unit = case when home_unit = p_id then null else home_unit end where id = u;
  update profiles set job_prop = null where job_prop = p_id;
  return _prof(u);
end $$;

create or replace function public.set_home(p_id int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_id <> 0 and not exists(select 1 from props where id = p_id and owner = u and kind = 'apt') then raise exception 'Это не твоя квартира'; end if;
  update profiles set home_unit = nullif(p_id, 0) where id = u;
  return _prof(u);
end $$;

create or replace function public.buy_furn(p_item text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); f furn_items; pr profiles; extra numeric; i jsonb;
begin
  perform _settle(u);
  select * into f from furn_items where item = p_item;
  if not found then raise exception 'Нет такого предмета'; end if;
  select * into pr from profiles where id = u;
  select b.inv, b.cost into i, extra from _buy_missing(f.cost, pr.inv) b;
  if pr.money < f.money + extra then raise exception 'Не хватает денег: нужно %💰', f.money + extra; end if;
  i := _take(f.cost, pr.inv);
  update profiles set money = money - f.money - extra, inv = i, furn = _add(furn, p_item, 1) where id = u;
  return _prof(u);
end $$;

-- p_unit = 0 — койка в общаге
create or replace function public.save_room(p_unit int, p_layout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); pr profiles; rec record;
begin
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > 80 then raise exception 'Слишком много предметов'; end if;
  select * into pr from profiles where id = u;
  if p_unit <> 0 and not exists(select 1 from props where id = p_unit and owner = u and kind = 'apt') then raise exception 'Это не твоя квартира'; end if;
  for rec in
    with allr as (
      select e from props, jsonb_array_elements(room) e where owner = u and kind = 'apt' and id <> p_unit
      union all select e from jsonb_array_elements(case when p_unit = 0 then '[]'::jsonb else pr.dorm end) e
      union all select e from jsonb_array_elements(p_layout) e)
    select e->>'i' as item, count(*) as c from allr group by 1
  loop
    if rec.c > _g(pr.furn, rec.item) then raise exception 'Не хватает предметов: %', rec.item; end if;
  end loop;
  if p_unit = 0 then update profiles set dorm = p_layout where id = u;
  else update props set room = p_layout where id = p_unit; end if;
end $$;

create or replace function public.invite(p_nick text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); pr profiles; t profiles;
begin
  select * into pr from profiles where id = u;
  select * into t from profiles where lower(nick) = lower(trim(p_nick));
  if not found then raise exception 'Игрок не найден'; end if;
  if t.id = u then raise exception 'Себя приглашать не нужно :)'; end if;
  insert into invites(from_uid, to_uid, unit, from_nick) values (u, t.id, coalesce(pr.home_unit, 0), pr.nick);
end $$;

-- ===== NPC-экономика: раз в минуту =====
create or replace function public.npc_tick() returns void language plpgsql security definer set search_path = public as $$
declare e employers; k text; v text;
begin
  for e in select * from employers loop
    for k, v in select key, value from jsonb_each_text(e.out_per_min) loop
      update goods set stock = stock + v::numeric where good = k;
    end loop;
  end loop;
  -- город потребляет товары (жители, корабли увозят грузы)
  update goods set stock = greatest(0, stock - (target * 0.03 + stock * 0.03));
  delete from events where ts < now() - interval '2 days';
  delete from invites where ts < now() - interval '1 hour';
end $$;

do $$ begin
  perform cron.unschedule('pixelgrad_npc_tick');
exception when others then null; end $$;
select cron.schedule('pixelgrad_npc_tick', '* * * * *', 'select public.npc_tick()');

-- внутренние функции наружу не торчат
revoke execute on function public._settle(uuid), public.npc_tick(), public._produce(public.props, numeric, numeric, jsonb, numeric, boolean),
  public._buy_missing(jsonb, jsonb), public._take(jsonb, jsonb), public._ev(uuid, text, text, jsonb) from public, anon, authenticated;

-- сгенерировано tools/gen_sql.mjs — не править руками
insert into public.goods(good,name,base,target,stock) values
('wheat','Пшеница',5,400,120),
('veg','Овощи',6,300,90),
('milk','Молоко',7,250,75),
('wood','Брёвна',6,300,90),
('stone','Камень',8,300,90),
('fish','Рыба',7,300,90),
('flour','Мука',15,150,45),
('bread','Хлеб',11,200,60),
('cheese','Сыр',28,100,30),
('planks','Доски',20,150,45),
('bricks','Кирпич',24,150,45),
('smoked','Копчёная рыба',22,120,36),
('furniture','Мебель',80,40,12)
on conflict(good) do update set name=excluded.name, base=excluded.base, target=excluded.target;
insert into public.recipes(building,name,kind,reg,inputs,outputs,rate,wage,pay,cost,mat,ord) values
('farm','Ферма','gather','vd','{}'::jsonb,'{"wheat":1}'::jsonb,8,3,0,90,'{}'::jsonb,0),
('garden','Огород','gather','vd','{}'::jsonb,'{"veg":1}'::jsonb,6,3,0,110,'{}'::jsonb,0),
('cowshed','Коровник','gather','vd','{}'::jsonb,'{"milk":1}'::jsonb,4,4,0,220,'{"planks":4}'::jsonb,0),
('lumber','Делянка','gather','vd','{}'::jsonb,'{"wood":1}'::jsonb,6,3,0,100,'{}'::jsonb,0),
('quarry','Карьер','gather','vdp','{}'::jsonb,'{"stone":1}'::jsonb,5,4,0,160,'{}'::jsonb,0),
('fishery','Рыбацкая будка','gather','vdo','{}'::jsonb,'{"fish":1}'::jsonb,4,3,0,110,'{}'::jsonb,0),
('trawler','Рыболовное судно','gather','o','{}'::jsonb,'{"fish":1}'::jsonb,12,8,0,900,'{"planks":10}'::jsonb,0),
('mill','Мельница','proc','vd','{"wheat":2}'::jsonb,'{"flour":1}'::jsonb,4,4,0,250,'{"stone":6}'::jsonb,1),
('sawmill','Пилорама','proc','vdp','{"wood":2}'::jsonb,'{"planks":1}'::jsonb,4,4,0,250,'{"stone":6}'::jsonb,1),
('brickworks','Кирпичный завод','proc','p','{"stone":2}'::jsonb,'{"bricks":1}'::jsonb,4,5,0,400,'{"planks":6}'::jsonb,1),
('smokehouse','Коптильня','proc','vdpo','{"fish":2}'::jsonb,'{"smoked":1}'::jsonb,3,4,0,220,'{"planks":4}'::jsonb,1),
('dairy','Сыроварня','proc','vdp','{"milk":3}'::jsonb,'{"cheese":1}'::jsonb,3,5,0,400,'{"bricks":4}'::jsonb,1),
('bakery','Пекарня','proc','cp','{"flour":1}'::jsonb,'{"bread":2}'::jsonb,4,5,0,350,'{"bricks":4}'::jsonb,2),
('workshop','Мебельный цех','proc','cp','{"planks":3}'::jsonb,'{"furniture":1}'::jsonb,2,7,0,500,'{"planks":6,"bricks":6}'::jsonb,2),
('pvz','ПВЗ','service','c','{}'::jsonb,'{}'::jsonb,6,5,12,650,'{"bricks":5}'::jsonb,3),
('shawarma','Шаурмичная','service','c','{"bread":1,"veg":1}'::jsonb,'{}'::jsonb,5,5,30,500,'{"bricks":3}'::jsonb,3),
('fishstall','Ларёк «Рыба»','service','c','{"smoked":1}'::jsonb,'{}'::jsonb,5,4,34,420,'{"planks":4}'::jsonb,3),
('canteen','Столовая','service','cB','{"veg":1,"bread":1,"fish":1}'::jsonb,'{}'::jsonb,6,6,48,1100,'{"bricks":6}'::jsonb,3),
('cafe','Кофейня','service','B','{"milk":1,"bread":1}'::jsonb,'{}'::jsonb,6,6,34,900,'{"furniture":2}'::jsonb,3),
('restaurant','Ресторан','service','B','{"cheese":1,"smoked":1,"veg":1}'::jsonb,'{}'::jsonb,4,10,120,3000,'{"furniture":4}'::jsonb,3)
on conflict(building) do update set name=excluded.name,kind=excluded.kind,reg=excluded.reg,inputs=excluded.inputs,outputs=excluded.outputs,rate=excluded.rate,wage=excluded.wage,pay=excluded.pay,cost=excluded.cost,mat=excluded.mat,ord=excluded.ord;
insert into public.employers(sp,name,pay,req,out_per_min) values
('kolkhoz','Колхоз «Рассвет»',4,0,'{"wheat":14,"veg":8,"milk":6}'::jsonb),
('lesxoz','Леспромхоз',6,5,'{"wood":12,"planks":3}'::jsonb),
('market','Оптовая база',5,0,'{}'::jsonb),
('pvzCity','ПВЗ «Коробас»',6,0,'{}'::jsonb),
('sortCenter','Сортировка «Коробас»',6,0,'{}'::jsonb),
('zbi','Завод ЖБИ',8,10,'{"stone":8,"bricks":4}'::jsonb),
('furnFactory','Мебельная фабрика «Уют»',9,20,'{"furniture":1.5}'::jsonb),
('port','Морской порт',8,10,'{"fish":16,"smoked":2}'::jsonb),
('bc','Бизнес-центр',12,30,'{}'::jsonb),
('shop','Магазин у дома',5,0,'{}'::jsonb)
on conflict(sp) do update set name=excluded.name,pay=excluded.pay,req=excluded.req,out_per_min=excluded.out_per_min;
insert into public.furn_items(item,name,cost,money) values
('bed','Кровать','{"furniture":3}'::jsonb,20),
('sofa','Диван','{"furniture":3}'::jsonb,20),
('table','Стол','{"furniture":2}'::jsonb,10),
('chair','Стул','{"furniture":1}'::jsonb,5),
('wardrobe','Шкаф','{"furniture":2}'::jsonb,10),
('shelf','Полка с книгами','{"furniture":1,"planks":1}'::jsonb,10),
('lamp','Торшер','{"furniture":1}'::jsonb,15),
('plant','Фикус','{"veg":3}'::jsonb,15),
('aquarium','Аквариум','{"fish":3,"planks":2}'::jsonb,40),
('rug','Плетёный коврик','{"wheat":8}'::jsonb,10)
on conflict(item) do update set name=excluded.name,cost=excluded.cost,money=excluded.money;
insert into public.props(id,kind,plot,reg,sp,tier,floor,price,x,y,demand) values
(2,'land',2,'c',null,null,null,430,72.5,32.5,10),
(5,'land',5,'c',null,null,null,560,87.5,32.5,13.1),
(6,'land',6,'c',null,null,null,580,92.5,32.5,13.7),
(8,'npc',8,'c','shop',null,null,600,102.5,32.5,13.4),
(10,'land',10,'c',null,null,null,560,112.5,32.5,10.6),
(12,'npc',12,'c','shop',null,null,480,122.5,32.5,8.9),
(16,'land',16,'c',null,null,null,400,62.5,37.5,9.2),
(22,'land',22,'c',null,null,null,670,92.5,37.5,17.8),
(23,'land',23,'c',null,null,null,680,97.5,37.5,18.4),
(26,'npc',26,'c','shop',null,null,640,112.5,37.5,13.4),
(30,'land',30,'c',null,null,null,430,132.5,37.5,8.5),
(31,'land',31,'c',null,null,null,400,137.5,37.5,7.1),
(32,'land',32,'c',null,null,null,410,62.5,42.5,10.5),
(35,'land',35,'c',null,null,null,610,77.5,42.5,18),
(38,'land',38,'c',null,null,null,750,92.5,42.5,23.2),
(39,'land',39,'c',null,null,null,770,97.5,42.5,23.7),
(40,'npc',40,'c','bc',null,null,770,102.5,42.5,22.8),
(41,'land',41,'c',null,null,null,750,107.5,42.5,19.6),
(42,'land',42,'c',null,null,null,710,112.5,42.5,16.6),
(43,'land',43,'c',null,null,null,670,117.5,42.5,14.8),
(46,'npc',46,'c','shop',null,null,480,132.5,42.5,10.3),
(47,'land',47,'c',null,null,null,410,137.5,42.5,8.4),
(48,'land',48,'c',null,null,null,450,62.5,47.5,12.2),
(49,'land',49,'c',null,null,null,520,67.5,47.5,15.2),
(51,'npc',51,'c','shop',null,null,670,77.5,47.5,22.8),
(52,'land',52,'c',null,null,null,730,82.5,47.5,26.6),
(59,'land',59,'c',null,null,null,730,117.5,47.5,18.7),
(60,'npc',60,'c','shop',null,null,670,122.5,47.5,16.7),
(65,'land',65,'c',null,null,null,560,67.5,52.5,18.4),
(69,'land',69,'c',null,null,null,850,87.5,52.5,34.2),
(72,'land',72,'c',null,null,null,930,102.5,52.5,29.9),
(74,'land',74,'c',null,null,null,850,112.5,52.5,24.5),
(78,'land',78,'c',null,null,null,560,132.5,52.5,14.2),
(79,'land',79,'c',null,null,null,480,137.5,52.5,11.4),
(80,'land',80,'c',null,null,null,500,62.5,57.5,15.7),
(84,'land',84,'c',null,null,null,830,82.5,57.5,36),
(85,'land',85,'c',null,null,null,900,87.5,57.5,39.7),
(86,'npc',86,'c','bc',null,null,970,92.5,57.5,40),
(87,'npc',87,'c','bc',null,null,1020,97.5,57.5,38.7),
(89,'land',89,'c',null,null,null,970,107.5,57.5,31.2),
(90,'land',90,'c',null,null,null,900,112.5,57.5,29),
(92,'land',92,'c',null,null,null,750,122.5,57.5,23.1),
(96,'land',96,'c',null,null,null,510,62.5,62.5,15.7),
(98,'npc',98,'c','shop',null,null,680,72.5,62.5,26.8),
(99,'land',99,'c',null,null,null,770,77.5,62.5,33.2),
(101,'npc',101,'c','bc',null,null,930,87.5,62.5,40),
(102,'npc',102,'c','bc',null,null,1020,92.5,62.5,40),
(111,'npc',111,'c','shop',null,null,510,137.5,62.5,13.5),
(112,'npc',112,'c','market',null,null,510,62.5,67.5,14.7),
(118,'npc',118,'c','bc',null,null,1020,92.5,67.5,40),
(121,'land',121,'c',null,null,null,1020,107.5,67.5,35.7),
(124,'land',124,'c',null,null,null,770,122.5,67.5,24.4),
(127,'land',127,'c',null,null,null,510,137.5,67.5,14),
(128,'land',128,'c',null,null,null,500,62.5,72.5,13.7),
(129,'land',129,'c',null,null,null,580,67.5,72.5,18.3),
(133,'npc',133,'c','pvzCity',null,null,900,87.5,72.5,39),
(138,'land',138,'c',null,null,null,900,112.5,72.5,29.6),
(139,'land',139,'c',null,null,null,830,117.5,72.5,25.7),
(140,'land',140,'c',null,null,null,750,122.5,72.5,22),
(141,'land',141,'c',null,null,null,670,127.5,72.5,19.6),
(143,'land',143,'c',null,null,null,500,137.5,72.5,14),
(145,'land',145,'c',null,null,null,560,67.5,77.5,17),
(146,'land',146,'c',null,null,null,640,72.5,77.5,22.3),
(153,'land',153,'c',null,null,null,900,107.5,77.5,30.2),
(155,'npc',155,'c','shop',null,null,780,117.5,77.5,22.9),
(156,'land',156,'c',null,null,null,710,122.5,77.5,19.9),
(157,'land',157,'c',null,null,null,640,127.5,77.5,18.1),
(159,'land',159,'c',null,null,null,480,137.5,77.5,13.4),
(160,'land',160,'c',null,null,null,450,62.5,82.5,11.9),
(161,'npc',161,'c','shop',null,null,520,67.5,82.5,15.8),
(167,'land',167,'c',null,null,null,850,97.5,82.5,28.4),
(168,'land',168,'c',null,null,null,850,102.5,82.5,27.7),
(169,'npc',169,'c','shop',null,null,830,107.5,82.5,26.1),
(172,'land',172,'c',null,null,null,670,122.5,82.5,18.4),
(173,'land',173,'c',null,null,null,600,127.5,82.5,16.7),
(176,'land',176,'c',null,null,null,410,62.5,87.5,10.8),
(177,'npc',177,'c','shop',null,null,480,67.5,87.5,14.2),
(182,'land',182,'c',null,null,null,750,92.5,87.5,24),
(183,'land',183,'c',null,null,null,770,97.5,87.5,23.8),
(184,'land',184,'c',null,null,null,770,102.5,87.5,23.3),
(187,'npc',187,'c','shop',null,null,670,117.5,87.5,18.6),
(192,'land',192,'c',null,null,null,400,62.5,92.5,9.5),
(195,'land',195,'c',null,null,null,550,77.5,92.5,18.2),
(196,'land',196,'c',null,null,null,600,82.5,92.5,19.6),
(197,'land',197,'c',null,null,null,640,87.5,92.5,20.5),
(198,'land',198,'c',null,null,null,670,92.5,92.5,20.6),
(202,'land',202,'c',null,null,null,640,112.5,92.5,17.9),
(204,'land',204,'c',null,null,null,550,122.5,92.5,14.5),
(207,'land',207,'c',null,null,null,400,137.5,92.5,9.6),
(214,'npc',214,'c','shop',null,null,580,92.5,97.5,17.1),
(219,'land',219,'c',null,null,null,520,117.5,97.5,13.1),
(220,'land',220,'c',null,null,null,480,122.5,97.5,11.7),
(224,'npc',224,'v','lesxoz',null,null,150,20.5,47.5,0),
(225,'land',225,'v',null,null,null,170,25.5,47.5,0),
(226,'land',226,'v',null,null,null,170,30.5,47.5,0),
(227,'land',227,'v',null,null,null,170,35.5,47.5,0),
(228,'land',228,'v',null,null,null,170,40.5,47.5,0),
(229,'land',229,'v',null,null,null,150,20.5,52.5,0),
(230,'land',230,'v',null,null,null,170,25.5,52.5,0),
(231,'land',231,'v',null,null,null,170,30.5,52.5,0),
(232,'land',232,'v',null,null,null,170,35.5,52.5,0),
(233,'land',233,'v',null,null,null,170,40.5,52.5,0),
(234,'land',234,'v',null,null,null,150,20.5,57.5,0),
(235,'land',235,'v',null,null,null,170,25.5,57.5,0),
(236,'land',236,'v',null,null,null,170,30.5,57.5,0),
(237,'land',237,'v',null,null,null,170,35.5,57.5,0),
(238,'land',238,'v',null,null,null,170,40.5,57.5,0),
(239,'land',239,'v',null,null,null,150,20.5,62.5,0),
(240,'land',240,'v',null,null,null,170,25.5,62.5,0),
(241,'land',241,'v',null,null,null,170,30.5,62.5,0),
(242,'land',242,'v',null,null,null,170,35.5,62.5,0),
(243,'land',243,'v',null,null,null,170,40.5,62.5,0),
(244,'land',244,'v',null,null,null,150,20.5,67.5,0),
(245,'land',245,'v',null,null,null,170,25.5,67.5,0),
(246,'land',246,'v',null,null,null,170,30.5,67.5,0),
(247,'land',247,'v',null,null,null,170,35.5,67.5,0),
(248,'land',248,'v',null,null,null,170,40.5,67.5,0),
(249,'land',249,'v',null,null,null,150,20.5,72.5,0),
(250,'land',250,'v',null,null,null,170,25.5,72.5,0),
(251,'land',251,'v',null,null,null,170,30.5,72.5,0),
(252,'land',252,'v',null,null,null,170,35.5,72.5,0),
(253,'npc',253,'v','kolkhoz',null,null,170,40.5,72.5,0),
(254,'land',254,'d',null,null,null,110,16.5,114.5,0),
(255,'land',255,'d',null,null,null,110,21.5,114.5,0),
(256,'land',256,'d',null,null,null,110,26.5,114.5,0),
(257,'land',257,'d',null,null,null,110,31.5,114.5,0),
(258,'land',258,'d',null,null,null,110,36.5,114.5,0),
(259,'land',259,'d',null,null,null,110,41.5,114.5,0),
(260,'land',260,'d',null,null,null,110,16.5,119.5,0),
(261,'land',261,'d',null,null,null,110,21.5,119.5,0),
(262,'land',262,'d',null,null,null,110,26.5,119.5,0),
(263,'land',263,'d',null,null,null,110,31.5,119.5,0),
(264,'land',264,'d',null,null,null,110,36.5,119.5,0),
(265,'land',265,'d',null,null,null,110,41.5,119.5,0),
(266,'land',266,'d',null,null,null,130,16.5,124.5,0),
(267,'land',267,'d',null,null,null,130,21.5,124.5,0),
(268,'land',268,'d',null,null,null,130,26.5,124.5,0),
(269,'land',269,'d',null,null,null,130,31.5,124.5,0),
(270,'land',270,'d',null,null,null,130,36.5,124.5,0),
(271,'land',271,'d',null,null,null,130,41.5,124.5,0),
(272,'npc',272,'p','zbi',null,null,380,157.5,42.5,0),
(273,'land',273,'p',null,null,null,380,162.5,42.5,0),
(274,'land',274,'p',null,null,null,380,167.5,42.5,0),
(275,'land',275,'p',null,null,null,380,172.5,42.5,0),
(276,'land',276,'p',null,null,null,380,157.5,47.5,0),
(277,'npc',277,'p','furnFactory',null,null,380,162.5,47.5,0),
(278,'land',278,'p',null,null,null,380,167.5,47.5,0),
(279,'land',279,'p',null,null,null,380,172.5,47.5,0),
(280,'land',280,'p',null,null,null,380,157.5,52.5,0),
(281,'land',281,'p',null,null,null,380,162.5,52.5,0),
(282,'land',282,'p',null,null,null,380,167.5,52.5,0),
(283,'land',283,'p',null,null,null,380,172.5,52.5,0),
(284,'land',284,'p',null,null,null,380,157.5,57.5,0),
(285,'land',285,'p',null,null,null,380,162.5,57.5,0),
(286,'land',286,'p',null,null,null,380,167.5,57.5,0),
(287,'land',287,'p',null,null,null,380,172.5,57.5,0),
(288,'land',288,'p',null,null,null,380,157.5,62.5,0),
(289,'land',289,'p',null,null,null,380,162.5,62.5,0),
(290,'land',290,'p',null,null,null,380,167.5,62.5,0),
(291,'land',291,'p',null,null,null,380,172.5,62.5,0),
(292,'land',292,'p',null,null,null,380,157.5,67.5,0),
(293,'land',293,'p',null,null,null,380,162.5,67.5,0),
(294,'npc',294,'p','sortCenter',null,null,380,167.5,67.5,0),
(295,'land',295,'p',null,null,null,380,172.5,67.5,0),
(296,'npc',296,'o','port',null,null,450,122.5,117.5,0),
(297,'land',297,'o',null,null,null,450,127.5,117.5,0),
(298,'land',298,'o',null,null,null,450,132.5,117.5,0),
(299,'land',299,'o',null,null,null,450,137.5,117.5,0),
(300,'land',300,'o',null,null,null,450,142.5,117.5,0),
(301,'land',301,'o',null,null,null,450,147.5,117.5,0),
(302,'land',302,'o',null,null,null,450,122.5,122.5,0),
(303,'land',303,'o',null,null,null,450,127.5,122.5,0),
(304,'land',304,'o',null,null,null,450,132.5,122.5,0),
(305,'land',305,'o',null,null,null,450,137.5,122.5,0),
(306,'land',306,'o',null,null,null,450,142.5,122.5,0),
(307,'land',307,'o',null,null,null,450,147.5,122.5,0),
(308,'land',308,'o',null,null,null,450,122.5,127.5,0),
(309,'land',309,'o',null,null,null,450,127.5,127.5,0),
(310,'land',310,'o',null,null,null,450,132.5,127.5,0),
(311,'land',311,'o',null,null,null,450,137.5,127.5,0),
(312,'land',312,'o',null,null,null,450,142.5,127.5,0),
(313,'land',313,'o',null,null,null,450,147.5,127.5,0),
(10000,'apt',0,'c',null,'khrush',1,525,62.5,32.5,0),
(10001,'apt',0,'c',null,'khrush',3,575,62.5,32.5,0),
(10002,'apt',0,'c',null,'khrush',4,600,62.5,32.5,0),
(10003,'apt',0,'c',null,'khrush',5,625,62.5,32.5,0),
(10004,'apt',4,'c',null,'khrush',1,525,82.5,32.5,0),
(10005,'apt',4,'c',null,'khrush',3,575,82.5,32.5,0),
(10006,'apt',4,'c',null,'khrush',4,600,82.5,32.5,0),
(10007,'apt',4,'c',null,'khrush',5,625,82.5,32.5,0),
(10008,'apt',7,'c',null,'panel9',2,980,97.5,32.5,0),
(10009,'apt',7,'c',null,'panel9',4,1060,97.5,32.5,0),
(10010,'apt',7,'c',null,'panel9',5,1100,97.5,32.5,0),
(10011,'apt',7,'c',null,'panel9',7,1180,97.5,32.5,0),
(10012,'apt',7,'c',null,'panel9',9,1260,97.5,32.5,0),
(10013,'apt',13,'c',null,'khrush',1,525,127.5,32.5,0),
(10014,'apt',13,'c',null,'khrush',3,575,127.5,32.5,0),
(10015,'apt',13,'c',null,'khrush',4,600,127.5,32.5,0),
(10016,'apt',13,'c',null,'khrush',5,625,127.5,32.5,0),
(10017,'apt',17,'c',null,'khrush',1,525,67.5,37.5,0),
(10018,'apt',17,'c',null,'khrush',3,575,67.5,37.5,0),
(10019,'apt',17,'c',null,'khrush',4,600,67.5,37.5,0),
(10020,'apt',17,'c',null,'khrush',5,625,67.5,37.5,0),
(10021,'apt',36,'c',null,'panel9',2,980,82.5,42.5,0),
(10022,'apt',36,'c',null,'panel9',4,1060,82.5,42.5,0),
(10023,'apt',36,'c',null,'panel9',5,1100,82.5,42.5,0),
(10024,'apt',36,'c',null,'panel9',7,1180,82.5,42.5,0),
(10025,'apt',36,'c',null,'panel9',9,1260,82.5,42.5,0),
(10026,'office',40,'B',null,'bc',4,2120,102.5,42.5,37.64),
(10027,'office',40,'B',null,'bc',8,2440,102.5,42.5,37.64),
(10028,'office',40,'B',null,'bc',12,2760,102.5,42.5,37.64),
(10029,'office',40,'B',null,'bc',16,3080,102.5,42.5,37.64),
(10030,'office',40,'B',null,'bc',20,3400,102.5,42.5,37.64),
(10031,'apt',53,'c',null,'novostroy',5,4100,87.5,47.5,0),
(10032,'apt',53,'c',null,'novostroy',10,4700,87.5,47.5,0),
(10033,'apt',53,'c',null,'novostroy',15,5300,87.5,47.5,0),
(10034,'apt',53,'c',null,'novostroy',20,5900,87.5,47.5,0),
(10035,'apt',53,'c',null,'novostroy',25,6500,87.5,47.5,0),
(10036,'apt',55,'c',null,'novostroy',5,4100,97.5,47.5,0),
(10037,'apt',55,'c',null,'novostroy',10,4700,97.5,47.5,0),
(10038,'apt',55,'c',null,'novostroy',15,5300,97.5,47.5,0),
(10039,'apt',55,'c',null,'novostroy',20,5900,97.5,47.5,0),
(10040,'apt',55,'c',null,'novostroy',25,6500,97.5,47.5,0),
(10041,'apt',61,'c',null,'panel9',2,980,127.5,47.5,0),
(10042,'apt',61,'c',null,'panel9',4,1060,127.5,47.5,0),
(10043,'apt',61,'c',null,'panel9',5,1100,127.5,47.5,0),
(10044,'apt',61,'c',null,'panel9',7,1180,127.5,47.5,0),
(10045,'apt',61,'c',null,'panel9',9,1260,127.5,47.5,0),
(10046,'apt',62,'c',null,'khrush',1,525,132.5,47.5,0),
(10047,'apt',62,'c',null,'khrush',3,575,132.5,47.5,0),
(10048,'apt',62,'c',null,'khrush',4,600,132.5,47.5,0),
(10049,'apt',62,'c',null,'khrush',5,625,132.5,47.5,0),
(10050,'apt',64,'c',null,'khrush',1,525,62.5,52.5,0),
(10051,'apt',64,'c',null,'khrush',3,575,62.5,52.5,0),
(10052,'apt',64,'c',null,'khrush',4,600,62.5,52.5,0),
(10053,'apt',64,'c',null,'khrush',5,625,62.5,52.5,0),
(10054,'apt',67,'c',null,'panel16',3,1780,77.5,52.5,0),
(10055,'apt',67,'c',null,'panel16',6,1960,77.5,52.5,0),
(10056,'apt',67,'c',null,'panel16',10,2200,77.5,52.5,0),
(10057,'apt',67,'c',null,'panel16',13,2380,77.5,52.5,0),
(10058,'apt',67,'c',null,'panel16',16,2560,77.5,52.5,0),
(10059,'apt',68,'c',null,'novostroy',5,4100,82.5,52.5,0),
(10060,'apt',68,'c',null,'novostroy',10,4700,82.5,52.5,0),
(10061,'apt',68,'c',null,'novostroy',15,5300,82.5,52.5,0),
(10062,'apt',68,'c',null,'novostroy',20,5900,82.5,52.5,0),
(10063,'apt',68,'c',null,'novostroy',25,6500,82.5,52.5,0),
(10064,'apt',75,'c',null,'novostroy',5,4100,117.5,52.5,0),
(10065,'apt',75,'c',null,'novostroy',10,4700,117.5,52.5,0),
(10066,'apt',75,'c',null,'novostroy',15,5300,117.5,52.5,0),
(10067,'apt',75,'c',null,'novostroy',20,5900,117.5,52.5,0),
(10068,'apt',75,'c',null,'novostroy',25,6500,117.5,52.5,0),
(10069,'apt',81,'c',null,'panel16',3,1780,67.5,57.5,0),
(10070,'apt',81,'c',null,'panel16',6,1960,67.5,57.5,0),
(10071,'apt',81,'c',null,'panel16',10,2200,67.5,57.5,0),
(10072,'apt',81,'c',null,'panel16',13,2380,67.5,57.5,0),
(10073,'apt',81,'c',null,'panel16',16,2560,67.5,57.5,0),
(10074,'apt',82,'c',null,'panel16',3,1780,72.5,57.5,0),
(10075,'apt',82,'c',null,'panel16',6,1960,72.5,57.5,0),
(10076,'apt',82,'c',null,'panel16',10,2200,72.5,57.5,0),
(10077,'apt',82,'c',null,'panel16',13,2380,72.5,57.5,0),
(10078,'apt',82,'c',null,'panel16',16,2560,72.5,57.5,0),
(10079,'office',86,'B',null,'bc',4,2120,92.5,57.5,40),
(10080,'office',86,'B',null,'bc',8,2440,92.5,57.5,40),
(10081,'office',86,'B',null,'bc',12,2760,92.5,57.5,40),
(10082,'office',86,'B',null,'bc',16,3080,92.5,57.5,40),
(10083,'office',86,'B',null,'bc',20,3400,92.5,57.5,40),
(10084,'office',87,'B',null,'bc',4,2120,97.5,57.5,40),
(10085,'office',87,'B',null,'bc',8,2440,97.5,57.5,40),
(10086,'office',87,'B',null,'bc',12,2760,97.5,57.5,40),
(10087,'office',87,'B',null,'bc',16,3080,97.5,57.5,40),
(10088,'office',87,'B',null,'bc',20,3400,97.5,57.5,40),
(10089,'apt',93,'c',null,'panel9',2,980,127.5,57.5,0),
(10090,'apt',93,'c',null,'panel9',4,1060,127.5,57.5,0),
(10091,'apt',93,'c',null,'panel9',5,1100,127.5,57.5,0),
(10092,'apt',93,'c',null,'panel9',7,1180,127.5,57.5,0),
(10093,'apt',93,'c',null,'panel9',9,1260,127.5,57.5,0),
(10094,'apt',95,'c',null,'panel9',2,980,137.5,57.5,0),
(10095,'apt',95,'c',null,'panel9',4,1060,137.5,57.5,0),
(10096,'apt',95,'c',null,'panel9',5,1100,137.5,57.5,0),
(10097,'apt',95,'c',null,'panel9',7,1180,137.5,57.5,0),
(10098,'apt',95,'c',null,'panel9',9,1260,137.5,57.5,0),
(10099,'apt',97,'c',null,'panel9',2,980,67.5,62.5,0),
(10100,'apt',97,'c',null,'panel9',4,1060,67.5,62.5,0),
(10101,'apt',97,'c',null,'panel9',5,1100,67.5,62.5,0),
(10102,'apt',97,'c',null,'panel9',7,1180,67.5,62.5,0),
(10103,'apt',97,'c',null,'panel9',9,1260,67.5,62.5,0),
(10104,'apt',100,'c',null,'novostroy',5,4100,82.5,62.5,0),
(10105,'apt',100,'c',null,'novostroy',10,4700,82.5,62.5,0),
(10106,'apt',100,'c',null,'novostroy',15,5300,82.5,62.5,0),
(10107,'apt',100,'c',null,'novostroy',20,5900,82.5,62.5,0),
(10108,'apt',100,'c',null,'novostroy',25,6500,82.5,62.5,0),
(10109,'office',101,'B',null,'bc',4,2120,87.5,62.5,40),
(10110,'office',101,'B',null,'bc',8,2440,87.5,62.5,40),
(10111,'office',101,'B',null,'bc',12,2760,87.5,62.5,40),
(10112,'office',101,'B',null,'bc',16,3080,87.5,62.5,40),
(10113,'office',101,'B',null,'bc',20,3400,87.5,62.5,40),
(10114,'office',102,'B',null,'bc',4,2120,92.5,62.5,40),
(10115,'office',102,'B',null,'bc',8,2440,92.5,62.5,40),
(10116,'office',102,'B',null,'bc',12,2760,92.5,62.5,40),
(10117,'office',102,'B',null,'bc',16,3080,92.5,62.5,40),
(10118,'office',102,'B',null,'bc',20,3400,92.5,62.5,40),
(10119,'apt',105,'c',null,'tower',8,12200,107.5,62.5,0),
(10120,'apt',105,'c',null,'tower',15,15000,107.5,62.5,0),
(10121,'apt',105,'c',null,'tower',23,18200,107.5,62.5,0),
(10122,'apt',105,'c',null,'tower',30,21000,107.5,62.5,0),
(10123,'apt',106,'c',null,'novostroy',5,4100,112.5,62.5,0),
(10124,'apt',106,'c',null,'novostroy',10,4700,112.5,62.5,0),
(10125,'apt',106,'c',null,'novostroy',15,5300,112.5,62.5,0),
(10126,'apt',106,'c',null,'novostroy',20,5900,112.5,62.5,0),
(10127,'apt',106,'c',null,'novostroy',25,6500,112.5,62.5,0),
(10128,'apt',108,'c',null,'novostroy',5,4100,122.5,62.5,0),
(10129,'apt',108,'c',null,'novostroy',10,4700,122.5,62.5,0),
(10130,'apt',108,'c',null,'novostroy',15,5300,122.5,62.5,0),
(10131,'apt',108,'c',null,'novostroy',20,5900,122.5,62.5,0),
(10132,'apt',108,'c',null,'novostroy',25,6500,122.5,62.5,0),
(10133,'apt',115,'c',null,'novostroy',5,4100,77.5,67.5,0),
(10134,'apt',115,'c',null,'novostroy',10,4700,77.5,67.5,0),
(10135,'apt',115,'c',null,'novostroy',15,5300,77.5,67.5,0),
(10136,'apt',115,'c',null,'novostroy',20,5900,77.5,67.5,0),
(10137,'apt',115,'c',null,'novostroy',25,6500,77.5,67.5,0),
(10138,'apt',116,'c',null,'novostroy',5,4100,82.5,67.5,0),
(10139,'apt',116,'c',null,'novostroy',10,4700,82.5,67.5,0),
(10140,'apt',116,'c',null,'novostroy',15,5300,82.5,67.5,0),
(10141,'apt',116,'c',null,'novostroy',20,5900,82.5,67.5,0),
(10142,'apt',116,'c',null,'novostroy',25,6500,82.5,67.5,0),
(10143,'office',118,'B',null,'bc',4,2120,92.5,67.5,40),
(10144,'office',118,'B',null,'bc',8,2440,92.5,67.5,40),
(10145,'office',118,'B',null,'bc',12,2760,92.5,67.5,40),
(10146,'office',118,'B',null,'bc',16,3080,92.5,67.5,40),
(10147,'office',118,'B',null,'bc',20,3400,92.5,67.5,40),
(10148,'apt',122,'c',null,'novostroy',5,4100,112.5,67.5,0),
(10149,'apt',122,'c',null,'novostroy',10,4700,112.5,67.5,0),
(10150,'apt',122,'c',null,'novostroy',15,5300,112.5,67.5,0),
(10151,'apt',122,'c',null,'novostroy',20,5900,112.5,67.5,0),
(10152,'apt',122,'c',null,'novostroy',25,6500,112.5,67.5,0),
(10153,'apt',123,'c',null,'panel16',3,1780,117.5,67.5,0),
(10154,'apt',123,'c',null,'panel16',6,1960,117.5,67.5,0),
(10155,'apt',123,'c',null,'panel16',10,2200,117.5,67.5,0),
(10156,'apt',123,'c',null,'panel16',13,2380,117.5,67.5,0),
(10157,'apt',123,'c',null,'panel16',16,2560,117.5,67.5,0),
(10158,'apt',126,'c',null,'panel16',3,1780,132.5,67.5,0),
(10159,'apt',126,'c',null,'panel16',6,1960,132.5,67.5,0),
(10160,'apt',126,'c',null,'panel16',10,2200,132.5,67.5,0),
(10161,'apt',126,'c',null,'panel16',13,2380,132.5,67.5,0),
(10162,'apt',126,'c',null,'panel16',16,2560,132.5,67.5,0),
(10163,'apt',131,'c',null,'panel16',3,1780,77.5,72.5,0),
(10164,'apt',131,'c',null,'panel16',6,1960,77.5,72.5,0),
(10165,'apt',131,'c',null,'panel16',10,2200,77.5,72.5,0),
(10166,'apt',131,'c',null,'panel16',13,2380,77.5,72.5,0),
(10167,'apt',131,'c',null,'panel16',16,2560,77.5,72.5,0),
(10168,'apt',134,'c',null,'tower',8,12200,92.5,72.5,0),
(10169,'apt',134,'c',null,'tower',15,15000,92.5,72.5,0),
(10170,'apt',134,'c',null,'tower',23,18200,92.5,72.5,0),
(10171,'apt',134,'c',null,'tower',30,21000,92.5,72.5,0),
(10172,'apt',135,'c',null,'tower',8,12200,97.5,72.5,0),
(10173,'apt',135,'c',null,'tower',15,15000,97.5,72.5,0),
(10174,'apt',135,'c',null,'tower',23,18200,97.5,72.5,0),
(10175,'apt',135,'c',null,'tower',30,21000,97.5,72.5,0),
(10176,'apt',136,'c',null,'tower',8,12200,102.5,72.5,0),
(10177,'apt',136,'c',null,'tower',15,15000,102.5,72.5,0),
(10178,'apt',136,'c',null,'tower',23,18200,102.5,72.5,0),
(10179,'apt',136,'c',null,'tower',30,21000,102.5,72.5,0),
(10180,'apt',142,'c',null,'panel9',2,980,132.5,72.5,0),
(10181,'apt',142,'c',null,'panel9',4,1060,132.5,72.5,0),
(10182,'apt',142,'c',null,'panel9',5,1100,132.5,72.5,0),
(10183,'apt',142,'c',null,'panel9',7,1180,132.5,72.5,0),
(10184,'apt',142,'c',null,'panel9',9,1260,132.5,72.5,0),
(10185,'apt',147,'c',null,'panel9',2,980,77.5,77.5,0),
(10186,'apt',147,'c',null,'panel9',4,1060,77.5,77.5,0),
(10187,'apt',147,'c',null,'panel9',5,1100,77.5,77.5,0),
(10188,'apt',147,'c',null,'panel9',7,1180,77.5,77.5,0),
(10189,'apt',147,'c',null,'panel9',9,1260,77.5,77.5,0),
(10190,'apt',149,'c',null,'novostroy',5,4100,87.5,77.5,0),
(10191,'apt',149,'c',null,'novostroy',10,4700,87.5,77.5,0),
(10192,'apt',149,'c',null,'novostroy',15,5300,87.5,77.5,0),
(10193,'apt',149,'c',null,'novostroy',20,5900,87.5,77.5,0),
(10194,'apt',149,'c',null,'novostroy',25,6500,87.5,77.5,0),
(10195,'apt',152,'c',null,'novostroy',5,4100,102.5,77.5,0),
(10196,'apt',152,'c',null,'novostroy',10,4700,102.5,77.5,0),
(10197,'apt',152,'c',null,'novostroy',15,5300,102.5,77.5,0),
(10198,'apt',152,'c',null,'novostroy',20,5900,102.5,77.5,0),
(10199,'apt',152,'c',null,'novostroy',25,6500,102.5,77.5,0),
(10200,'apt',158,'c',null,'panel16',3,1780,132.5,77.5,0),
(10201,'apt',158,'c',null,'panel16',6,1960,132.5,77.5,0),
(10202,'apt',158,'c',null,'panel16',10,2200,132.5,77.5,0),
(10203,'apt',158,'c',null,'panel16',13,2380,132.5,77.5,0),
(10204,'apt',158,'c',null,'panel16',16,2560,132.5,77.5,0),
(10205,'apt',162,'c',null,'panel16',3,1780,72.5,82.5,0),
(10206,'apt',162,'c',null,'panel16',6,1960,72.5,82.5,0),
(10207,'apt',162,'c',null,'panel16',10,2200,72.5,82.5,0),
(10208,'apt',162,'c',null,'panel16',13,2380,72.5,82.5,0),
(10209,'apt',162,'c',null,'panel16',16,2560,72.5,82.5,0),
(10210,'apt',170,'c',null,'novostroy',5,4100,112.5,82.5,0),
(10211,'apt',170,'c',null,'novostroy',10,4700,112.5,82.5,0),
(10212,'apt',170,'c',null,'novostroy',15,5300,112.5,82.5,0),
(10213,'apt',170,'c',null,'novostroy',20,5900,112.5,82.5,0),
(10214,'apt',170,'c',null,'novostroy',25,6500,112.5,82.5,0),
(10215,'apt',175,'c',null,'khrush',1,525,137.5,82.5,0),
(10216,'apt',175,'c',null,'khrush',3,575,137.5,82.5,0),
(10217,'apt',175,'c',null,'khrush',4,600,137.5,82.5,0)
on conflict(id) do update set kind=excluded.kind,plot=excluded.plot,reg=excluded.reg,sp=excluded.sp,tier=excluded.tier,floor=excluded.floor,price=excluded.price,x=excluded.x,y=excluded.y,demand=excluded.demand;
insert into public.props(id,kind,plot,reg,sp,tier,floor,price,x,y,demand) values
(10218,'apt',175,'c',null,'khrush',5,625,137.5,82.5,0),
(10219,'apt',179,'c',null,'panel16',3,1780,77.5,87.5,0),
(10220,'apt',179,'c',null,'panel16',6,1960,77.5,87.5,0),
(10221,'apt',179,'c',null,'panel16',10,2200,77.5,87.5,0),
(10222,'apt',179,'c',null,'panel16',13,2380,77.5,87.5,0),
(10223,'apt',179,'c',null,'panel16',16,2560,77.5,87.5,0),
(10224,'apt',181,'c',null,'panel16',3,1780,87.5,87.5,0),
(10225,'apt',181,'c',null,'panel16',6,1960,87.5,87.5,0),
(10226,'apt',181,'c',null,'panel16',10,2200,87.5,87.5,0),
(10227,'apt',181,'c',null,'panel16',13,2380,87.5,87.5,0),
(10228,'apt',181,'c',null,'panel16',16,2560,87.5,87.5,0),
(10229,'apt',188,'c',null,'panel9',2,980,122.5,87.5,0),
(10230,'apt',188,'c',null,'panel9',4,1060,122.5,87.5,0),
(10231,'apt',188,'c',null,'panel9',5,1100,122.5,87.5,0),
(10232,'apt',188,'c',null,'panel9',7,1180,122.5,87.5,0),
(10233,'apt',188,'c',null,'panel9',9,1260,122.5,87.5,0),
(10234,'apt',189,'c',null,'panel9',2,980,127.5,87.5,0),
(10235,'apt',189,'c',null,'panel9',4,1060,127.5,87.5,0),
(10236,'apt',189,'c',null,'panel9',5,1100,127.5,87.5,0),
(10237,'apt',189,'c',null,'panel9',7,1180,127.5,87.5,0),
(10238,'apt',189,'c',null,'panel9',9,1260,127.5,87.5,0),
(10239,'apt',194,'c',null,'panel9',2,980,72.5,92.5,0),
(10240,'apt',194,'c',null,'panel9',4,1060,72.5,92.5,0),
(10241,'apt',194,'c',null,'panel9',5,1100,72.5,92.5,0),
(10242,'apt',194,'c',null,'panel9',7,1180,72.5,92.5,0),
(10243,'apt',194,'c',null,'panel9',9,1260,72.5,92.5,0),
(10244,'apt',199,'c',null,'panel16',3,1780,97.5,92.5,0),
(10245,'apt',199,'c',null,'panel16',6,1960,97.5,92.5,0),
(10246,'apt',199,'c',null,'panel16',10,2200,97.5,92.5,0),
(10247,'apt',199,'c',null,'panel16',13,2380,97.5,92.5,0),
(10248,'apt',199,'c',null,'panel16',16,2560,97.5,92.5,0),
(10249,'apt',201,'c',null,'panel16',3,1780,107.5,92.5,0),
(10250,'apt',201,'c',null,'panel16',6,1960,107.5,92.5,0),
(10251,'apt',201,'c',null,'panel16',10,2200,107.5,92.5,0),
(10252,'apt',201,'c',null,'panel16',13,2380,107.5,92.5,0),
(10253,'apt',201,'c',null,'panel16',16,2560,107.5,92.5,0),
(10254,'apt',205,'c',null,'khrush',1,525,127.5,92.5,0),
(10255,'apt',205,'c',null,'khrush',3,575,127.5,92.5,0),
(10256,'apt',205,'c',null,'khrush',4,600,127.5,92.5,0),
(10257,'apt',205,'c',null,'khrush',5,625,127.5,92.5,0),
(10258,'apt',206,'c',null,'khrush',1,525,132.5,92.5,0),
(10259,'apt',206,'c',null,'khrush',3,575,132.5,92.5,0),
(10260,'apt',206,'c',null,'khrush',4,600,132.5,92.5,0),
(10261,'apt',206,'c',null,'khrush',5,625,132.5,92.5,0),
(10262,'apt',211,'c',null,'panel9',2,980,77.5,97.5,0),
(10263,'apt',211,'c',null,'panel9',4,1060,77.5,97.5,0),
(10264,'apt',211,'c',null,'panel9',5,1100,77.5,97.5,0),
(10265,'apt',211,'c',null,'panel9',7,1180,77.5,97.5,0),
(10266,'apt',211,'c',null,'panel9',9,1260,77.5,97.5,0),
(10267,'apt',212,'c',null,'khrush',1,525,82.5,97.5,0),
(10268,'apt',212,'c',null,'khrush',3,575,82.5,97.5,0),
(10269,'apt',212,'c',null,'khrush',4,600,82.5,97.5,0),
(10270,'apt',212,'c',null,'khrush',5,625,82.5,97.5,0),
(10271,'apt',213,'c',null,'panel16',3,1780,87.5,97.5,0),
(10272,'apt',213,'c',null,'panel16',6,1960,87.5,97.5,0),
(10273,'apt',213,'c',null,'panel16',10,2200,87.5,97.5,0),
(10274,'apt',213,'c',null,'panel16',13,2380,87.5,97.5,0),
(10275,'apt',213,'c',null,'panel16',16,2560,87.5,97.5,0),
(10276,'apt',216,'c',null,'panel9',2,980,102.5,97.5,0),
(10277,'apt',216,'c',null,'panel9',4,1060,102.5,97.5,0),
(10278,'apt',216,'c',null,'panel9',5,1100,102.5,97.5,0),
(10279,'apt',216,'c',null,'panel9',7,1180,102.5,97.5,0),
(10280,'apt',216,'c',null,'panel9',9,1260,102.5,97.5,0),
(10281,'apt',218,'c',null,'panel9',2,980,112.5,97.5,0),
(10282,'apt',218,'c',null,'panel9',4,1060,112.5,97.5,0),
(10283,'apt',218,'c',null,'panel9',5,1100,112.5,97.5,0),
(10284,'apt',218,'c',null,'panel9',7,1180,112.5,97.5,0),
(10285,'apt',218,'c',null,'panel9',9,1260,112.5,97.5,0),
(10286,'apt',223,'c',null,'khrush',1,525,137.5,97.5,0),
(10287,'apt',223,'c',null,'khrush',3,575,137.5,97.5,0),
(10288,'apt',223,'c',null,'khrush',4,600,137.5,97.5,0),
(10289,'apt',223,'c',null,'khrush',5,625,137.5,97.5,0)
on conflict(id) do update set kind=excluded.kind,plot=excluded.plot,reg=excluded.reg,sp=excluded.sp,tier=excluded.tier,floor=excluded.floor,price=excluded.price,x=excluded.x,y=excluded.y,demand=excluded.demand;
