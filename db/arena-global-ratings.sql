alter table public.arena_players add column if not exists rating_lower double precision;
alter table public.arena_players add column if not exists rating_upper double precision;

create table if not exists arena_private.rating_backups (
 batch_id uuid not null,player_id uuid not null,rating double precision not null,matches integer not null,created_at timestamptz not null default now(),primary key(batch_id,player_id)
);
alter table arena_private.rating_backups enable row level security;
revoke all on arena_private.rating_backups from public,anon,authenticated;
grant select on arena_private.rating_backups to service_role;
with batch as (select pg_catalog.gen_random_uuid() as id)
insert into arena_private.rating_backups(batch_id,player_id,rating,matches)
select batch.id,p.id,p.rating,p.matches from public.arena_players p cross join batch;

create or replace function public.arena_rating_snapshot() returns jsonb
language sql security invoker set search_path='' as $$
 select pg_catalog.jsonb_build_object(
  'match_count',(select count(*) from arena_private.matches),
  'ids',coalesce((select pg_catalog.jsonb_agg(p.id order by p.id) from public.arena_players p
   where p.status='active' or exists(select 1 from arena_private.matches m where m.first_player=p.id or m.second_player=p.id)), '[]'::jsonb),
  'games',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('first',m.first_player,'second',m.second_player,'winner',m.winner,'count',m.n) order by m.first_player,m.second_player,m.winner) from (select first_player,second_player,winner,count(*) as n from arena_private.matches group by first_player,second_player,winner) m), '[]'::jsonb)
 );
$$;

create or replace function public.arena_publish_ratings(p_match_count bigint,p_results jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare expected bigint; supplied bigint;
begin
 if p_match_count is null or p_match_count<0 or p_results is null or pg_catalog.jsonb_typeof(p_results)<>'array' then raise exception 'invalid ratings'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 lock table public.arena_players in share row exclusive mode;
 if (select count(*) from arena_private.matches)<>p_match_count then return false; end if;
 select count(*) into expected from public.arena_players p where p.status='active' or exists(select 1 from arena_private.matches m where m.first_player=p.id or m.second_player=p.id);
 select count(*) into supplied from pg_catalog.jsonb_to_recordset(p_results) as x(id uuid,rating double precision,lower double precision,upper double precision);
 if expected<>supplied or exists(select 1 from pg_catalog.jsonb_to_recordset(p_results) as x(id uuid,rating double precision,lower double precision,upper double precision)
  left join public.arena_players p on p.id=x.id
  where p.id is null or not (p.status='active' or exists(select 1 from arena_private.matches m where m.first_player=p.id or m.second_player=p.id))
   or x.rating is null or x.rating not between 0 and 10000 or ((x.lower is null)<>(x.upper is null))
   or (x.lower is not null and (x.lower>x.rating or x.upper<x.rating)))
  or exists(select x.id from pg_catalog.jsonb_to_recordset(p_results) as x(id uuid,rating double precision,lower double precision,upper double precision) group by x.id having count(*)<>1)
 then raise exception 'invalid rating results'; end if;
 update public.arena_players p set rating=x.rating,rating_lower=x.lower,rating_upper=x.upper
 from pg_catalog.jsonb_to_recordset(p_results) as x(id uuid,rating double precision,lower double precision,upper double precision) where p.id=x.id;
 return true;
end $$;

create or replace function arena_private.record_match(match_id uuid,first_id uuid,second_id uuid,winner_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if first_id is null or second_id is null or first_id=second_id or winner_id is null or winner_id not in (first_id,second_id) then raise exception 'invalid match'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 perform p.id from public.arena_players p where p.id in (first_id,second_id) order by p.id for update;
 if (select count(*) from public.arena_players p where p.id in (first_id,second_id) and p.status='active')<>2 then raise exception 'players are not active'; end if;
 insert into arena_private.matches(id,first_player,second_player,winner) values(match_id,first_id,second_id,winner_id);
 update public.arena_players set matches=matches+1 where id in (first_id,second_id);
end $$;

create or replace function public.arena_finish_rating(p_job uuid,p_token uuid,p_winner uuid,p_completed boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare first_id uuid; second_id uuid;
begin
 if p_job is null or p_token is null or p_completed is null then raise exception 'invalid result'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 select j.first_player,j.second_player into first_id,second_id from arena_private.rating_jobs j
 where j.id=p_job and j.state='processing' and j.worker_token=p_token and j.lease_until>pg_catalog.now() for update;
 if first_id is null then return false; end if;
 if p_completed then
  if p_winner is null or p_winner not in (first_id,second_id) then raise exception 'invalid winner'; end if;
  perform arena_private.record_match(p_job,first_id,second_id,p_winner);
 end if;
 update arena_private.rating_jobs j set state=case when p_completed then 'completed' else 'failed' end,worker_token=null,lease_until=null where j.id=p_job;
 return true;
end $$;

revoke all on function public.arena_rating_snapshot() from public,anon,authenticated;
revoke all on function public.arena_publish_ratings(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.arena_finish_rating(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function arena_private.record_match(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.arena_rating_snapshot() to service_role;
grant execute on function public.arena_publish_ratings(bigint,jsonb) to service_role;
grant execute on function public.arena_finish_rating(uuid,uuid,uuid,boolean) to service_role;
grant execute on function arena_private.record_match(uuid,uuid,uuid,uuid) to service_role;
