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

- The council builds, expands, trades, and responds to shortages autonomously.
- Steer it in plain language, for example: “secure food, then develop coastal trade.”
- Instructions can contain ordered priorities; the council moves on when the current one is secure.
- Drag to orbit, scroll to zoom, and use WASD or arrow keys to survey the world.
- Space/P pauses; +/- changes simulation speed. The World view and observer log make changes easier to follow.

## Architecture

- `src/game.ts` owns the simulation, input, and Three.js scene lifecycle.
- `src/world.ts` and `src/hex.ts` generate and address the procedural world.
- `src/buildings.ts`, `src/ai.ts`, and `src/time.ts` contain game rules.
- `src/models.ts`, `src/look.ts`, and `src/life.ts` produce the visual world.
- `src/ui.ts` presents simulation state in the HUD, keeping DOM work out of the
  game loop.

## Next steps to grow

- A settlement ledger: compact production/consumption trend lines so observers
  can predict shortages instead of discovering them only when stock hits zero.
- Research-era civic projects that alter building silhouettes and introduce new
  institutions, rather than simply raising output.
- Richer diplomacy between societies: gifts, disputes, festivals, and treaties
  that evolve independently of a single trade route.
