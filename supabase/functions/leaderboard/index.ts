/**
 * Hypergon leaderboard Edge Function
 *
 * Actions (JSON body.action):
 *   start  → { token }
 *   beat   → { token, score, kills, sector, elapsed, autofire }
 *   submit → { token, name, score, kills, sector, elapsed, autofire }
 *
 * Deploy: Supabase Dashboard → Edge Functions → create "leaderboard"
 * (or `supabase functions deploy leaderboard`)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/** Generous but finite — blocks billion-point POSTs. */
const MAX_SCORE = 50_000_000;
/** Points/sec ceiling between heartbeats (very loose vs real play). */
const MAX_SCORE_PER_SEC = 40_000;
const MAX_KILLS_PER_SEC = 40;
const SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const BEAT_STALE_MS = 20_000;
const MIN_BEATS_FOR_SUBMIT = 1;

type Body = {
  action?: string;
  token?: string;
  name?: string;
  score?: number;
  kills?: number;
  sector?: number;
  elapsed?: number;
  autofire?: boolean;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase service env');
  return createClient(url, key, { auth: { persistSession: false } });
}

function sanitizeName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 12) {
    return { ok: false, reason: 'Callsign must be 2-12 characters.' };
  }
  if (!/^[A-Za-z0-9 _.\-]+$/.test(name)) {
    return { ok: false, reason: 'Callsign has invalid characters.' };
  }
  return { ok: true, name };
}

function nums(body: Body) {
  const score = Math.floor(Number(body.score) || 0);
  const kills = Math.floor(Number(body.kills) || 0);
  const sector = Math.floor(Number(body.sector) || 1);
  const elapsed = Math.max(0, Number(body.elapsed) || 0);
  const autofire = !!body.autofire;
  return { score, kills, sector, elapsed, autofire };
}

function validateProgress(
  prev: {
    last_score: number;
    last_kills: number;
    last_sector: number;
    last_elapsed: number;
    updated_at: string;
    created_at: string;
  },
  next: { score: number; kills: number; sector: number; elapsed: number },
  opts: { allowEqual: boolean },
): string | null {
  if (next.score < 0 || next.kills < 0 || next.sector < 1 || next.elapsed < 0) {
    return 'Invalid stats.';
  }
  if (next.score > MAX_SCORE) return 'Score rejected.';
  if (next.score < prev.last_score) return 'Score went backwards.';
  if (next.kills < prev.last_kills) return 'Kills went backwards.';
  if (next.elapsed + 0.05 < prev.last_elapsed) return 'Time went backwards.';
  if (!opts.allowEqual && next.score === prev.last_score && next.elapsed === prev.last_elapsed) {
    return null; // idle beat ok
  }

  const dt = Math.max(0.001, next.elapsed - prev.last_elapsed);
  const wallDt =
    (Date.now() - new Date(prev.updated_at).getTime()) / 1000;
  const span = Math.max(dt, Math.min(wallDt, 30));

  const scoreJump = next.score - prev.last_score;
  const killJump = next.kills - prev.last_kills;
  if (scoreJump > MAX_SCORE_PER_SEC * span + 2000) return 'Score jump too large.';
  if (killJump > MAX_KILLS_PER_SEC * span + 8) return 'Kill jump too large.';

  // Absolute ceiling vs play time (loose).
  if (next.score > next.elapsed * MAX_SCORE_PER_SEC + 8000) {
    return 'Score too high for play time.';
  }

  const expectedSector = 1 + Math.floor(next.elapsed / 40);
  if (next.sector > expectedSector + 1 || next.sector < Math.max(1, expectedSector - 1)) {
    return 'Sector does not match play time.';
  }

  const age = Date.now() - new Date(prev.created_at).getTime();
  if (age > SESSION_MAX_AGE_MS) return 'Session expired.';

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'Bad JSON' }, 400);
  }

  const action = body.action;
  let sb;
  try {
    sb = adminClient();
  } catch (e) {
    console.error(e);
    return json({ ok: false, reason: 'Server misconfigured' }, 500);
  }

  try {
    if (action === 'start') {
      const { data, error } = await sb
        .from('game_sessions')
        .insert({
          last_score: 0,
          last_kills: 0,
          last_sector: 1,
          last_elapsed: 0,
          beats: 0,
          autofire: false,
          finalized: false,
        })
        .select('id')
        .single();
      if (error || !data) {
        console.error(error);
        return json({ ok: false, reason: 'Could not start session' }, 500);
      }
      return json({ ok: true, token: data.id as string });
    }

    if (action === 'beat' || action === 'submit') {
      const token = body.token;
      if (!token || typeof token !== 'string') {
        return json({ ok: false, reason: 'Missing session token' }, 400);
      }
      const next = nums(body);

      const { data: session, error: loadErr } = await sb
        .from('game_sessions')
        .select('*')
        .eq('id', token)
        .maybeSingle();
      if (loadErr || !session) {
        return json({ ok: false, reason: 'Unknown session' }, 400);
      }
      if (session.finalized) {
        return json({ ok: false, reason: 'Session already used' }, 400);
      }

      const err = validateProgress(session, next, { allowEqual: true });
      if (err) return json({ ok: false, reason: err }, 400);

      if (action === 'beat') {
        const { error: upErr } = await sb
          .from('game_sessions')
          .update({
            last_score: next.score,
            last_kills: next.kills,
            last_sector: next.sector,
            last_elapsed: next.elapsed,
            autofire: next.autofire || session.autofire,
            beats: (session.beats || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', token)
          .eq('finalized', false);
        if (upErr) {
          console.error(upErr);
          return json({ ok: false, reason: 'Beat failed' }, 500);
        }
        return json({ ok: true });
      }

      // submit
      const nameCheck = sanitizeName(String(body.name || ''));
      if (!nameCheck.ok) return json(nameCheck, 400);
      if (next.score <= 0) return json({ ok: false, reason: 'Score must be positive.' }, 400);
      if ((session.beats || 0) < MIN_BEATS_FOR_SUBMIT) {
        return json({ ok: false, reason: 'Session too short to submit.' }, 400);
      }

      const stale = Date.now() - new Date(session.updated_at).getTime();
      if (stale > BEAT_STALE_MS) {
        return json({ ok: false, reason: 'Session went stale - play a bit longer.' }, 400);
      }

      // Final numbers must match last beat (client should beat once on game over).
      if (
        next.score !== session.last_score ||
        next.kills !== session.last_kills ||
        next.sector !== session.last_sector
      ) {
        // Allow one last progress step if within limits, then accept.
        const stepErr = validateProgress(session, next, { allowEqual: false });
        if (stepErr) return json({ ok: false, reason: stepErr }, 400);
      }

      const { error: scoreErr } = await sb.from('scores').insert({
        name: nameCheck.name,
        score: next.score,
        sector: next.sector,
        kills: next.kills,
        autofire: next.autofire || session.autofire,
      });
      if (scoreErr) {
        console.error(scoreErr);
        return json({ ok: false, reason: 'Could not submit - try again.' }, 500);
      }

      await sb
        .from('game_sessions')
        .update({
          finalized: true,
          last_score: next.score,
          last_kills: next.kills,
          last_sector: next.sector,
          last_elapsed: next.elapsed,
          autofire: next.autofire || session.autofire,
          updated_at: new Date().toISOString(),
        })
        .eq('id', token);

      return json({ ok: true });
    }

    return json({ ok: false, reason: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, reason: 'Server error' }, 500);
  }
});
