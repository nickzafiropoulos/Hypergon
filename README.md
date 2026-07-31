# HYPERGON

Twin-stick vector arena — a Geometry Wars–style canvas shooter.

## Play

```bash
npm install
npm run dev
```

**Desktop:** Arrow keys (or WASD) to move · mouse to aim · hold click to fire · Space / right-click for shockwave · Q/E weapons · F auto-fire · P pause · M mute

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

### 3. Give the game your Supabase keys (the `.env` file)

**What is `.env`?**  
A plain text file sitting in your Hypergon project folder (same place as `package.json`). The game reads your Supabase URL and key from it when you run locally. It is **not** uploaded to GitHub (it’s in `.gitignore`), so your keys stay on your machine.

There is already a file called **`.env`** in this project. Open it in Cursor (it may be hidden in the file tree — use **File → Open** or the search bar and type `.env`).

It currently looks like this:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

**Fill it in:**

1. In Supabase: left sidebar → **Project Settings** (gear icon) → **API**.
2. Under **Project URL**, copy the URL (looks like `https://xxxxx.supabase.co`).
3. Paste it over `https://YOUR_PROJECT.supabase.co` in `.env`.
4. Under **Project API keys**, copy the **`anon` `public`** key (long string starting with `eyJ...`).  
   Do **not** copy `service_role`.
5. Paste that over `your_anon_key` in `.env`.
6. Save the file.
7. Restart the game server: stop it with Ctrl+C in the terminal, then run `npm run dev` again.

Example of a filled-in `.env` (fake values):

```
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example
```

Without those real values, the game still runs — only the shared online leaderboard stays offline (your personal best still saves in the browser).

Callsigns are filtered in the game (length, characters, simple swear filter).

### Adding autofire to an existing table

If you already ran `schema.sql` before autofire existed:

1. Supabase → **SQL Editor** → **New query**
2. Open [`supabase/migrate-autofire.sql`](supabase/migrate-autofire.sql), copy all of it, paste, **Run**
3. Restart `npm run dev` (the game code already sends/shows the flag)

Runs that used **F auto-fire** show a small **AF** badge on the leaderboard.

### Fix: “Could not submit - try again”

If the board loads empty / submit fails with that message, the table likely has RLS policies but no grants for the public `anon` role. Run [`supabase/migrate-grants.sql`](supabase/migrate-grants.sql) in the SQL Editor (same paste → Run steps).

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
