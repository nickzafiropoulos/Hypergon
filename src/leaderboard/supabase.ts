import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sanitizeName } from './profanity';

export type ScoreRow = {
  id?: string;
  name: string;
  score: number;
  sector: number;
  kills: number;
  autofire?: boolean;
  created_at?: string;
};

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

export function isLeaderboardConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export async function fetchTopScores(limit = 10): Promise<ScoreRow[]> {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('scores')
    .select('id,name,score,sector,kills,autofire,created_at')
    .order('score', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as ScoreRow[];
}

export async function submitScore(input: {
  name: string;
  score: number;
  sector: number;
  kills: number;
  autofire: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const check = sanitizeName(input.name);
  if (!check.ok) return check;
  if (input.score <= 0) return { ok: false, reason: 'Score must be positive.' };

  const sb = getClient();
  if (!sb) return { ok: false, reason: 'Leaderboard offline - score saved locally only.' };

  const { error } = await sb.from('scores').insert({
    name: check.name,
    score: Math.floor(input.score),
    sector: Math.floor(input.sector),
    kills: Math.floor(input.kills),
    autofire: !!input.autofire,
  });
  if (error) return { ok: false, reason: 'Could not submit - try again.' };
  return { ok: true };
}
