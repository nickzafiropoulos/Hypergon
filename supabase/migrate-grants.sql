-- Fix: "Could not submit - try again" / permission denied for table scores
-- Cause: RLS policies exist, but anon/authenticated lack table GRANTs.
-- Supabase → SQL Editor → New query → paste → Run

grant select, insert on public.scores to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
