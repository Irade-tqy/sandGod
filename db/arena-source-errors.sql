alter table arena_private.submissions drop constraint submissions_state_check;
alter table arena_private.submissions add constraint submissions_state_check check (state in ('staging','pending','processing','accepted','rejected','error'));
create or replace function public.arena_claim_source(p_token uuid)
returns table(submission_id uuid,player_id uuid,source_path text,source_sha256 text,source_size integer,kind text)
language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 with expired as (
  update arena_private.submissions s set state='error',error_message='评测服务暂时不可用，源码已保留',worker_token=null,lease_until=null
  where s.source_path is not null and s.state='processing' and s.lease_until<now() and s.attempts>=3 returning s.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s
 where s.source_path is not null and (s.state='pending' or (s.state='processing' and s.lease_until<now())) and s.attempts<3
 order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query with claimed as (
  update arena_private.submissions s set state='processing',worker_token=p_token,lease_until=now()+interval '40 minutes',attempts=s.attempts+1
  where s.id=selected returning s.id,s.player_id,s.source_path,s.source_sha256,s.source_size
 ) select c.id,c.player_id,c.source_path,c.source_sha256,c.source_size,p.kind from claimed c join public.arena_players p on p.id=c.player_id;
end $$;
