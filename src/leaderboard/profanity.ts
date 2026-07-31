/** Simple local profanity filter with leetspeak normalization. */

const BLOCKLIST = [
  'fuck',
  'shit',
  'asshole',
  'bitch',
  'cunt',
  'dick',
  'piss',
  'cock',
  'pussy',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'rape',
  'nazi',
  'hitler',
  'porn',
  'sex',
  'cum',
  'anal',
  'bastard',
  'wanker',
  'twat',
  'bollocks',
  'arsehole',
];

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z]/g, '');
}

export function sanitizeName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) return { ok: false, reason: 'Callsign needs at least 2 characters.' };
  if (trimmed.length > 12) return { ok: false, reason: 'Callsign max 12 characters.' };
  if (!/^[\w .\-]+$/i.test(trimmed)) {
    return { ok: false, reason: 'Letters, numbers, spaces, . and - only.' };
  }
  const norm = normalize(trimmed);
  for (const word of BLOCKLIST) {
    if (norm.includes(word)) return { ok: false, reason: 'Pick another callsign.' };
  }
  return { ok: true, name: trimmed };
}
