create function public.arena_record_match(p_match_id uuid,p_first uuid,p_second uuid,p_winner uuid) returns void
language sql security invoker set search_path = ''
as $$ select arena_private.record_match(p_match_id,p_first,p_second,p_winner) $$;
revoke all on function public.arena_record_match(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.arena_record_match(uuid,uuid,uuid,uuid) to service_role;
