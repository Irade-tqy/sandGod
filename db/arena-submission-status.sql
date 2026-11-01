create view public.arena_submission_status with (security_invoker=true) as
select id,owner_id,player_id,state,error_message,created_at
from arena_private.submissions;
revoke all on public.arena_submission_status from public,anon,authenticated;
grant select on public.arena_submission_status to service_role;
