-- Run this if you already created the scores table without autofire.
-- Supabase → SQL Editor → New query → paste → Run

alter table public.scores
  add column if not exists autofire boolean not null default false;
