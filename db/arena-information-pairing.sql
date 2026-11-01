-- Most idle pairings are uniform; a smaller share favors under-sampled pairs.
create or replace function public.arena_claim_rating(p_token uuid)
returns table(job_id uuid,first_player uuid,second_player uuid)
language plpgsql security invoker set search_path='' as $$
declare selected uuid; candidate_first uuid; candidate_second uuid; coverage boolean;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530713);
 update arena_private.rating_jobs set state='failed',worker_token=null,lease_until=null
 where state='processing' and lease_until<pg_catalog.now() and attempts>=3;
 if not exists(select 1 from arena_private.rating_jobs where state in ('pending','processing')) then
  coverage:=pg_catalog.random()<0.25;
  with eligible as (
   select p.id from public.arena_players p where p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline')
  ), pairs as (
   select p.id as a,q.id as b,(select count(*) from arena_private.matches m
    where (m.first_player=p.id and m.second_player=q.id) or (m.first_player=q.id and m.second_player=p.id)) as played
   from eligible p join eligible q on p.id<q.id
  )
  select a,b into candidate_first,candidate_second from pairs
  order by case when coverage then -pg_catalog.ln(greatest(pg_catalog.random(),1e-12::double precision))*pg_catalog.sqrt(1.0+played::double precision) else pg_catalog.random() end
  limit 1;
  if candidate_first is not null and candidate_second is not null then
   if pg_catalog.random()<0.5 then
    insert into arena_private.rating_jobs(first_player,second_player) values(candidate_first,candidate_second),(candidate_second,candidate_first);
   else
    insert into arena_private.rating_jobs(first_player,second_player) values(candidate_second,candidate_first),(candidate_first,candidate_second);
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
revoke all on function public.arena_claim_rating(uuid) from public,anon,authenticated;
grant execute on function public.arena_claim_rating(uuid) to service_role;
