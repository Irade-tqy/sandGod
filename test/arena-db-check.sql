\set ON_ERROR_STOP on
set role service_role;
do $$
declare a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; result jsonb; published boolean;
begin
 perform arena_private.record_match('10000000-0000-0000-0000-000000000001',a,b,a);
 result:=public.arena_rating_snapshot();
 if (result->>'match_count')::int<>1 or jsonb_array_length(result->'games')<>1 then raise exception 'snapshot incorrect'; end if;
 published:=public.arena_publish_ratings(0,'[]'::jsonb);
 if published or (select rating from public.arena_players where id=a)<>1400 then raise exception 'stale snapshot published'; end if;
 published:=public.arena_publish_ratings(1,jsonb_build_array(jsonb_build_object('id',a,'rating',1550,'lower',1500,'upper',1600),jsonb_build_object('id',b,'rating',1450,'lower',1400,'upper',1500)));
 if not published or (select rating from public.arena_players where id=a)<>1550 or (select matches from public.arena_players where id=a)<>1 then raise exception 'publish incorrect'; end if;
 if has_function_privilege('anon','public.arena_rating_snapshot()','EXECUTE') or has_function_privilege('authenticated','public.arena_publish_ratings(bigint,jsonb)','EXECUTE') then raise exception 'private rating endpoint exposed'; end if;
 perform * from public.arena_claim_rating('20000000-0000-0000-0000-000000000001');
 if (select count(*) from arena_private.rating_jobs)<>2 then raise exception 'pairing failed'; end if;
end $$;
reset role;
