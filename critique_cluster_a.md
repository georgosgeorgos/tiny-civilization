# Critique: Cluster A — Environmental Systems (#2, #9)

## A1 — Climate Oscillations

### Feasibility: the spec misunderstands the existing ClimateSystem

The spec claims `ClimateForcing` has fields `temperature, rainfall, windStrength, stormRisk`. The actual type in `climate.ts:3-9` is `{ rainfall, temperature, seaState, drought, floodRisk }` — no `windStrength`, no `stormRisk`. The spec's proposed `ClimateForcing` extension adds `regime`, `regimeYear`, `regimeRemaining`, `oscillatorPhase` but silently drops `seaState`, `drought`, and `floodRisk`. These three existing fields are consumed by the engine; dropping them breaks the simulation. The spec needs to _extend_ the real type, not replace it.

Critically, `ClimateSystem` at line 38 **already has a low-frequency oscillator**: `regime = Math.sin((this.elapsedDays / 148) * Math.PI * 2 + this.regimePhase)`. Period 148 days / 12 days-per-year ≈ 12.3 years. The spec proposes adding a new 18-32 year oscillator without acknowledging the existing one. The implementation must either replace the existing regime oscillator or compose with it — not ignore it.

### Correctness: regime classification has a gap

The spec's regime logic (`precipPhase < -0.3 → dry, > 0.3 → wet, tempPhase < -0.35 → cooling, else → normal`) means the regime is `"normal"` for roughly 40% of the cycle — specifically when precipPhase is in [-0.3, 0.3] AND tempPhase ≥ -0.35. That's fine, but it means the system never produces simultaneous dry+cooling conditions (cold drought), which is historically one of the most dangerous combinations. The classification should allow compound regimes or at least prioritize precipitation over temperature.

### Determinism: sound

The oscillators use seed-derived periods and phases. `hash2()` for weather rolls is already deterministic. No issues here.

### Integration gap: weather and simulation run on different clocks

The spec notes the regime should affect weather cutoffs at `game.ts:~2434`, but misses a timing subtlety. Weather rolls use `this.weatherDays` (observer-paced), while the climate regime advances with `this.simDays` (simulation-paced, affected by speed multiplier). At 96× speed, the simulation races years ahead while the observer sees a few visual days of weather. The regime must be read from the snapshot (which advances with simDays), but the weather generation loop fires on weatherDays. This works — the spec just doesn't call it out, and an implementer might accidentally couple the oscillator to the wrong clock.

---

## A2 — Catastrophic Events

### Feasibility: the `Game` class has no `SeededRandom`

The spec says catastrophes use `SeededRandom`, but `Game` has no `this.random` — a grep for `SeededRandom` in `game.ts` returns nothing. The engine has one, but catastrophes involve tile-level destruction that happens in `game.ts`, not the worker. The implementation must either (a) add a `SeededRandom` to `Game`, seeded from the config, or (b) move catastrophe decisions into the engine and send destruction commands back via the client. Option (a) is simpler but means two independent random streams that must both be tracked for replay.

### Correctness: epicenter selection for earthquakes is underspecified

"Random buildable tile near volcanic biome or random" — but tiles are loaded dynamically. If the observer has never scrolled near a volcano, no volcanic tiles exist in `this.tiles`. The spec should either (a) use world-state coordinates derived from the seed (the `WorldState.sample()` can check biome without loading a tile) or (b) restrict earthquakes to loaded tiles and accept that unobserved regions don't have earthquakes. Option (a) is more realistic; option (b) is simpler and matches the existing society-founding pattern.

### Missing: eruption/ash event conflict

The existing `"ash"` event (line 2455) fires when `roll > 0.84 && roll < 0.9 && this.discovered.has("volcano")`. The new `"eruption"` event occupies the same conceptual space. The spec doesn't clarify whether eruptions replace the mild ash event or coexist with it. Recommendation: keep `"ash"` as minor volcanic activity; `"eruption"` is a catastrophic escalation that suppresses further ash events for its duration and the following 20 years.

### Missing: people on destroyed tiles

When a building is destroyed, the spec says "set `tile.building = null`, remove mesh." But people have `homeQ/homeR` and `workQ/workR` pointing at that tile. `assignHomes()` and `assignJobs()` must be called after destruction — the spec mentions this for hut destruction (exile residents) but not for workplaces. A destroyed farm leaves its farmer homeless-for-work. The spec should explicitly call `assignHomes(); assignJobs()` after the destruction loop completes.

### Missing: spacecraft scenario

The spec never mentions how catastrophes interact with `spacecraftMode`. Earthquakes and volcanoes are nonsensical on a sealed orbital deck. Meteorites could hit the hull. Locusts are impossible. The spec should either (a) disable all catastrophes in spacecraft mode, or (b) define spacecraft-specific variants (hull breach, system failure, radiation event). Given scope, (a) is correct for now.

### Scope: crater landmark adds mesh work

Adding `"crater"` to `Landmark` requires: updating the union in `world.ts:40`, adding a case to `makeLandmark()` in `models.ts:1321-1331`, and building a new `makeCrater()` mesh function. This is non-trivial procedural geometry. The mesh can be simple (inverted cone + ring of scorched material), but the spec should acknowledge this is 30-50 lines of new Three.js code and suggest deferring the visual polish.

### Scope: biome mutation is not supported by WorldState

The spec proposes that eruptions permanently change tile biomes to `"volcanic"` in `world-state.ts`. But `WorldState` only stores `StoredTile` (building, owner, territory, history) — **biome is not stored**. Biome comes from `sampleWorld()`, which is a pure function of coordinates and seed. To mutate biome, either (a) add a `biome` override field to `StoredTile`, or (b) add a separate `biomeOverrides: Map<string, Biome>` to `WorldState`. Option (b) is cleaner. This is a structural change the spec glosses over as a one-liner.

### Performance: negligible

One per-year probability check with 5 comparisons is ~0. Tile iteration for destruction is O(tiles) but only fires on catastrophe years. No concern.

---

## Summary

The climate oscillation design is sound in concept but built on a misread of the existing `ClimateForcing` type and ignores the existing regime oscillator. Fix the type, compose with or replace the existing oscillator, and document the weatherDays/simDays clock split.

The catastrophe design has three structural gaps: no `SeededRandom` in `Game`, no biome storage in `WorldState`, and no spacecraft-mode exclusion. The epicenter selection needs a deterministic fallback for unloaded tiles. The ash/eruption overlap and people-on-destroyed-tiles cases need explicit handling. The crater mesh should be flagged as a separate visual task.
