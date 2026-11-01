create index submissions_deleted_path_idx on arena_private.submissions(source_path) where source_deleted_at is not null;
create or replace function public.arena_claim_cleanup(p_token uuid) returns table(submission_id uuid,source_path text)
language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 update arena_private.submissions s set source_deleted_at=null,cleanup_until=null
 where s.source_deleted_at is not null and s.state in ('accepted','rejected') and s.source_path in
 (select o.name from storage.objects o where o.bucket_id='arena-submissions');
 with expired as (
  update arena_private.submissions s set state='rejected',error_message='上传未完成，请重新提交',cleanup_until=now()+interval '2 minutes'
  where s.state='staging' and s.created_at<now()-interval '25 minutes' and s.source_path is not null returning s.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s where s.source_path is not null and s.source_deleted_at is null and s.state in ('accepted','rejected') and (s.cleanup_until is null or s.cleanup_until<now()) order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.submissions s set cleanup_token=p_token,cleanup_until=now()+interval '5 minutes' where s.id=selected returning s.id,s.source_path;
end $$;
