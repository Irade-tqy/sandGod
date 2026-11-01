-- Give players with fewer completed ladder matches a small sampling boost.
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
  order by -pg_catalog.ln(greatest(pg_catalog.random(),1e-12::double precision))
   / (1.0+0.1/pg_catalog.sqrt(p.matches::double precision+1.0))
  limit 1;
  if candidate_first is not null then
   select p.id into candidate_second from public.arena_players p
   where p.id<>candidate_first and p.status='active' and (p.kind<>'mcp' or p.mcp_status is distinct from 'offline')
   order by -pg_catalog.ln(greatest(pg_catalog.random(),1e-12::double precision))
    / (1.0+0.1/pg_catalog.sqrt(p.matches::double precision+1.0))
   limit 1;
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
