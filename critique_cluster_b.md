# Critique: Cluster B — Ecological-Economic Feedback

## B1 — Epidemic spread (#1)

**The spec's `healthProtection` is not available where it's needed.** The spec says to use `healthProtection` from `institutionEffects()` and `innovationEffects()` inside `exchangeRegions()` in `network.ts`. But `NetworkRegion` has no `healthProtection` field, and the function receives only the region struct — it has no access to the engine's snapshot or institution state. You'd need to either add `healthProtection: number` to `NetworkRegion` (computed in `game.ts` before the call at line ~2834) or compute it inside `exchangeRegions()` from existing region fields. The spec glosses over this plumbing.

**The `diseaseOutbreak` flag is a crude bridge.** The spec puts a boolean on the snapshot and has `game.ts` create a `WorldEvent` from it. But `WorldEvent` is currently mutually exclusive (one event at a time, line 296: `private event: WorldEvent = "none"`). An epidemic during a drought would mask the drought event. Either make events stackable or give epidemics their own parallel state.

**Missing: society-level epidemic.** The spec only describes `diseaseOutbreak` on the player's snapshot. Tribe societies run through `advanceRegions()` with their own engines. Disease import would need to flow into each society's regional simulation input and produce per-society outbreak flags, otherwise epidemics only ever hit the player.

## B2 — Resource exhaustion (#3)

**The depletion factor curve has a discontinuity.** At `mineralStock = 0.5` the factor jumps from `0.4 + 0.5 * 1.2 = 1.0` to `1.0` — fine. But at `mineralStock = 0.2` the lower branch gives `0.2 * 2 = 0.4` while the upper gives `0.4 + 0.2 * 1.2 = 0.64`. That's a 37% cliff at the 0.2 boundary. Use a single smooth curve (e.g. `Math.sqrt(mineralStock)` clamped at 0.08) to avoid artificial breakpoints that create sudden behavioral jumps.

**`ecology.minerals` is a settlement-wide average, not per-tile.** The spec reads `this.simulation.snapshot.ecology.minerals` and applies it uniformly to every mine tile (line ~2520). But a settlement might have mines on volcanic terrain AND on plain hills. The cellular grid's aggregate mineral value would mask per-deposit variation. This is acceptable as a first pass, but the spec should acknowledge the limitation — a single mine on rich ore mixed with three on depleted ore will all produce at the average rate.

**Death spiral risk is real.** When minerals decline, gold income drops, which means fewer forges and markets can be built, which means less gold to pivot to trade. The spec mentions the AI deprioritizing mines, but the AI needs gold to build *anything*. Add a floor: even an exhausted mine should produce ~15-20% of base yield (scavenging/recycling), not 8%. The 0.08 minimum in the spec is too punishing.

**Mineral regeneration at 0.0001/year is invisible.** At that rate, going from 0.1 to 0.7 takes 6,000 years. In deep-time projection this is fine, but in normal play (years 1-500) it's functionally zero. That's probably intended, but state it explicitly.

## B3 — Food spoilage and granary capacity (#4)

**The engine already has spoilage and storage capacity.** This is the spec's biggest miss. Look at `engine.ts` line 144: `const spoilage = this.state.stores.food * 0.018 * yearPart * (1 - infrastructure * 0.48) * (1 - institutionRules.spoilageProtection)`. And line 302-309: `storageCapacity()` returns per-resource caps that `step()` enforces via `Math.min(storage.food, ...)` at line 161. The spec proposes a 4%/year spoilage rate and building-based storage caps as if these don't exist. The actual base rate is 1.8%/year (not 4%), and the actual caps already scale with buildings, population, and infrastructure.

**The proposed game.ts storage cap would double-enforce limits.** The engine already clamps food to `storageCapacity()` output (line 161). Adding a *second* cap in `game.ts` creates a race condition: `game.ts` caps food, then `setStores()` pushes it into the engine, which caps again with potentially different limits. Decide on one enforcement point.

**The `commonReserve` buffer logic is sound but ignores the reserve's source.** The spec's famine buffer (`release = min(commonReserve, deficit)`) works, but `commonReserve` is computed in `evolveInstitutions()` line 50-51 as a fraction of *surplus* food. During a famine, surplus is zero, so the reserve target drops to zero, and the exponential convergence *drains* the reserve even without a release event. The buffer and the reserve-target update need to be ordered: release first, then recompute target. Otherwise the reserve self-depletes before it can save anyone.

**Society food spoilage is unaddressed.** The spec's storage-cap code references `playerTiles`. Tribe societies' food is capped by the engine's `storageCapacity()` for remote regions (via `advanceRegions()`), but the inputs passed at game.ts line ~2656 set `infrastructure: { roads: 0, ports: 0, tradeRoutes: 0 }` for all tribe societies — so their storage is always minimal. This is either a bug or an intentional handicap, but the spec should say which.

## Cross-cutting concerns

**Triple-stacking during drought:** A dry climate regime (Cluster A) would trigger drought events more often, which simultaneously: (1) depletes soil → reduces food production, (2) increases spoilage via reduced `infrastructure * 0.48` effect (no, that's unchanged — actually spoilage is constant), (3) increases disease via `diseaseNext` calculation at cellular.ts line 124-127 (only indirectly, through water stress). The actual stacking is drought + mine depletion happening concurrently. This is less severe than feared — drought hits food, depletion hits gold, and disease is mainly driven by settlement density not drought. The interaction is tolerable.

**Determinism:** B2 and B3 use no randomness — they read snapshot fields and apply deterministic math. B1's epidemic threshold is deterministic too (it's a comparison, not a roll). All three are safe for replay. However, if B1 triggers a `WorldEvent`, the event system in `game.ts` uses `hash2()` for weather rolls, which is deterministic per day — so overlapping an epidemic event with existing weather logic needs care to not consume random values out of sequence.

## Recommended changes

1. Delete the B3 spoilage/storage proposal and instead **tune the existing** `engine.ts` spoilage rate (0.018) and `storageCapacity()` values. Add the `commonReserve` release buffer.
2. Fix the `commonReserve` ordering: release before recalculating the reserve target in `evolveInstitutions()`.
3. Smooth the B2 depletion curve and raise the floor to 0.15-0.20.
4. Add `healthProtection: number` to `NetworkRegion` and `diseaseImport: number` to `NetworkEffect`.
5. Make epidemic state parallel to `WorldEvent`, not a member of the union.
