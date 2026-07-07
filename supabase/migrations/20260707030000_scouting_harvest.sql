create table if not exists public.scouting_events (
  id text primary key,
  league_id text not null,
  season integer not null,
  manager_key text not null,
  provider text not null check (provider in ('sleeper', 'espn')),
  event_type text not null check (
    event_type in ('draft_pick', 'trade', 'waiver_add', 'waiver_drop', 'faab_bid')
  ),
  player_id text,
  detail jsonb not null default '{}'::jsonb,
  league_format text not null check (league_format in ('redraft', 'keeper', 'dynasty')),
  harvested_at timestamptz not null default now()
);

create index if not exists scouting_events_league_manager_idx
  on public.scouting_events (provider, league_id, manager_key);

create index if not exists scouting_events_league_season_idx
  on public.scouting_events (provider, league_id, season);

create table if not exists public.scouting_reads (
  manager_key text not null,
  provider text not null check (provider in ('sleeper', 'espn')),
  league_id text not null,
  traits jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (manager_key, provider, league_id)
);

create table if not exists public.scouting_edits (
  owner_user_id uuid not null,
  manager_key text not null,
  league_id text not null,
  overrides jsonb not null default '{}'::jsonb,
  untouchables text[] not null default '{}',
  favorite_team text,
  negotiation_style text check (
    negotiation_style in ('clean', 'counters', 'ghosts') or negotiation_style is null
  ),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, manager_key, league_id)
);

alter table public.scouting_events enable row level security;
alter table public.scouting_reads enable row level security;
alter table public.scouting_edits enable row level security;

drop policy if exists "Users can read their scouting edits" on public.scouting_edits;
create policy "Users can read their scouting edits"
  on public.scouting_edits
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "Users can write their scouting edits" on public.scouting_edits;
create policy "Users can write their scouting edits"
  on public.scouting_edits
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
