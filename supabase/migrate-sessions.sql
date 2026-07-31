-- Anti-cheat sessions + lock down public score inserts
-- Supabase → SQL Editor → New query → paste → Run
--
-- After this, scores can ONLY be inserted by the Edge Function (service role).
-- Deploy supabase/functions/leaderboard next (see README).

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
-- No anon/authenticated policies: only service role (Edge Function) can touch sessions.

revoke all on table public.game_sessions from anon, authenticated;
grant all on table public.game_sessions to service_role;

-- Stop direct client inserts into scores
drop policy if exists "Public insert scores" on public.scores;
revoke insert on public.scores from anon, authenticated;

-- Keep public reads
grant select on public.scores to anon, authenticated;

-- Soft cap on absurd scores (existing table)
alter table public.scores drop constraint if exists scores_score_max;
alter table public.scores
  add constraint scores_score_max check (score <= 50000000);
