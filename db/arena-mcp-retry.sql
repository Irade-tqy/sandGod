create or replace function public.arena_claim_mcp(p_token uuid)
returns table(submission_id uuid,player_id uuid,endpoint text)
language plpgsql security invoker set search_path = '' as $$
declare selected uuid;
begin
 if p_token is null then raise exception 'invalid token'; end if;
 with expired as (
  update arena_private.submissions set state='error',error_message='评测服务暂时不可用，请稍后重试',worker_token=null,lease_until=null
  where state='processing' and lease_until<now() and attempts>=3 returning arena_private.submissions.player_id
 ) update public.arena_players p set status='disabled' where p.id in (select expired.player_id from expired) and p.status='pending';
 select s.id into selected from arena_private.submissions s
 where s.endpoint is not null and (s.state='pending' or (s.state='processing' and s.lease_until<now())) and s.attempts<3
 order by s.created_at for update skip locked limit 1;
 if selected is null then return; end if;
 return query update arena_private.submissions s set state='processing',worker_token=p_token,lease_until=now()+interval '40 minutes',attempts=s.attempts+1
 where s.id=selected returning s.id,s.player_id,s.endpoint;
end $$;
