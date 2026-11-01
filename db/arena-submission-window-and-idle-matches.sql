create or replace function public.arena_enqueue_mcp(p_owner uuid,p_name text,p_author text,p_endpoint text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare player uuid; submission uuid; recent_count bigint; oldest_submission timestamptz; wait_seconds integer;
begin
 if p_owner is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_endpoint is null or char_length(p_endpoint)>2048 or p_endpoint !~ '^https://' then
  raise exception 'invalid submission';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(84530712);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,1729));
 if (select count(*) from arena_private.submissions where state in ('staging','pending','processing'))>=100 then raise exception 'queue full'; end if;
 select count(*),min(s.created_at) into recent_count,oldest_submission
 from arena_private.submissions s where s.owner_id=p_owner and s.created_at>pg_catalog.clock_timestamp()-interval '5 minutes';
 if recent_count>=3 then
  wait_seconds:=pg_catalog.ceil(extract(epoch from (oldest_submission+interval '5 minutes'-pg_catalog.clock_timestamp())))::integer;
  if wait_seconds<1 then wait_seconds:=1; end if;
  raise exception 'submission rate limit:%',wait_seconds;
 end if;
 insert into public.arena_players(name,author_name,kind,status,mcp_status) values (trim(p_name),trim(p_author),'mcp','pending','unchecked') returning id into player;
 insert into arena_private.submissions(owner_id,player_id,endpoint) values (p_owner,player,p_endpoint) returning id into submission;
 return submission;
end $$;

create or replace function public.arena_reserve_source(p_owner uuid,p_name text,p_author text,p_kind text,p_sha256 text,p_size integer)
returns table(submission_id uuid,source_path text)
language plpgsql security invoker set search_path = '' as $$
declare player uuid; submission uuid:=pg_catalog.gen_random_uuid(); object_path text; recent_count bigint; oldest_submission timestamptz; wait_seconds integer;
begin
 if p_owner is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_kind not in ('c','cpp') or p_kind is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 1 and 10485760 then raise exception 'invalid submission'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530712);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,1729));
 if (select count(*) from arena_private.submissions where state in ('staging','pending','processing'))>=100 then raise exception 'queue full'; end if;
 if (select count(*) from arena_private.submissions s where s.source_path is not null and s.source_deleted_at is null)>=15 then raise exception 'storage full'; end if;
 select count(*),min(s.created_at) into recent_count,oldest_submission
 from arena_private.submissions s where s.owner_id=p_owner and s.created_at>pg_catalog.clock_timestamp()-interval '5 minutes';
 if recent_count>=3 then
  wait_seconds:=pg_catalog.ceil(extract(epoch from (oldest_submission+interval '5 minutes'-pg_catalog.clock_timestamp())))::integer;
  if wait_seconds<1 then wait_seconds:=1; end if;
  raise exception 'submission rate limit:%',wait_seconds;
 end if;
 object_path:='pending/'||p_owner::text||'/'||submission::text||'.'||p_kind;
 insert into public.arena_players(name,author_name,kind,status,mcp_status) values (trim(p_name),trim(p_author),p_kind,'pending',null) returning id into player;
 insert into arena_private.submissions(id,owner_id,player_id,source_path,state,source_sha256,source_size) values (submission,p_owner,player,object_path,'staging',p_sha256,p_size);
 return query select submission,object_path;
end $$;

create or replace function public.arena_claim_rating(p_token uuid)
returns table(job_id uuid,first_player uuid,second_player uuid)
language plpgsql security invoker set search_path = '' as $$
declare selected uuid; candidate_first uuid; candidate_second uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 update arena_private.rating_jobs set state='failed',worker_token=null,lease_until=null
 where state='processing' and lease_until<pg_catalog.now() and attempts>=3;
 if not exists(select 1 from arena_private.rating_jobs where state in ('pending','processing')) then
  select p.id into candidate_first from public.arena_players p
  where p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline')
  order by pg_catalog.random() limit 1;
  if candidate_first is not null then
   select p.id into candidate_second from public.arena_players p
   where p.id<>candidate_first and p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline')
   order by pg_catalog.random() limit 1;
   if candidate_second is not null then
    if pg_catalog.random()<0.5 then
     insert into arena_private.rating_jobs(first_player,second_player) values (candidate_first,candidate_second),(candidate_second,candidate_first);
    else
     insert into arena_private.rating_jobs(first_player,second_player) values (candidate_second,candidate_first),(candidate_first,candidate_second);
    end if;
   end if;
  end if;
 end if;
 select j.id into selected from arena_private.rating_jobs j
 where (j.state='pending' or (j.state='processing' and j.lease_until<pg_catalog.now())) and j.attempts<3
 order by j.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.rating_jobs j set state='processing',worker_token=p_token,lease_until=pg_catalog.now()+interval '30 minutes',attempts=j.attempts+1
 where j.id=selected returning j.id,j.first_player,j.second_player;
end $$;

revoke all on function public.arena_enqueue_mcp(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.arena_reserve_source(uuid,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.arena_claim_rating(uuid) from public,anon,authenticated;
grant execute on function public.arena_enqueue_mcp(uuid,text,text,text) to service_role;
grant execute on function public.arena_reserve_source(uuid,text,text,text,text,integer) to service_role;
grant execute on function public.arena_claim_rating(uuid) to service_role;
