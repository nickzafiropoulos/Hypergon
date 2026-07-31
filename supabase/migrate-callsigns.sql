-- Callsign ownership (name unique; same IP may reuse)
-- Supabase → SQL Editor → New query → paste → Run
-- Then redeploy the leaderboard Edge Function.

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

-- Seed from existing scores (IP unknown → claimed on next matching submit)
insert into public.callsigns (name_key, name, owner_ip)
select distinct on (lower(name))
  lower(name) as name_key,
  name,
  null::text as owner_ip
from public.scores
order by lower(name), created_at asc
on conflict (name_key) do nothing;
