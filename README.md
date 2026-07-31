# HYPERGON

Twin-stick vector arena — a Geometry Wars–style canvas shooter.

## Play

```bash
npm install
npm run dev
```

**Desktop:** Arrow keys (or WASD) to move · mouse to aim · hold click to fire · Space / right-click for shockwave · Q/E weapons · F auto-fire · P pause · M mute · B bloom

**Touch:** Left stick move · right stick aim & fire · Bomb button · Pause

## Leaderboard (Supabase)

1. Create a free [Supabase](https://supabase.com) project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Copy `.env.example` → `.env` and set:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Without env vars the game still runs; personal best stays in `localStorage` and the board shows “not configured.”

Callsigns are filtered client-side (length, charset, simple profanity / leetspeak).

## Deploy

### GitHub Pages (default)

1. Push this repo to GitHub.
2. **Settings → Pages → Source:** GitHub Actions.
3. Add repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Push to `main` — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys `dist/`.

### Vercel (fallback)

1. Import the repo in Vercel.
2. Framework preset: Vite. Build: `npm run build`. Output: `dist`.
3. Add the same `VITE_*` env vars.
4. Deploy.

## Prototype

The original Claude single-file prototype lives in [`prototype/hypergon_4.html`](prototype/hypergon_4.html).
