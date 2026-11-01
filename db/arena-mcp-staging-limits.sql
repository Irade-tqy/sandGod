create or replace function public.arena_enqueue_mcp(p_owner uuid,p_name text,p_author text,p_endpoint text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare player uuid; submission uuid;
begin
 if p_owner is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_endpoint is null or char_length(p_endpoint)>2048 or p_endpoint !~ '^https://' then
  raise exception 'invalid submission';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(84530712);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,1729));
 if (select count(*) from arena_private.submissions where state in ('staging','pending','processing'))>=100 then raise exception 'queue full'; end if;
 if (select count(*) from arena_private.submissions where owner_id=p_owner and created_at>now()-interval '24 hours')>=5 then raise exception 'daily quota exceeded'; end if;
 if exists(select 1 from arena_private.submissions where owner_id=p_owner and state in ('staging','pending','processing')) then raise exception 'submission already pending'; end if;
 insert into public.arena_players(name,author_name,kind,status,mcp_status) values (trim(p_name),trim(p_author),'mcp','pending','unchecked') returning id into player;
 insert into arena_private.submissions(owner_id,player_id,endpoint) values (p_owner,player,p_endpoint) returning id into submission;
 return submission;
end $$;
