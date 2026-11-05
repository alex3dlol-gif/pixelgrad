-- 009: ребаланс экономики (2026-11-05).
-- Было: город «съедал» 2–2,5% склада базы в минуту → любой объём продавался по ~1.8× базы, деньги печатались без предела;
--       NPC-предприятия заваливали базу сырьём (пшеница/брёвна/камень по 0.3×) → ферма новичка не окупалась;
--       магазин продавал по фиксированным 1.6× базы мимо рынка; старт 150💰 не хватало на участок + ферму.

-- 1. Конечный спрос города: за сутки город потребляет ≈ 6 «норм» (target) каждого товара × (1 + активные_за_сутки/20)
--    + медленное «старение» склада 0.2%/мин. Перепроизводство → склад растёт → цена падает до 0.3× базы.
create or replace function public.npc_tick() returns void language plpgsql security definer set search_path to 'public' as $function$
declare e employers; k text; v text; mult numeric;
begin
  if session_user = 'authenticator' then raise exception 'Только для планировщика'; end if;
  for e in select * from employers loop
    for k, v in select key, value from jsonb_each_text(e.out_per_min) loop
      update goods set stock = stock + v::numeric where good = k;
    end loop;
  end loop;
  select 1 + count(*) / 20.0 into mult from profiles where last_seen > now() - interval '24 hours';
  update goods set stock = greatest(0, stock - target / 240.0 * mult - stock * 0.002) where stock > 0;
end $function$;

-- 2. NPC-предприятия дают ≈ 40% городского спроса (базовый, без бонуса за активных), остальное — рынок для игроков
with tot as (select x.key g, sum(x.value::numeric) s from employers, jsonb_each_text(out_per_min) x group by x.key),
     f as (select t.g, (0.4 * gd.target / 240.0) / t.s k from tot t join goods gd on gd.good = t.g)
update employers e set out_per_min = (
  select coalesce(jsonb_object_agg(x.key, round(x.value::numeric * f.k::numeric, 3)), '{}'::jsonb)
  from jsonb_each_text(e.out_per_min) x join f on f.g = x.key)
where out_per_min <> '{}'::jsonb;

-- 3. Завалы на базе «раскупает город»: склад не выше нормы — цены сразу возвращаются к нормальным
update goods set stock = target where stock > target;

-- 4. Магазин (розница) — по текущей рыночной цене ×1.2, а не по фиксированным 1.6× базы
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
end $function$;

-- 5. Старт: 400💰 (хватает на деревенский участок 200 + ферму 140). Застрявшим новичкам без имущества — доплата до 400.
alter table public.profiles alter column money set default 400;
update profiles set money = 400 where money < 400 and not exists (select 1 from props where owner = profiles.id);
