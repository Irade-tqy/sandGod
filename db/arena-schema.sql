create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;
create table public.arena_players (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 60),
 author_name text not null check (char_length(author_name) between 1 and 60),
 kind text not null check (kind in ('c','cpp','mcp')),
 status text not null default 'pending' check (status in ('pending','active','disabled')),
 mcp_status text check (mcp_status in ('online','offline','unchecked')),
 rating double precision not null default 1500 check (rating >= 0 and rating <= 10000),
 matches integer not null default 0 check (matches >= 0),
 created_at timestamptz not null default now(),
 check ((kind = 'mcp') = (mcp_status is not null))
);
alter table public.arena_players enable row level security;
revoke all on public.arena_players from public, anon, authenticated;
grant select on public.arena_players to anon, authenticated;
grant all on public.arena_players to service_role;
create policy "read active players" on public.arena_players for select to anon, authenticated using (status = 'active');
create index arena_players_rank on public.arena_players (rating desc) where status = 'active';
create table arena_private.submissions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 player_id uuid references public.arena_players(id),
 source_path text,
 endpoint text,
 state text not null default 'pending' check (state in ('pending','processing','accepted','rejected')),
 created_at timestamptz not null default now(),
 check ((source_path is null) <> (endpoint is null))
);
create index submissions_owner_idx on arena_private.submissions(owner_id);
create table arena_private.matches (
 id uuid primary key default gen_random_uuid(),
 first_player uuid not null references public.arena_players(id),
 second_player uuid not null references public.arena_players(id),
 winner uuid references public.arena_players(id),
 completed_at timestamptz not null default now(),
 check (first_player <> second_player),
 check (winner is null or winner = first_player or winner = second_player)
);
create index matches_first_idx on arena_private.matches(first_player);
create index matches_second_idx on arena_private.matches(second_player);
alter table arena_private.submissions enable row level security;
alter table arena_private.matches enable row level security;
revoke all on all tables in schema arena_private from public, anon, authenticated;
grant all on all tables in schema arena_private to service_role;
insert into storage.buckets (id, name, public, file_size_limit) values ('arena-submissions','arena-submissions',false,10485760);
