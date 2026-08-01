-- Fix: Edge Function can start sessions but cannot INSERT scores
-- Supabase → SQL Editor → New query → paste → Run

grant all on table public.scores to service_role;
grant usage on schema public to service_role;
