alter table arena_private.submissions drop constraint submissions_state_check;
alter table arena_private.submissions add constraint submissions_state_check check (state in ('staging','pending','processing','accepted','rejected'));
alter table arena_private.submissions
 add column source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
 add column source_size integer check (source_size is null or source_size between 1 and 10485760),
 add column source_deleted_at timestamptz,
 add column cleanup_token uuid,
 add column cleanup_until timestamptz;

CREATE OR REPLACE FUNCTION public.arena_reserve_source(p_owner uuid, p_name text, p_author text, p_kind text, p_sha256 text, p_size integer)
 RETURNS TABLE(submission_id uuid, source_path text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare player uuid; submission uuid:=pg_catalog.gen_random_uuid(); object_path text;
begin
 if p_owner is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_kind not in ('c','cpp') or p_kind is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 1 and 10485760 then raise exception 'invalid submission'; end if;
 perform pg_catalog.pg_advisory_xact_lock(84530712);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,1729));
 if (select count(*) from arena_private.submissions where state in ('staging','pending','processing'))>=100 then raise exception 'queue full'; end if;
 if (select count(*) from arena_private.submissions s where s.source_path is not null and s.source_deleted_at is null)>=15 then raise exception 'storage full'; end if;
 if (select count(*) from arena_private.submissions where owner_id=p_owner and created_at>now()-interval '24 hours')>=5 then raise exception 'daily quota exceeded'; end if;
 if exists(select 1 from arena_private.submissions where owner_id=p_owner and state in ('staging','pending','processing')) then raise exception 'submission already pending'; end if;
 object_path:='pending/'||p_owner::text||'/'||submission::text||'.'||p_kind;
 insert into public.arena_players(name,author_name,kind,status,mcp_status) values (trim(p_name),trim(p_author),p_kind,'pending',null) returning id into player;
 insert into arena_private.submissions(id,owner_id,player_id,source_path,state,source_sha256,source_size) values (submission,p_owner,player,object_path,'staging',p_sha256,p_size);
 return query select submission,object_path;
end $function$;

CREATE OR REPLACE FUNCTION public.arena_publish_source(p_submission uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 update arena_private.submissions s set state='pending' where s.id=p_submission and s.owner_id=p_owner and s.state='staging' and s.created_at>now()-interval '20 minutes' and s.source_path is not null;
 return found;
end $function$;

CREATE OR REPLACE FUNCTION public.arena_cancel_source(p_submission uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare player uuid;
begin
 update arena_private.submissions s set state='rejected',error_message='上传未完成，请重新提交' where s.id=p_submission and s.owner_id=p_owner and s.state='staging' and s.source_path is not null returning s.player_id into player;
 if player is null then return false; end if;
 update public.arena_players p set status='disabled' where p.id=player and p.status='pending';
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.arena_claim_cleanup(p_token uuid)
 RETURNS TABLE(submission_id uuid, source_path text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 with expired as (
  update arena_private.submissions s set state='rejected',error_message='上传未完成，请重新提交'
  where s.state='staging' and s.created_at<now()-interval '20 minutes' and s.source_path is not null returning s.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s where s.source_path is not null and s.source_deleted_at is null and s.state in ('accepted','rejected') and (s.cleanup_until is null or s.cleanup_until<now()) order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.submissions s set cleanup_token=p_token,cleanup_until=now()+interval '5 minutes' where s.id=selected returning s.id,s.source_path;
end $function$;

CREATE OR REPLACE FUNCTION public.arena_finish_cleanup(p_submission uuid, p_token uuid, p_deleted boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_submission is null or p_token is null or p_deleted is null then raise exception 'invalid result'; end if;
 update arena_private.submissions s set source_deleted_at=case when p_deleted then now() else null end,cleanup_token=null,cleanup_until=case when p_deleted then null else now()+interval '1 minute' end
 where s.id=p_submission and s.cleanup_token=p_token and s.cleanup_until>now() and s.source_path is not null and s.state in ('accepted','rejected') and s.source_deleted_at is null;
 return found;
end $function$;

revoke all on function public.arena_reserve_source(uuid,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.arena_publish_source(uuid,uuid) from public,anon,authenticated;
revoke all on function public.arena_cancel_source(uuid,uuid) from public,anon,authenticated;
revoke all on function public.arena_claim_cleanup(uuid) from public,anon,authenticated;
revoke all on function public.arena_finish_cleanup(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.arena_reserve_source(uuid,text,text,text,text,integer) to service_role;
grant execute on function public.arena_publish_source(uuid,uuid) to service_role;
grant execute on function public.arena_cancel_source(uuid,uuid) to service_role;
grant execute on function public.arena_claim_cleanup(uuid) to service_role;
grant execute on function public.arena_finish_cleanup(uuid,uuid,boolean) to service_role;
