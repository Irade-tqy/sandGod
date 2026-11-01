-- Gently favor old-new pairs, then new-new pairs, when idle ladder matches are created.
create or replace function public.arena_claim_rating(p_token uuid)
returns table(job_id uuid,first_player uuid,second_player uuid)
language plpgsql security invoker set search_path = '' as $$
declare selected uuid; candidate_first uuid; candidate_second uuid; average_matches double precision;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 update arena_private.rating_jobs set state='failed',worker_token=null,lease_until=null
 where state='processing' and lease_until<pg_catalog.now() and attempts>=3;
 if not exists(select 1 from arena_private.rating_jobs where state in ('pending','processing')) then
  select coalesce(avg(p.matches),0)::double precision into average_matches
  from public.arena_players p
  where p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline');
  with eligible as (
   select p.id,p.matches,
    p.matches::double precision<0.8*average_matches as is_new,
    case when average_matches>0 then greatest(0.0,least(1.0,(0.8*average_matches-p.matches::double precision)/(0.6*average_matches))) else 0.0 end as underplayed
   from public.arena_players p
   where p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline')
  )
  select p.id,q.id into candidate_first,candidate_second
  from eligible p join eligible q on p.id<q.id
  order by -pg_catalog.ln(greatest(pg_catalog.random(),1e-12::double precision)) /
   (case
    when p.is_new<>q.is_new then 1.10+0.20*greatest(0.0,least(1.0,pg_catalog.abs(p.matches::double precision-q.matches::double precision)/80.0))
    when p.is_new and q.is_new then 1.03+0.06*greatest(p.underplayed,q.underplayed)
    else 1.0
   end)
  limit 1;
  if candidate_first is not null and candidate_second is not null then
   if pg_catalog.random()<0.5 then
    insert into arena_private.rating_jobs(first_player,second_player) values (candidate_first,candidate_second),(candidate_second,candidate_first);
   else
    insert into arena_private.rating_jobs(first_player,second_player) values (candidate_second,candidate_first),(candidate_first,candidate_second);
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
