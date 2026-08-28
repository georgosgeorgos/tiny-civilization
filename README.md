# Tiny Civilization

A small 3D hex-map civilization builder. Establish a village, balance food and
housing, then watch neighbouring societies grow across a procedural archipelago.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

## Controls

- The council builds, expands, trades, and responds to shortages autonomously; there is no manual building or keyboard play.
- Choose a Frontier camp, Farmers’ village, Established city, or Deep-space spacecraft as the origin; each begins with distinct assets and pressures. New worlds default to a broad, procedural continental landmass; archipelago and shattered geographies are optional world forms.
- Propose possible changes in plain language, for example: “secure food, then develop coastal trade.”
- Use the Timeline selector for 1×–8×, pause, or years pace (96×). The same pace changes also work in writing: “speed 2×”, “years pace”, or “pause time”.
- For a systems-level future projection, write “show 1 million years” (or another positive number of years). This converges recurring systems rather than replaying every day.
- Instructions can contain ordered priorities; the council moves on when the current one is secure.
- Use **Export chronicle** to download the reproducible world manifest, active directives, inputs, and current worker checkpoint as JSON. Run `npm run research` for a deterministic render-free experiment example.
- Click anywhere in the scene to smoothly travel the observer there, or hold the arrow keys to pan in the camera's facing direction. Drag to orbit and scroll to zoom. These only change the observer's view—the council remains autonomous. The World view and observer log make changes easier to follow.
- Use the Lens selector to frame the settlement, its working lands, an individual citizen, a neighboring society, or the regional network.
- Each society has a heritable cultural lineage. Cooperation, curiosity, mobility, stewardship, and resilience adapt over generations; practices can emerge locally and pass along signal corridors, but survive only if their new environment supports them.

## Architecture

- `src/game.ts` owns the simulation, input, and Three.js scene lifecycle.
- `src/world.ts` and `src/hex.ts` generate and address the procedural world.
- `src/buildings.ts`, `src/ai.ts`, and `src/time.ts` contain game rules.
- `src/models.ts`, `src/look.ts`, and `src/life.ts` produce the visual world.
- `src/ui.ts` presents simulation state in the HUD, keeping DOM work out of the
  game loop.
- `src/world-state.ts` holds persistent chunk state independently of rendered meshes;
  `src/terrain-chunks.ts` renders the distant horizon with GPU instancing and LOD.
- `src/simulation/worker.ts` advances the focused settlement at sub-day fidelity and
  remote societies with a cheaper fast-forward model.
- `src/simulation/cellular.ts`, `src/simulation/evolution.ts`, and
  `src/simulation/network.ts` model local ecological feedback, emergent eras, and
  exchange between autonomous regions. `src/simulation/culture.ts` adds inherited
  cultural tendencies, adaptive practices, and cultural transmission.
- `src/spacecraft.ts` provides the sealed orbital-habitat observer scenario.

## Next steps to grow

- A settlement ledger: compact production/consumption trend lines so observers
  can predict shortages instead of discovering them only when stock hits zero.
- Research-era civic projects that alter building silhouettes and introduce new
  institutions, rather than simply raising output.
- Richer diplomacy between societies: gifts, disputes, festivals, and treaties
  that evolve independently of a single trade route.
