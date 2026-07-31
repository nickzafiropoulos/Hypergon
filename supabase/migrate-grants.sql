-- Fix: leaderboard fails to LOAD (permission denied on SELECT)
-- Supabase → SQL Editor → New query → paste → Run
--
-- Note: INSERT is intentionally NOT granted to anon.
-- Scores are written only by the Edge Function (service role). See migrate-sessions.sql.

grant select on public.scores to anon, authenticated;
