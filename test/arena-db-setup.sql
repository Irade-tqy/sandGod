\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role bypassrls;
create schema arena_private;
create table public.arena_players(id uuid primary key,status text not null,kind text not null,mcp_status text,rating double precision not null default 1500,matches integer not null default 0);
create table arena_private.matches(id uuid primary key,first_player uuid not null,second_player uuid not null,winner uuid,completed_at timestamptz not null default now());
create table arena_private.rating_jobs(id uuid primary key default gen_random_uuid(),first_player uuid,second_player uuid,state text not null default 'pending',attempts integer not null default 0,worker_token uuid,lease_until timestamptz,created_at timestamptz not null default now());
grant usage on schema arena_private to service_role;
grant all on public.arena_players,arena_private.matches,arena_private.rating_jobs to service_role;
insert into public.arena_players(id,status,kind,rating) values ('00000000-0000-0000-0000-000000000001','active','cpp',1400),('00000000-0000-0000-0000-000000000002','active','reference',1600);
