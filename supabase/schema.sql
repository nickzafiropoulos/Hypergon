-- Hypergon leaderboard schema (fresh install)
--
-- HOW TO RUN (Supabase dashboard):
--   1. Open your project → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--
-- Then deploy the Edge Function: supabase/functions/leaderboard
-- (see README → Secure leaderboard)

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 12),
  score integer not null check (score > 0 and score <= 50000000),
  sector integer not null default 1 check (sector >= 1),
  kills integer not null default 0 check (kills >= 0),
  autofire boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

grant select on public.scores to anon, authenticated;
-- Inserts only via Edge Function (service_role) — no public insert policy.

drop policy if exists "Public read scores" on public.scores;
create policy "Public read scores"
  on public.scores for select
  to anon, authenticated
  using (true);

drop policy if exists "Public insert scores" on public.scores;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_score integer not null default 0 check (last_score >= 0),
  last_kills integer not null default 0 check (last_kills >= 0),
  last_sector integer not null default 1 check (last_sector >= 1),
  last_elapsed double precision not null default 0 check (last_elapsed >= 0),
  beats integer not null default 0 check (beats >= 0),
  autofire boolean not null default false,
  finalized boolean not null default false
);

create index if not exists game_sessions_updated_idx
  on public.game_sessions (updated_at);

alter table public.game_sessions enable row level security;
revoke all on table public.game_sessions from anon, authenticated;
grant all on table public.game_sessions to service_role;

create table if not exists public.callsigns (
  name_key text primary key,
  name text not null,
  owner_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.callsigns enable row level security;
revoke all on table public.callsigns from anon, authenticated;
grant all on table public.callsigns to service_role;
