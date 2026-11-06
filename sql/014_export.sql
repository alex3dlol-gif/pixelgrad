-- 014: экспорт переработанных товаров в другой город (пока NPC-город «Новоморск»; потом — реальные города).
-- Синхронно с js/config.js (EXPORT). Принцип:
--   • грузить можно только дорогую переработку (не сырьё новичков);
--   • контейнеровоз уходит каждые 3 часа (00/03/06… UTC), плывёт 6 часов, деньги приходят по прибытии;
--   • цена фиксируется при погрузке: база × (1.1 − 0.6 × доля уже заполненной суточной квоты), минус 10% фрахт;
--   • суточная квота Новоморска на товар = 2 × норма (target); одному игроку — не больше 40% квоты.
-- Квота ограничивает «печать денег»: весь экспорт города — максимум ~35 тыс.💰 в сутки.

create table if not exists public.export_orders(id bigserial primary key, ts timestamptz not null default now(),
  uid uuid not null references public.profiles(id) on delete cascade, good text not null references public.goods(good),
  qty numeric not null check (qty > 0), pay numeric not null, ship_at timestamptz not null, arrive_at timestamptz not null,
  paid boolean not null default false);
create index if not exists export_orders_uid on public.export_orders(uid, ts desc);
create index if not exists export_orders_open on public.export_orders(arrive_at) where not paid;
alter table public.export_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'read all' and polrelid = 'public.export_orders'::regclass) then
    create policy "read all" on public.export_orders for select using (true); end if;
end $$;

create or replace function public._export_ok(g text) returns boolean language sql immutable as $$
  select g = any(array['furniture','cake','clothes','cheese','bricks','smoked','juice']) $$;
create or replace function public._export_quota(g text) returns numeric language sql stable set search_path = public as $$
  select 2 * target from goods where good = g $$;
create or replace function public._export_filled(g text) returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(qty), 0) from export_orders where good = g and ts > now() - interval '24 hours' $$;
-- ближайший рейс: следующая отметка кратная 3 часам (минимум через 5 минут — иначе следующий)
create or replace function public._export_ship_at() returns timestamptz language sql stable as $$
  select to_timestamp(ceil(extract(epoch from now() + interval '5 minutes') / 10800) * 10800) $$;

-- Котировка для клиента: цена за штуку и сколько ещё можно отгрузить
create or replace function public.export_quote() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ship_at', _export_ship_at(), 'goods', coalesce(jsonb_object_agg(g.good, jsonb_build_object(
    'quota', _export_quota(g.good), 'filled', _export_filled(g.good),
    'mine', (select coalesce(sum(qty),0) from export_orders where uid = auth.uid() and good = g.good and ts > now() - interval '24 hours'),
    'price', round((g.base * (1.1 - 0.6 * least(1, _export_filled(g.good) / _export_quota(g.good))) * 0.9)::numeric, 2))), '{}'::jsonb))
  from goods g where _export_ok(g.good) $$;
grant execute on function public.export_quote() to authenticated, anon;

create or replace function public.export_goods(p_good text, p_qty numeric) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pr profiles; gd goods; q numeric := floor(coalesce(p_qty, 0));
  quota numeric; filled numeric; mine numeric; unit numeric; total numeric := 0; i int; sa timestamptz := _export_ship_at();
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  if not _export_ok(p_good) then raise exception 'Новоморск этот товар не покупает — только переработку (мебель, торты, одежда, сыр, кирпич, копчёности, сок)'; end if;
  if q < 1 then raise exception 'Укажи количество'; end if;
  perform 1 from goods where good = p_good for update;   -- очередь на квоту
  select * into gd from goods where good = p_good;
  select * into pr from profiles where id = u for update;
  if _lvl(pr.xp) < 6 then raise exception 'Экспорт откроется на 6 уровне'; end if;
  if pr.tax_debt > 0 then raise exception 'Сначала погаси налоговый долг'; end if;
  if _g(pr.inv, p_good) < q then raise exception 'На складе только % шт.', floor(_g(pr.inv, p_good)); end if;
  quota := _export_quota(p_good); filled := _export_filled(p_good);
  select coalesce(sum(qty), 0) into mine from export_orders where uid = u and good = p_good and ts > now() - interval '24 hours';
  q := least(q, quota - filled, floor(quota * 0.4) - mine);
  if q < 1 then raise exception 'Квота Новоморска на сегодня исчерпана — попробуй позже'; end if;
  -- цена падает по мере заполнения квоты: считаем по средней точке партии
  unit := gd.base * (1.1 - 0.6 * least(1, (filled + q / 2.0) / quota)) * 0.9;
  total := round(unit * q);
  update profiles set inv = _add(inv, p_good, -q) where id = u;
  insert into export_orders(uid, good, qty, pay, ship_at, arrive_at) values (u, p_good, q, total, sa, sa + interval '6 hours');
  insert into events(uid, kind, txt, data)
    values (u, 'export', pr.nick || ' грузит ' || q || ' «' || gd.name || '» на контейнеровоз в Новоморск (' || total || '💰 по прибытии)',
      jsonb_build_object('good', p_good, 'q', q, 'pay', total, 'ship_at', sa));
  return _prof(u);
end $$;
revoke all on function public.export_goods(text, numeric) from public, anon;
grant execute on function public.export_goods(text, numeric) to authenticated;

-- Оплата по прибытии (cron каждые 5 минут)
create or replace function public.settle_exports() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select uid, sum(pay) s, count(*) c, array_agg(id) ids from export_orders
           where not paid and arrive_at <= now() group by uid loop
    update export_orders set paid = true where id = any(r.ids);
    update profiles set money = money + r.s where id = r.uid;
    insert into events(uid, kind, txt, data)
      values (r.uid, 'export_paid', (select nick from profiles where id = r.uid) || ' получил ' || r.s || '💰 из Новоморска',
        jsonb_build_object('amt', r.s, 'n', r.c));
    n := n + r.c;
  end loop;
  return n;
end $$;
revoke all on function public.settle_exports() from public, anon, authenticated;
select cron.schedule('pixelgrad_settle_exports', '*/5 * * * *', 'select public.settle_exports()');
