alter table arena_private.submissions add column artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$');

create function public.arena_claim_source(p_token uuid)
returns table(submission_id uuid,player_id uuid,source_path text,source_sha256 text,source_size integer,kind text)
language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 with expired as (
  update arena_private.submissions s set state='rejected',error_message='评测多次失败，请重新提交',worker_token=null,lease_until=null
  where s.source_path is not null and s.state='processing' and s.lease_until<now() and s.attempts>=3 returning s.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s
 where s.source_path is not null and (s.state='pending' or (s.state='processing' and s.lease_until<now())) and s.attempts<3
 order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query with claimed as (
  update arena_private.submissions s set state='processing',worker_token=p_token,lease_until=now()+interval '40 minutes',attempts=s.attempts+1
  where s.id=selected returning s.id,s.player_id,s.source_path,s.source_sha256,s.source_size
 ) select c.id,c.player_id,c.source_path,c.source_sha256,c.source_size,p.kind from claimed c join public.arena_players p on p.id=c.player_id;
end $$;

create function public.arena_finish_source(p_submission uuid,p_token uuid,p_accepted boolean,p_artifact_sha256 text,p_error text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare player uuid; opponent uuid;
begin
 if p_submission is null or p_token is null or p_accepted is null or (p_accepted and (p_artifact_sha256 is null or p_artifact_sha256 !~ '^[0-9a-f]{64}$')) or (p_error is not null and char_length(p_error)>240) then raise exception 'invalid result'; end if;
 if p_accepted then perform pg_catalog.pg_advisory_xact_lock(84530713); end if;
 update arena_private.submissions s set state=case when p_accepted then 'accepted' else 'rejected' end,
 artifact_sha256=case when p_accepted then p_artifact_sha256 else null end,
 error_message=case when p_accepted then null else coalesce(p_error,'评测失败') end,worker_token=null,lease_until=null
 where s.id=p_submission and s.state='processing' and s.worker_token=p_token and s.lease_until>now() and s.source_path is not null returning s.player_id into player;
 if player is null then return false; end if;
 update public.arena_players p set status=case when p_accepted then 'active' else 'disabled' end where p.id=player and p.status='pending' and p.kind in ('c','cpp');
 if not found then raise exception 'invalid player state'; end if;
 if p_accepted then
  for opponent in select p.id from public.arena_players p where p.id<>player and p.status='active' and p.kind in ('c','cpp','mcp') order by random() limit 5 loop
   insert into arena_private.rating_jobs(first_player,second_player) values (player,opponent),(opponent,player);
  end loop;
 end if;
 return true;
end $$;

create view public.arena_worker_players with (security_invoker=true) as
select p.id,p.kind,s.endpoint,case when s.source_path is not null then s.id else null end as artifact_id,s.artifact_sha256,s.created_at
from public.arena_players p join arena_private.submissions s on s.player_id=p.id
where p.status='active' and s.state='accepted' and ((p.kind='mcp' and s.endpoint is not null) or (p.kind in ('c','cpp') and s.source_path is not null and s.artifact_sha256 is not null));
revoke all on public.arena_worker_players from public,anon,authenticated;
grant select on public.arena_worker_players to service_role;
revoke all on function public.arena_claim_source(uuid) from public,anon,authenticated;
revoke all on function public.arena_finish_source(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.arena_claim_source(uuid) to service_role;
grant execute on function public.arena_finish_source(uuid,uuid,boolean,text,text) to service_role;
