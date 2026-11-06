-- 015: ручное погашение налогового долга (частично или полностью). Деньги идут в казну.
create or replace function public.pay_tax_debt(p_amount numeric default null) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pr profiles; pay numeric;
begin
  if u is null then raise exception 'Нужно войти в игру'; end if;
  select * into pr from profiles where id = u for update;
  if coalesce(pr.tax_debt, 0) <= 0 then raise exception 'Налогового долга нет'; end if;
  pay := floor(least(pr.tax_debt, greatest(pr.money, 0), coalesce(p_amount, pr.tax_debt)));
  if pay < 1 then raise exception 'Не хватает денег'; end if;
  update profiles set money = money - pay, tax_debt = tax_debt - pay where id = u returning * into pr;
  update city set treasury = treasury + pay where id = 1;
  insert into events(uid, kind, txt, data)
    values (u, 'tax', pr.nick || ' погасил налоговый долг ' || pay || '💰'
      || case when pr.tax_debt > 0 then ', осталось ' || pr.tax_debt || '💰' else '' end,
      jsonb_build_object('amt', pay, 'debt', pr.tax_debt));
  return pr;
end $$;
revoke all on function public.pay_tax_debt(numeric) from public, anon;
grant execute on function public.pay_tax_debt(numeric) to authenticated;
