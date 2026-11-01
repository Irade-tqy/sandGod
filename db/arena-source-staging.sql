create view public.arena_source_staging with (security_invoker=true) as
select s.id,s.owner_id,s.source_path,s.source_sha256,s.source_size,p.kind
from arena_private.submissions s join public.arena_players p on p.id=s.player_id
where s.state='staging' and s.source_path is not null and p.status='pending' and p.kind in ('c','cpp');
revoke all on public.arena_source_staging from public,anon,authenticated;
grant select on public.arena_source_staging to service_role;
