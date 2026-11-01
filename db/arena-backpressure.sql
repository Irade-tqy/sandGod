create or replace function arena_private.limit_rating_backlog() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from arena_private.rating_jobs where state in ('pending','processing') offset 49 limit 1) then
  raise exception 'queue full';
 end if;
 return new;
end $$;
revoke all on function arena_private.limit_rating_backlog() from public,anon,authenticated;
grant execute on function arena_private.limit_rating_backlog() to service_role;
create or replace trigger submissions_limit_rating_backlog before insert on arena_private.submissions
for each row execute function arena_private.limit_rating_backlog();
