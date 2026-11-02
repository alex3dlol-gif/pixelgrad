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
