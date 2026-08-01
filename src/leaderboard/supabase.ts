import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sanitizeName } from './profanity';

export type GameModeLb = 'survival' | 'boss';

export type ScoreRow = {
  id?: string;
  name: string;
  score: number;
  sector: number;
  kills: number;
  autofire?: boolean;
  created_at?: string;
};

export type BossScoreRow = {
  id?: string;
  name: string;
  bosses_killed: number;
  elapsed: number;
  autofire?: boolean;
  created_at?: string;
};

export type SessionStats = {
  mode: GameModeLb;
  score: number;
  kills: number;
  sector: number;
  bosses_killed: number;
  elapsed: number;
  autofire: boolean;
};

let client: SupabaseClient | null = null;
let sessionToken: string | null = null;
let sessionMode: GameModeLb = 'survival';
/** Bumps on clear/restart so late start responses can't clobber a newer run. */
let sessionEpoch = 0;
/** In-flight start so game-over can wait before deciding submit UI. */
let sessionStartPromise: Promise<boolean> | null = null;

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

export function getSessionMode(): GameModeLb {
  return sessionMode;
}

export function clearSessionToken(): void {
  sessionToken = null;
  sessionStartPromise = null;
  sessionMode = 'survival';
  sessionEpoch += 1;
}

/** Resolves once the current run's session start finishes (or immediately if none). */
export async function waitForGameSession(): Promise<boolean> {
  if (sessionToken) return true;
  if (sessionStartPromise) return sessionStartPromise;
  return false;
}

function reasonFromInvokeError(error: { message?: string; context?: Response }, data: unknown): string {
  const body = data as { message?: string; code?: string; reason?: string } | null;
  if (body?.reason) return body.reason;

  const msg = (error.message || '').toLowerCase();
  const hint = `${body?.message || ''} ${body?.code || ''}`.toLowerCase();
  if (msg.includes('not found') || hint.includes('not_found') || hint.includes('not found')) {
    return 'Leaderboard function not deployed.';
  }
  return 'Could not reach leaderboard.';
}

async function invokeLeaderboard(
  body: Record<string, unknown>,
): Promise<{ ok: true; token?: string } | { ok: false; reason: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, reason: 'Leaderboard offline - score saved locally only.' };
  try {
    const { data, error } = await sb.functions.invoke('leaderboard', { body });
    if (error) {
      let parsed: unknown = data;
      if (!parsed && error.context) {
        try {
          parsed = await error.context.json();
        } catch {
          /* ignore */
        }
      }
      const reason = reasonFromInvokeError(error, parsed);
      console.warn('[hypergon] leaderboard fn error:', error.message, reason);
      return { ok: false, reason };
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
export async function startGameSession(mode: GameModeLb = 'survival'): Promise<boolean> {
  sessionToken = null;
  sessionMode = mode;
  if (!isLeaderboardConfigured()) {
    sessionStartPromise = null;
    return false;
  }
  const epoch = sessionEpoch;
  const work = (async () => {
    const res = await invokeLeaderboard({ action: 'start', mode });
    if (epoch !== sessionEpoch) return false;
    if (!res.ok || !res.token) {
      console.warn('[hypergon] session start failed:', !res.ok ? res.reason : 'no token');
      sessionToken = null;
      return false;
    }
    sessionToken = res.token;
    return true;
  })();
  sessionStartPromise = work;
  const ok = await work;
  if (sessionStartPromise === work) sessionStartPromise = null;
  return ok;
}

/** Periodic + end-of-run progress ping so the server can reject score jumps. */
export async function beatGameSession(stats: SessionStats): Promise<boolean> {
  if (!sessionToken) return false;
  const res = await invokeLeaderboard({
    action: 'beat',
    token: sessionToken,
    mode: stats.mode,
    score: Math.floor(stats.score),
    kills: Math.floor(stats.kills),
    sector: Math.floor(stats.sector),
    bosses_killed: Math.floor(stats.bosses_killed),
    elapsed: stats.elapsed,
    autofire: !!stats.autofire,
  });
  if (!res.ok) {
    console.warn('[hypergon] session beat rejected:', res.reason);
    return false;
  }
  return true;
}

/** Survival board (capped for safety; Supabase default max rows is usually 1000). */
export async function fetchTopScores(limit = 1000): Promise<ScoreRow[]> {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('scores')
    .select('id,name,score,sector,kills,autofire,created_at')
    .order('score', { ascending: false })
    .limit(Math.min(Math.max(1, limit), 1000));
  if (error || !data) return [];
  return data as ScoreRow[];
}

/** Boss board: most bosses cleared, then fastest time. */
export async function fetchBossScores(limit = 1000): Promise<BossScoreRow[]> {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('boss_scores')
    .select('id,name,bosses_killed,elapsed,autofire,created_at')
    .order('bosses_killed', { ascending: false })
    .order('elapsed', { ascending: true })
    .limit(Math.min(Math.max(1, limit), 1000));
  if (error || !data) return [];
  return data as BossScoreRow[];
}

export async function submitScore(input: {
  name: string;
  mode?: GameModeLb;
  score: number;
  sector: number;
  kills: number;
  bosses_killed?: number;
  autofire: boolean;
  elapsed: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const check = sanitizeName(input.name);
  if (!check.ok) return check;
  const mode = input.mode || sessionMode;
  if (mode === 'boss') {
    const bosses = Math.floor(input.bosses_killed || 0);
    if (bosses <= 0) return { ok: false, reason: 'Clear at least one boss to submit.' };
  } else if (input.score <= 0) {
    return { ok: false, reason: 'Score must be positive.' };
  }
  if (!sessionToken) {
    return {
      ok: false,
      reason: 'No valid game session - start a new run to submit.',
    };
  }

  const stats: SessionStats = {
    mode,
    score: input.score,
    kills: input.kills,
    sector: input.sector,
    bosses_killed: input.bosses_killed || 0,
    elapsed: input.elapsed,
    autofire: input.autofire,
  };

  await beatGameSession(stats);

  const res = await invokeLeaderboard({
    action: 'submit',
    token: sessionToken,
    mode,
    name: check.name,
    score: Math.floor(input.score),
    kills: Math.floor(input.kills),
    sector: Math.floor(input.sector),
    bosses_killed: Math.floor(input.bosses_killed || 0),
    elapsed: input.elapsed,
    autofire: !!input.autofire,
  });

  if (!res.ok) return res;
  sessionToken = null;
  return { ok: true };
}
