-- Hypergon leaderboard schema
--
-- HOW TO RUN (Supabase dashboard):
--   1. Open your project → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- That creates the "scores" table + read/insert policies. No manual table setup needed.
--
-- If you already created the table earlier, instead run only:
--   supabase/migrate-autofire.sql

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 12),
  score integer not null check (score > 0),
  sector integer not null default 1 check (sector >= 1),
  kills integer not null default 0 check (kills >= 0),
  autofire boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

-- Table privileges (RLS policies alone are not enough on modern Supabase)
grant select, insert on public.scores to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Anyone can read the board
drop policy if exists "Public read scores" on public.scores;
create policy "Public read scores"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Anyone can insert a valid row (no updates/deletes)
drop policy if exists "Public insert scores" on public.scores;
create policy "Public insert scores"
  on public.scores for insert
  to anon, authenticated
  with check (
    char_length(name) between 2 and 12
    and score > 0
    and sector >= 1
    and kills >= 0
  );
