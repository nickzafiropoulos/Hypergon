# Cursor updates

- Rebuilt Hypergon as a Vite + TypeScript canvas game with arrow/WASD move, mouse aim/fire, touch sticks, performance caps, distinct cyan multiplier cores, and GitHub Pages deploy wiring.
- Tightened intro screen: controls in a fixed 3×2 grid so Multiplier stays aligned.
- Removed personal-best line from the intro screen footer.
- Removed the B bloom toggle and its UI/docs mentions (glow still auto-applies on desktop).
- Added a subtle animated dotted aim tracer from the ship to the mouse (and along stick aim on touch).
- Removed the twin-stick tagline from the landing screen.
- First multiplier core of a run shows a short on-world hint to collect them.
- Advised keeping gameplay on Canvas 2D; Three.js only as an optional decorative underlay (or fake depth in the warp grid) to avoid a full rewrite and perf hit.
- Added Canvas 2D fake depth: bowl-projected warp grid with parallax ghost layer, particle z-scaling, and elliptical ring squash (disabled under reduced motion).
- Made the railgun a thick cyan-white laser (muzzle-anchored beam + full-screen flash) so shots are easy to read.
- Softened the ship warp-grid wake and dimmed hot grid lines so the arena stays readable around the player.
- Game over: renamed retry to “Try again” and added “Quit to start screen”.
- Matched Try again / Quit button widths; floating +score pops show for 1s on each enemy kill.
- Hit-chain scales floating scores up to 4× (resets after 2s idle); max size uses gradient + vibrate.
- Swapped UI emdashes for hyphens, and bumped landing panel body type one step.
- Expanded procedural SFX: distinct cues per weapon and key events (hits, shield, mult-up, sector, combo max, etc.).
- Death-clear no longer awards score/kills/gems for enemies wiped when the player is hit.
