# Cursor updates

- Rebuilt Hypergon as a Vite + TypeScript canvas game with arrow/WASD move, mouse aim/fire, touch sticks, performance caps, distinct cyan multiplier cores, and Supabase leaderboard + GitHub Pages deploy wiring.
- Added plain-language Supabase setup steps to the README (SQL Editor → paste schema → Run → copy API keys into `.env`).
- Clarified what the local `.env` file is and created one from `.env.example` for the user to fill in.
- Confirmed `.env` must keep that exact filename (not `xxx.env`); restarted the Vite dev server after keys were filled in.
- Tightened intro screen: controls in a fixed 3×2 grid so Multiplier stays aligned; sector leaders panel bordered/separated with centered empty state.
- Removed personal-best line from the intro screen footer.
