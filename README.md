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

- Click a hex to place the selected building
- Click a hex to place the selected building
- 1–9 select buildings; hover a tile to see whether the choice is valid
- Drag to orbit, scroll to zoom, and use WASD or arrow keys to travel
- Space/P pauses; +/- changes simulation speed; G toggles automatic building

## Architecture

- `src/game.ts` owns the simulation, input, and Three.js scene lifecycle.
- `src/world.ts` and `src/hex.ts` generate and address the procedural world.
- `src/buildings.ts`, `src/ai.ts`, and `src/time.ts` contain game rules.
- `src/models.ts`, `src/look.ts`, and `src/life.ts` produce the visual world.
- `src/ui.ts` presents simulation state in the HUD, keeping DOM work out of the
  game loop.

## Next steps to grow

- Roads and ports that connect settlements, create trade routes, and visibly
  animate goods between islands.
- A settlement ledger: compact production/consumption trend lines so players can
  predict shortages instead of discovering them only when stock hits zero.
- Research-era unlocks that alter building silhouettes and introduce choices,
  rather than simply raising output.
- Diplomacy with the existing societies: trade agreements, gifts, and shared
  festivals that affect mood and income.
