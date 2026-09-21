# Tiny Civilization

An observer-driven civilization simulation about three communities sharing a
river basin. Households farm, cut timber, make tools, trade, migrate, and respond
to changes in land and policy. The main interface makes those relationships
visible through a 3D basin, settlement ledgers, a causal chronicle, and
counterfactual comparison.

## Run

Requires Node.js 22.6 or newer and a browser with WebGL 2 support.

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173). The generated
seed is written to the URL, so copying the URL reproduces the same initial basin.

```bash
npm run check    # regression tests, TypeScript checks, and production build
npm run preview  # serve the production build locally
npm run research # headless branch, ensemble, and ablation examples for the legacy model
```

The production build is in `dist/` and can be served by a static web host.

## Observe and experiment

- Drag the basin to orbit, scroll to zoom, and use the map selector to inspect
  landscape, fertility, or forest cover.
- Select Willowbank, Pinewatch, or Stoneford to inspect population, household
  livelihoods, stores, prices, public funds, and trade routes.
- Pause or change the seasonal pace, or advance exactly one or ten years.
- Introduce a two-year drought, change a settlement's sales tax, or commission
  a bridge. **Compare with no changes** reruns the same seed to the same season
  without interventions.
- **Save** downloads the complete basin state as JSON. **Load** validates and
  restores households, cargo, public works, ecology, interventions, and bounded
  history so the run can continue exactly.
- **New basin** creates a fresh seed. A URL with `?seed=42` starts the same basin
  each time.

The earlier world-scale sandbox remains available at `?mode=legacy`. It includes
configurable origins and geographies, written council directives, deep-time
projection, culture and institutions, and the broader Three.js world view.

## Architecture

- `src/main.ts` selects the basin by default and lazy-loads the earlier sandbox.
- `src/basin/world.ts` creates the deterministic terrain, drainage graph, three
  settlements, and least-cost routes.
- `src/basin/engine.ts` owns household production, consumption, local and
  regional markets, cargo, ecology, migration, public works, and save validation.
- `src/basin/view.ts` renders the basin and its map layers with Three.js, while
  `src/basin/app.ts` owns the observer interface and experiment controls.
- `src/legacy.ts` starts the earlier sandbox. Its browser lifecycle remains in
  `src/game.ts`, and its render-free research model lives under `src/simulation/`.
- `src/simulation/worker.ts` advances the focused legacy settlement and remote
  regions outside the render loop.

## Reproducibility and scope

Both engines are deterministic for the same seed and inputs. Basin saves contain
the full authoritative state and restore exactly after JSON serialization. The
basin keeps the latest 160 seasonal observations, 120 causal events, and 80
interventions. Its baseline comparison is a counterfactual from the same seed;
it does not claim to isolate one intervention when several changes were made.

Legacy research checkpoints include random-generator state, cellular ecology,
and fractional time. Model version `research-foundation-2` corrects cultural IDs,
climate time units, and ecological coupling, so its results differ from older
checkpoints. Deep-time requests converge recurring systems instead of replaying
every day, and different step sizes need not produce identical outcomes.

These are exploratory models, not calibrated historical or economic predictions.
The older `src/simulation/balance-test.ts` diagnostic still reports six unmet
survival and disease expectations in centuries-long scenarios. The regression
suite passes, but those balance failures remain model limitations. The research
proposal and technical specifications also describe ambitions beyond the shipped
interfaces.

## Highest-value next steps

- Calibrate the legacy food and disease systems until the long-horizon balance
  diagnostic passes or replace its obsolete plague-memory expectation.
- Add browser-level interaction and accessibility tests for save/load, comparison,
  WebGL fallback, narrow layouts, keyboard use, and reduced-motion behavior.
- Extend basin policy beyond a global drought, one tax, and bridges: upstream
  water use, shared reserves, route disruption, and agreements would make the
  river relationship materially consequential.
- Expand trends and counterfactuals beyond food and population to show prices,
  household wellbeing, migration, land change, and the effect of each intervention.
- Split or defer more Three.js code if initial-load performance becomes a problem;
  the production build currently emits a chunk-size warning for the renderer.
