-- 010: «зашёл / вышел» в ленте событий.
-- Вход: клиент зовёт hello() при входе в мир → событие, если игрок числился офлайн (перезагрузки не спамят).
-- Выход: cron раз в минуту — кто не подавал признаков жизни (last_seen обновляет settle каждые 15 с) больше 2 минут.
alter table public.profiles add column if not exists online boolean not null default false;

create or replace function public.hello() returns void language plpgsql security definer set search_path to 'public' as $$
declare u uuid := _uid(); n text;
begin
  update profiles set online = true, last_seen = now() where id = u and not online returning nick into n;
  if n is not null then perform _ev(u, 'online', n || ' зашёл в город'); end if;
end $$;
revoke all on function public.hello() from public, anon;
grant execute on function public.hello() to authenticated;

create or replace function public.presence_tick() returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if session_user = 'authenticator' then raise exception 'Только для планировщика'; end if;
  for r in update profiles set online = false where online and last_seen < now() - interval '2 minutes' returning id, nick loop
    perform _ev(r.id, 'offline', r.nick || ' вышел из города');
  end loop;
end $$;
revoke all on function public.presence_tick() from public, anon, authenticated;

select cron.schedule('pixelgrad_presence', '* * * * *', 'select public.presence_tick()');
