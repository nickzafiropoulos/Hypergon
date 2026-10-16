# HYPERGON

Twin-stick vector arena — a Geometry Wars–style canvas shooter.

## Play

```bash
npm install
npm run dev
```

**Desktop:** Arrow keys (or WASD) to move · mouse to aim · hold click to fire · Space / right-click for shockwave · Q/E weapons · F auto-fire · P pause · M mute

**Touch:** Left stick move · right stick aim & fire · Bomb button · Pause

Personal best is saved in the browser.

## Deploy

### GitHub Pages (default)

1. Push this repo to GitHub.
2. **Settings → Pages → Source:** GitHub Actions.
3. Push to `main` — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys `dist/`.

### Vercel (fallback)

1. Import the repo in Vercel.
2. Framework preset: Vite. Build: `npm run build`. Output: `dist`.
3. Deploy.

## Prototype

The original Claude single-file prototype lives in [`prototype/hypergon_4.html`](prototype/hypergon_4.html).
