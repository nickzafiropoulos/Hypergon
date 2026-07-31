# Cursor updates

- Rebuilt Hypergon as a Vite + TypeScript canvas game with arrow/WASD move, mouse aim/fire, touch sticks, performance caps, distinct cyan multiplier cores, and Supabase leaderboard + GitHub Pages deploy wiring.
- Added plain-language Supabase setup steps to the README (SQL Editor → paste schema → Run → copy API keys into `.env`).
- Clarified what the local `.env` file is and created one from `.env.example` for the user to fill in.
- Confirmed `.env` must keep that exact filename (not `xxx.env`); restarted the Vite dev server after keys were filled in.
- Tightened intro screen: controls in a fixed 3×2 grid so Multiplier stays aligned; sector leaders panel bordered/separated with centered empty state.
- Removed personal-best line from the intro screen footer.
- Removed the B bloom toggle and its UI/docs mentions (glow still auto-applies on desktop).
- Track autofire on the leaderboard (AF badge); added migrate-autofire.sql for existing Supabase tables.
- Added a subtle animated dotted aim tracer from the ship to the mouse (and along stick aim on touch).
- Removed the twin-stick tagline from the landing screen.
- First multiplier core of a run shows a short on-world hint to collect them.
- Restyled Sector Leaders title to match the logo glyph and refined the leaderboard panel separation.
- Advised keeping gameplay on Canvas 2D; Three.js only as an optional decorative underlay (or fake depth in the warp grid) to avoid a full rewrite and perf hit.
- Added Canvas 2D fake depth: bowl-projected warp grid with parallax ghost layer, particle z-scaling, and elliptical ring squash (disabled under reduced motion).
- Made the railgun a thick cyan-white laser (muzzle-anchored beam + full-screen flash) so shots are easy to read.
- Softened the ship warp-grid wake and dimmed hot grid lines so the arena stays readable around the player.
- Removed dashed empty-state box on Sector Leaders, swapped UI emdashes for hyphens, and bumped landing panel body type one step.
- Matched Sector Leaders panel width to the instructions grid above it.
