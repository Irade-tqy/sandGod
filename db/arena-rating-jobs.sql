create table arena_private.rating_jobs (
 id uuid primary key default gen_random_uuid(),
 first_player uuid not null references public.arena_players(id),
 second_player uuid not null references public.arena_players(id),
 state text not null default 'pending' check (state in ('pending','processing','completed','failed')),
 attempts integer not null default 0 check (attempts between 0 and 3),
 worker_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(),
 check (first_player <> second_player)
);
alter table arena_private.rating_jobs enable row level security;
revoke all on arena_private.rating_jobs from public,anon,authenticated;
grant all on arena_private.rating_jobs to service_role;
create index rating_jobs_queue_idx on arena_private.rating_jobs(created_at) where state in ('pending','processing');
create index rating_jobs_first_idx on arena_private.rating_jobs(first_player);
create index rating_jobs_second_idx on arena_private.rating_jobs(second_player);

create or replace function public.arena_finish_mcp(p_submission uuid,p_token uuid,p_accepted boolean,p_error text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare player uuid; opponent uuid;
begin
 if p_submission is null or p_token is null or p_accepted is null or (p_error is not null and char_length(p_error)>240) then raise exception 'invalid result'; end if;
 if p_accepted then perform pg_catalog.pg_advisory_xact_lock(84530713); end if;
 update arena_private.submissions s set state=case when p_accepted then 'accepted' else 'rejected' end,
 error_message=case when p_accepted then null else coalesce(p_error,'验证失败') end,worker_token=null,lease_until=null
 where s.id=p_submission and s.state='processing' and s.worker_token=p_token and s.lease_until>now() and s.endpoint is not null returning s.player_id into player;
 if player is null then return false; end if;
 update public.arena_players p set status=case when p_accepted then 'active' else 'disabled' end,
 mcp_status=case when p_accepted then 'online' else 'offline' end where p.id=player and p.status='pending';
 if not found then raise exception 'invalid player state'; end if;
 if p_accepted then
  for opponent in select p.id from public.arena_players p where p.id<>player and p.status='active' and p.kind in ('c','cpp','mcp') order by random() limit 5 loop
   insert into arena_private.rating_jobs(first_player,second_player) values (player,opponent),(opponent,player);
  end loop;
 end if;
 return true;
end $$;

create function public.arena_claim_rating(p_token uuid)
returns table(job_id uuid,first_player uuid,second_player uuid)
language plpgsql security invoker set search_path = '' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 update arena_private.rating_jobs set state='failed',worker_token=null,lease_until=null
 where state='processing' and lease_until<now() and attempts>=3;
 select j.id into selected from arena_private.rating_jobs j
 where (j.state='pending' or (j.state='processing' and j.lease_until<now())) and j.attempts<3
 order by j.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.rating_jobs j set state='processing',worker_token=p_token,lease_until=now()+interval '30 minutes',attempts=j.attempts+1
 where j.id=selected returning j.id,j.first_player,j.second_player;
end $$;

create function public.arena_finish_rating(p_job uuid,p_token uuid,p_winner uuid,p_completed boolean) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare first_id uuid; second_id uuid;
begin
 if p_job is null or p_token is null or p_completed is null then raise exception 'invalid result'; end if;
 select j.first_player,j.second_player into first_id,second_id from arena_private.rating_jobs j
 where j.id=p_job and j.state='processing' and j.worker_token=p_token and j.lease_until>now() for update;
 if first_id is null then return false; end if;
 if p_completed then
  if p_winner is null or p_winner not in (first_id,second_id) then raise exception 'invalid winner'; end if;
  perform arena_private.record_match(p_job,first_id,second_id,p_winner);
 end if;
 update arena_private.rating_jobs j set state=case when p_completed then 'completed' else 'failed' end,worker_token=null,lease_until=null where j.id=p_job;
 return true;
end $$;
revoke all on function public.arena_claim_rating(uuid) from public,anon,authenticated;
revoke all on function public.arena_finish_rating(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.arena_claim_rating(uuid) to service_role;
grant execute on function public.arena_finish_rating(uuid,uuid,uuid,boolean) to service_role;
