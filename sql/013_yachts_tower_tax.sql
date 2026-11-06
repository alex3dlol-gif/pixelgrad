-- 013: куда тратить деньги богатым + налог сверх лимита. Синхронно с js/config.js (WEALTH_TAX, YACHTS, PROJECTS).
-- Деньги за яхты и взносы в телебашню СГОРАЮТ (не идут в казну) — это выход денег из экономики.

-- ===== 1. Налог на роскошь: 16-й облагаемый объект и дальше (сверх лимита, купленные до 007) — 10% базы + 5000💰/сутки =====
create or replace function public._wealth_rate(n bigint) returns numeric language sql immutable as $$
  select case when n <= 3 then 0 when n <= 6 then 0.01 when n <= 10 then 0.02 when n <= 15 then 0.03 else 0.10 end::numeric $$;

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
    select rk.owner,
           round(sum(rk.b * _wealth_rate(rk.n)) * (1 - least(0.5, floor(max(pf.ref_count) / 3) * 0.1))
                 + 5000 * greatest(0, count(*) - 15)) amt,
           count(*) cnt
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

-- ===== 2. Яхты в яхт-клубе (чисто статус, видно всем у причала) =====
alter table public.profiles add column if not exists yacht text;

create or replace function public._yacht_price(k text) returns int language sql immutable as $$
  select case k when 'boat' then 25000 when 'yacht' then 120000 when 'mega' then 400000 end $$;
create or replace function public._yacht_rank(k text) returns int language sql immutable as $$
  select case k when 'boat' then 1 when 'yacht' then 2 when 'mega' then 3 else 0 end $$;

create or replace function public.buy_yacht(p_kind text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pr profiles; c int := _yacht_price(p_kind);
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  if c is null then raise exception 'Нет такой яхты'; end if;
  select * into pr from profiles where id = u for update;
  if _yacht_rank(pr.yacht) >= _yacht_rank(p_kind) then raise exception 'У тебя уже есть судно не хуже'; end if;
  if pr.money < c then raise exception 'Не хватает денег: нужно % 💰', c; end if;
  update profiles set money = money - c, yacht = p_kind where id = u;
  insert into events(uid, kind, txt, data)
    values (u, 'yacht', pr.nick || ' купил ' || case p_kind when 'boat' then 'катер' when 'yacht' then 'яхту' else 'МЕГАЯХТУ' end
      || ' за ' || c || '💰 — стоит у причала яхт-клуба', jsonb_build_object('kind', p_kind, 'amt', c));
  return _prof(u);
end $$;
revoke all on function public.buy_yacht(text) from public, anon;
grant execute on function public.buy_yacht(text) to authenticated;

-- ===== 3. Городские мегапроекты: скидываются все, деньги сгорают, по завершении — бафф всему городу =====
create table if not exists public.city_projects(id text primary key, n text not null, goal numeric not null,
  raised numeric not null default 0, done_at timestamptz, ord int not null default 0);
create table if not exists public.project_donors(pid text not null references public.city_projects(id),
  uid uuid not null references public.profiles(id) on delete cascade, amt numeric not null default 0, primary key(pid, uid));
alter table public.city_projects enable row level security;
alter table public.project_donors enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'read all' and polrelid = 'public.city_projects'::regclass) then
    create policy "read all" on public.city_projects for select using (true); end if;
  if not exists (select 1 from pg_policy where polname = 'read all' and polrelid = 'public.project_donors'::regclass) then
    create policy "read all" on public.project_donors for select using (true); end if;
end $$;
insert into public.city_projects(id, n, goal, ord) values ('tower', 'Телебашня Пиксельграда', 1000000, 1) on conflict do nothing;

create or replace function public.donate_project(p_id text, p_amount numeric) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pr profiles; cp city_projects; a numeric := floor(coalesce(p_amount, 0));
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  if a < 1000 then raise exception 'Минимальный взнос — 1000 💰'; end if;
  select * into cp from city_projects where id = p_id for update;
  if not found then raise exception 'Нет такого проекта'; end if;
  if cp.done_at is not null then raise exception '«%» уже построена', cp.n; end if;
  a := least(a, cp.goal - cp.raised);
  select * into pr from profiles where id = u for update;
  if pr.money < a then raise exception 'Не хватает денег'; end if;
  update profiles set money = money - a where id = u;
  insert into project_donors(pid, uid, amt) values (p_id, u, a)
    on conflict (pid, uid) do update set amt = project_donors.amt + excluded.amt;
  update city_projects set raised = raised + a, done_at = case when raised + a >= goal then now() end
    where id = p_id returning * into cp;
  insert into events(uid, kind, txt, data)
    values (u, 'project', pr.nick || ' вложил ' || a || '💰 в «' || cp.n || '» (' || floor(cp.raised * 100 / cp.goal) || '%)'
      || case when cp.done_at is not null then ' — СТРОЙКА ЗАВЕРШЕНА! Спрос города +10%' else '' end,
      jsonb_build_object('pid', p_id, 'amt', a, 'done', cp.done_at is not null));
  return _prof(u);
end $$;
revoke all on function public.donate_project(text, numeric) from public, anon;
grant execute on function public.donate_project(text, numeric) to authenticated;

-- Бафф: каждый завершённый мегапроект — город потребляет на 10% больше
create or replace function public.npc_tick() returns void
language plpgsql security definer set search_path to 'public' as $function$
declare e employers; k text; v text; mult numeric;
begin
  if session_user = 'authenticator' then raise exception 'Только для планировщика'; end if;
  for e in select * from employers loop
    for k, v in select key, value from jsonb_each_text(e.out_per_min) loop
      update goods set stock = stock + v::numeric where good = k;
    end loop;
  end loop;
  select 1 + count(*) / 20.0 into mult from profiles where last_seen > now() - interval '24 hours';
  mult := mult * (1 + 0.1 * (select count(*) from city_projects where done_at is not null));
  update goods set stock = greatest(0, stock - target / 240.0 * mult - stock * 0.002) where stock > 0;
end $function$;
