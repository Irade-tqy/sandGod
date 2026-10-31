create function arena_private.record_match(match_id uuid, first_id uuid, second_id uuid, winner_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare first_rating double precision; second_rating double precision; expected double precision; delta double precision;
begin
 if first_id is null or second_id is null or first_id = second_id or winner_id is null or winner_id not in (first_id, second_id) then
  raise exception 'invalid match';
 end if;
 perform id from public.arena_players where id in (first_id,second_id) order by id for update;
 select rating into first_rating from public.arena_players where id=first_id and status='active';
 select rating into second_rating from public.arena_players where id=second_id and status='active';
 if first_rating is null or second_rating is null then raise exception 'players are not active'; end if;
 insert into arena_private.matches(id,first_player,second_player,winner) values (match_id,first_id,second_id,winner_id);
 expected := 1 / (1 + power(10.0, (second_rating-first_rating)/400.0));
 delta := 32 * ((case when winner_id=first_id then 1.0 else 0.0 end) - expected);
 update public.arena_players set rating=rating+delta,matches=matches+1 where id=first_id;
 update public.arena_players set rating=rating-delta,matches=matches+1 where id=second_id;
end $$;
revoke all on function arena_private.record_match(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function arena_private.record_match(uuid,uuid,uuid,uuid) to service_role;
