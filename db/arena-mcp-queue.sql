alter table arena_private.submissions
 add column attempts integer not null default 0 check (attempts between 0 and 3),
 add column lease_until timestamptz,
 add column worker_token uuid,
 add column error_message text check (error_message is null or char_length(error_message)<=240);
create index submissions_queue_idx on arena_private.submissions (created_at) where state in ('pending','processing');

create function public.arena_enqueue_mcp(p_owner uuid,p_name text,p_author text,p_endpoint text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare player uuid; submission uuid;
begin
 if p_owner is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_endpoint is null or char_length(p_endpoint)>2048 or p_endpoint !~ '^https://' then
  raise exception 'invalid submission';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(84530712);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,1729));
 if (select count(*) from arena_private.submissions where state in ('pending','processing'))>=100 then raise exception 'queue full'; end if;
 if (select count(*) from arena_private.submissions where owner_id=p_owner and created_at>now()-interval '24 hours')>=5 then raise exception 'daily quota exceeded'; end if;
 if exists(select 1 from arena_private.submissions where owner_id=p_owner and state in ('pending','processing')) then raise exception 'submission already pending'; end if;
 insert into public.arena_players(name,author_name,kind,status,mcp_status) values (trim(p_name),trim(p_author),'mcp','pending','unchecked') returning id into player;
 insert into arena_private.submissions(owner_id,player_id,endpoint) values (p_owner,player,p_endpoint) returning id into submission;
 return submission;
end $$;

create function public.arena_claim_mcp(p_token uuid)
returns table(submission_id uuid,player_id uuid,endpoint text)
language plpgsql security invoker set search_path = '' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 with expired as (
  update arena_private.submissions set state='rejected',error_message='验证多次失败，请重新提交',worker_token=null,lease_until=null
  where state='processing' and lease_until<now() and attempts>=3 returning arena_private.submissions.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s
 where s.endpoint is not null and (s.state='pending' or (s.state='processing' and s.lease_until<now())) and s.attempts<3
 order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.submissions s set state='processing',worker_token=p_token,lease_until=now()+interval '40 minutes',attempts=s.attempts+1
 where s.id=selected returning s.id,s.player_id,s.endpoint;
end $$;

create function public.arena_finish_mcp(p_submission uuid,p_token uuid,p_accepted boolean,p_error text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare player uuid;
begin
 if p_submission is null or p_token is null or p_accepted is null or (p_error is not null and char_length(p_error)>240) then raise exception 'invalid result'; end if;
 update arena_private.submissions s set state=case when p_accepted then 'accepted' else 'rejected' end,
 error_message=case when p_accepted then null else coalesce(p_error,'验证失败') end,worker_token=null,lease_until=null
 where s.id=p_submission and s.state='processing' and s.worker_token=p_token and s.lease_until>now() and s.endpoint is not null returning s.player_id into player;
 if player is null then return false; end if;
 update public.arena_players p set status=case when p_accepted then 'active' else 'disabled' end,
 mcp_status=case when p_accepted then 'online' else 'offline' end where p.id=player and p.status='pending';
 if not found then raise exception 'invalid player state'; end if;
 return true;
end $$;

revoke all on function public.arena_enqueue_mcp(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.arena_claim_mcp(uuid) from public,anon,authenticated;
revoke all on function public.arena_finish_mcp(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.arena_enqueue_mcp(uuid,text,text,text) to service_role;
grant execute on function public.arena_claim_mcp(uuid) to service_role;
grant execute on function public.arena_finish_mcp(uuid,uuid,boolean,text) to service_role;
