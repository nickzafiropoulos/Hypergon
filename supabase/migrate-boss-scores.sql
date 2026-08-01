-- Boss Mode leaderboard + session mode flag
-- Supabase → SQL Editor → New query → paste → Run
-- Then redeploy the leaderboard Edge Function.

-- Session mode (survival vs boss)
alter table public.game_sessions
  add column if not exists mode text not null default 'survival';

alter table public.game_sessions
  add column if not exists last_bosses integer not null default 0;

alter table public.game_sessions
  drop constraint if exists game_sessions_mode_check;
alter table public.game_sessions
  add constraint game_sessions_mode_check check (mode in ('survival', 'boss'));

alter table public.game_sessions
  drop constraint if exists game_sessions_last_bosses_check;
alter table public.game_sessions
  add constraint game_sessions_last_bosses_check
  check (last_bosses >= 0 and last_bosses <= 20);

-- Boss scores: ranked by bosses killed (desc), then faster time (asc)
create table if not exists public.boss_scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 12),
  bosses_killed integer not null check (bosses_killed > 0 and bosses_killed <= 20),
  elapsed double precision not null check (elapsed >= 0),
  autofire boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists boss_scores_rank_idx
  on public.boss_scores (bosses_killed desc, elapsed asc);

alter table public.boss_scores enable row level security;

grant select on public.boss_scores to anon, authenticated;
revoke insert, update, delete on public.boss_scores from anon, authenticated;
grant all on table public.boss_scores to service_role;

drop policy if exists "Public read boss scores" on public.boss_scores;
create policy "Public read boss scores"
  on public.boss_scores for select
  to anon, authenticated
  using (true);
