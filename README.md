# HYPERGON

Twin-stick vector arena — a Geometry Wars–style canvas shooter.

## Play

```bash
npm install
npm run dev
```

**Desktop:** Arrow keys (or WASD) to move · mouse to aim · hold click to fire · Space / right-click for shockwave · Q/E weapons · F auto-fire · P pause · M mute · B bloom

**Touch:** Left stick move · right stick aim & fire · Bomb button · Pause

## Leaderboard (Supabase) — simple setup

You do **not** create the table by hand in the UI. You paste one SQL file and Supabase builds the table + security rules for you.

### 1. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Pick an org, name it (e.g. `hypergon`), set a database password, choose a region → **Create**.
4. Wait until the project is ready (green / healthy).

### 2. Create the `scores` table (run the schema)

1. In the left sidebar open **SQL Editor**.
2. Click **New query**.
3. Open this file in the repo: [`supabase/schema.sql`](supabase/schema.sql).
4. Select all of that file, copy it, paste into the SQL Editor.
5. Click **Run** (bottom right / or Cmd+Enter).
6. You should see success. That script:
   - creates a table called **`scores`**
   - adds an index for sorting by score
   - turns on Row Level Security
   - allows the public to **read** and **insert** scores (not edit/delete)

Optional check: left sidebar → **Table Editor** → you should see **`scores`**.

### 3. Copy your API keys into the game

1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy **Project URL**.
3. Copy the **anon** / **public** key (not the `service_role` key — keep that secret).
4. In this project folder, copy the example env file:

```bash
cp .env.example .env
```

5. Edit `.env` so it looks like:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```

6. Restart the dev server (`Ctrl+C`, then `npm run dev`).

Without `.env`, the game still works — only the shared leaderboard stays offline (local best score still saves in the browser).

Callsigns are filtered in the game (length, characters, simple swear filter).

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
