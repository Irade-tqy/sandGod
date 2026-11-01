alter table public.arena_players drop constraint arena_players_kind_check;
alter table public.arena_players add constraint arena_players_kind_check check (kind in ('c','cpp','mcp','reference'));

create or replace view public.arena_worker_players with (security_invoker=true) as
select p.id,p.kind,s.endpoint,case when s.source_path is not null then s.id else null end as artifact_id,s.artifact_sha256,s.created_at
from public.arena_players p join arena_private.submissions s on s.player_id=p.id
where p.status='active' and s.state='accepted' and ((p.kind='mcp' and s.endpoint is not null) or (p.kind in ('c','cpp') and s.source_path is not null and s.artifact_sha256 is not null))
union all
select p.id,p.kind,null::text,null::uuid,null::text,p.created_at
from public.arena_players p where p.status='active' and p.kind='reference';
revoke all on public.arena_worker_players from public,anon,authenticated;
grant select on public.arena_worker_players to service_role;

insert into public.arena_players(name,author_name,kind,status,mcp_status)
select '参考策略','Irade-tqy','reference','active',null
where not exists(select 1 from public.arena_players where kind='reference');
