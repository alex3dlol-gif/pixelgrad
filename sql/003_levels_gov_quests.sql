-- Применено поверх 001/002: уровни (XP-триггеры и ограничения), ежедневная награда, скины,
-- мэрия (казна, налоги, выборы, полномочия), локальные задания, автоподтверждение почты.
-- Полный текст функций — в истории сессии; ниже то, что нужно для воспроизведения на чистой базе.

alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists gems int not null default 0;
alter table public.profiles add column if not exists last_daily date;
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists skins jsonb not null default '[]';
alter table public.profiles add column if not exists skin text;

create or replace function public._lvl(x int) returns int language sql immutable as $$ select floor(sqrt(greatest(x,0) / 50.0))::int + 1 $$;

create or replace function public._xp_profile() returns trigger language plpgsql as $$
begin
  if new.shifts > old.shifts then new.xp := new.xp + 10 * (new.shifts - old.shifts); end if;
  if new.furn is distinct from old.furn then new.xp := new.xp + 5; end if;
  return new;
end $$;
create trigger profiles_xp before update on public.profiles for each row execute function public._xp_profile();

create or replace function public._xp_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.uid is not null then
    update profiles set xp = xp + case new.kind when 'buy' then 30 when 'build' then 50 when 'sell' then 15 when 'unit' then 100 when 'job' then 5 else 0 end where id = new.uid;
  end if;
  return new;
end $$;
create trigger events_xp after insert on public.events for each row execute function public._xp_event();

create or replace function public._gate() returns trigger language plpgsql security definer set search_path = public as $$
declare l int; r recipes; need int;
begin
  if new.owner is not null and old.owner is distinct from new.owner then
    select _lvl(xp) into l from profiles where id = new.owner;
    need := case new.kind when 'land' then 2 when 'apt' then 4 when 'office' then 7 else 1 end;
    if l < need then raise exception 'Откроется на % уровне (у тебя %)', need, l; end if;
  end if;
  if new.building is not null and old.building is distinct from new.building then
    select _lvl(xp) into l from profiles where id = new.owner;
    select * into r from recipes where building = new.building;
    need := case when new.kind = 'office' then 7 when r.kind = 'service' then 5 when r.kind = 'proc' then 4 else 2 end;
    if l < need then raise exception '«%» откроется на % уровне (у тебя %)', r.name, need, l; end if;
  end if;
  if new.workers > old.workers and new.workers > 1 then
    select _lvl(xp) into l from profiles where id = new.owner;
    if l < 3 then raise exception 'Найм работников откроется на 3 уровне'; end if;
  end if;
  return new;
end $$;
create trigger props_gate before update on public.props for each row execute function public._gate();

create table if not exists public.city(id int primary key default 1 check (id = 1), treasury numeric not null default 0,
  sales_tax numeric not null default 0.05, prop_tax int not null default 5, trade_fee numeric not null default 0,
  newbie_exempt boolean not null default true, boost_until timestamptz,
  salaries jsonb not null default '{"tax":100,"housing":100,"trade":100}');
insert into public.city(id) values (1) on conflict do nothing;
create table if not exists public.government(position text primary key, uid uuid references public.profiles(id) on delete set null, since timestamptz);
create table if not exists public.elections(id bigserial primary key, position text not null, starts_at timestamptz not null default now(), ends_at timestamptz not null, status text not null default 'open', winner uuid);
create table if not exists public.candidates(election_id bigint references public.elections(id), uid uuid references public.profiles(id) on delete cascade, slogan text, ts timestamptz not null default now(), primary key(election_id, uid));
create table if not exists public.votes(election_id bigint references public.elections(id), voter uuid references public.profiles(id) on delete cascade, cand uuid, primary key(election_id, voter));
alter table public.city enable row level security; alter table public.government enable row level security;
alter table public.elections enable row level security; alter table public.candidates enable row level security; alter table public.votes enable row level security;
create policy "read all" on public.city for select to anon, authenticated using (true);
create policy "read all" on public.government for select to anon, authenticated using (true);
create policy "read all" on public.elections for select to anon, authenticated using (true);
create policy "read all" on public.candidates for select to anon, authenticated using (true);
create policy "own vote" on public.votes for select to authenticated using (voter = auth.uid());
alter publication supabase_realtime add table public.city, public.government, public.elections, public.candidates;
insert into public.elections(position, ends_at) select p, now() + interval '1 day' from unnest(array['mayor','tax','housing','trade']) p;

-- Функции, переопределённые/добавленные в этой миграции (тела совпадают с базой):
--   _settle (ошибка без профиля), _produce (субботник ×1.3), sell (налог с продаж в казну), buy (уровень 3 + сбор торговли),
--   claim_daily, buy_skin, equip_skin, _gov, run_for, vote, vote_counts, gov_set, city_daily, elect_tick,
--   start_quest, finish_quest, npc_tick (защита от вызова из API), _autoconfirm (+ триггер на auth.users).
-- cron: pixelgrad_npc_tick (* * * * *), pixelgrad_city_daily (0 0 * * *), pixelgrad_elect (*/5 * * * *)

insert into public.employers(sp,name,pay,req,out_per_min) values ('cityhall','Мэрия',10,50,'{}'::jsonb) on conflict do nothing;

create table if not exists public.quests(id text primary key, name text not null, money int not null default 0, xp int not null default 0, gems int not null default 0, good text, qty int not null default 0, cd_min int not null, dur int not null, lvl int not null default 1);
create table if not exists public.quest_log(uid uuid references public.profiles(id) on delete cascade, quest text references public.quests(id), started_at timestamptz, done_at timestamptz, primary key(uid, quest));
alter table public.quests enable row level security; alter table public.quest_log enable row level security;
create policy "read all" on public.quests for select to anon, authenticated using (true);
create policy "own log" on public.quest_log for select to authenticated using (uid = auth.uid());
