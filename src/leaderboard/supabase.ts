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

export type SessionStats = {
  score: number;
  kills: number;
  sector: number;
  elapsed: number;
  autofire: boolean;
};

let client: SupabaseClient | null = null;
let sessionToken: string | null = null;

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

export function getSessionToken(): string | null {
  return sessionToken;
}

export function clearSessionToken(): void {
  sessionToken = null;
}

async function invokeLeaderboard(
  body: Record<string, unknown>,
): Promise<{ ok: true; token?: string } | { ok: false; reason: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, reason: 'Leaderboard offline - score saved locally only.' };
  try {
    const { data, error } = await sb.functions.invoke('leaderboard', { body });
    if (error) {
      console.warn('[hypergon] leaderboard fn error:', error.message);
      return { ok: false, reason: 'Could not reach leaderboard.' };
    }
    const res = data as { ok?: boolean; reason?: string; token?: string } | null;
    if (!res || res.ok !== true) {
      return { ok: false, reason: res?.reason || 'Request rejected.' };
    }
    return { ok: true, token: res.token };
  } catch (e) {
    console.warn('[hypergon] leaderboard invoke failed:', e);
    return { ok: false, reason: 'Could not reach leaderboard.' };
  }
}

/** Call when a run starts — issues a session token. */
export async function startGameSession(): Promise<boolean> {
  sessionToken = null;
  if (!isLeaderboardConfigured()) return false;
  const res = await invokeLeaderboard({ action: 'start' });
  if (!res.ok || !res.token) {
    console.warn('[hypergon] session start failed:', !res.ok ? res.reason : 'no token');
    return false;
  }
  sessionToken = res.token;
  return true;
}

/** Periodic + end-of-run progress ping so the server can reject score jumps. */
export async function beatGameSession(stats: SessionStats): Promise<boolean> {
  if (!sessionToken) return false;
  const res = await invokeLeaderboard({
    action: 'beat',
    token: sessionToken,
    score: Math.floor(stats.score),
    kills: Math.floor(stats.kills),
    sector: Math.floor(stats.sector),
    elapsed: stats.elapsed,
    autofire: !!stats.autofire,
  });
  if (!res.ok) {
    console.warn('[hypergon] session beat rejected:', res.reason);
    return false;
  }
  return true;
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
  elapsed: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const check = sanitizeName(input.name);
  if (!check.ok) return check;
  if (input.score <= 0) return { ok: false, reason: 'Score must be positive.' };
  if (!sessionToken) {
    return {
      ok: false,
      reason: 'No valid game session - start a new run to submit.',
    };
  }

  // Final beat so submit matches last server snapshot.
  await beatGameSession({
    score: input.score,
    kills: input.kills,
    sector: input.sector,
    elapsed: input.elapsed,
    autofire: input.autofire,
  });

  const res = await invokeLeaderboard({
    action: 'submit',
    token: sessionToken,
    name: check.name,
    score: Math.floor(input.score),
    kills: Math.floor(input.kills),
    sector: Math.floor(input.sector),
    elapsed: input.elapsed,
    autofire: !!input.autofire,
  });

  if (!res.ok) return res;
  sessionToken = null;
  return { ok: true };
}
