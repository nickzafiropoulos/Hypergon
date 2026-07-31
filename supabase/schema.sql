-- Hypergon leaderboard schema
--
-- HOW TO RUN (Supabase dashboard):
--   1. Open your project → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- That creates the "scores" table + read/insert policies. No manual table setup needed.

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 12),
  score integer not null check (score > 0),
  sector integer not null default 1 check (sector >= 1),
  kills integer not null default 0 check (kills >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

-- Anyone can read the board
create policy "Public read scores"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Anyone can insert a valid row (no updates/deletes)
create policy "Public insert scores"
  on public.scores for insert
  to anon, authenticated
  with check (
    char_length(name) between 2 and 12
    and score > 0
    and sector >= 1
    and kills >= 0
  );
