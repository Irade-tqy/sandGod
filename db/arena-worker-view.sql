create view public.arena_worker_endpoints with (security_invoker=true) as
select p.id,s.endpoint,s.created_at
from public.arena_players p join arena_private.submissions s on s.player_id=p.id
where p.status='active' and p.kind='mcp' and s.state='accepted' and s.endpoint is not null;
revoke all on public.arena_worker_endpoints from public, anon, authenticated;
grant select on public.arena_worker_endpoints to service_role;
