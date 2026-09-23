# Critique: Parts 1 and 4 of Evolutionary Realism Spec

## Part 1a — Practice effects on ecology

**Magnitude check.** The soil update in cellular.ts line 116 has a natural recovery term of `0.022 * neighbours.forest + 0.012 * suitability + stewardship * 0.012`, totaling roughly 0.03–0.05 per step at typical values. The proposed "soil-rest covenant" adds +0.032 per step. That's 60-100% of the natural recovery rate — it dominates. By contrast, farm depletion pressure is `farmPressure * (0.32 + suitability)` ≈ 0.15–0.45 per step with farms present. So the practice would offset roughly 7-20% of active farming pressure. That's the right ballpark — meaningful but not overpowering.

However, the fish recovery rate is lower: natural is `0.028 * coast + 0.018 * neighbourDiff + stewardship * 0.006` ≈ 0.015–0.05. Adding "wayfinding compact" at +0.022 would be 44-146% of natural recovery — too strong on non-coastal cells. **Fix: scale fish/water practice effects by 0.5 on non-coastal cells** (coastal ecology is already more resilient in the existing model).

**Missing: how to pass practices.** The spec says to add `practices: string[]` as a parameter to `CellularEcology.advance()`, but the call site in engine.ts line 192 is `this.cells.advance(buildings, disruption, stepDays, culture.traits, climate, diseaseImport)`. The `culture.traits` parameter already exists — the spec should pass `this.state.culture.practices` as a 7th parameter or fold it into the existing culture parameter. Either way, the signature change needs to cascade to the `advanceYears()` path too.

## Part 1b — BCD index

**Convergence risk.** `linguisticDiv = lexicon.length / 8` — lexicons grow monotonically (words are added by `evolveCulture()`, never removed except via the `.slice(-8)` cap). After ~6 generations, lexicon.length hits 8 and stays there. So `linguisticDiv ≈ 1.0` for any society older than ~72 simulation-days. It provides no discrimination. **Fix: use dialect divergence from the parent language** or count unique language families across the network, not lexicon length.

`practiceDiv = practices.length / 6` caps at 1.0 when practices hit the 6-practice retention limit. With 9+ practice types now available, most established societies will have 5-6 practices. Again, low discrimination. **Fix: weight practices by rarity** — a practice shared by 1 of 5 societies contributes more than one shared by all 5.

The resilience multiplier `1 + (bcd - 0.5) * 0.4` ranges from 0.8× to 1.2×. Given that BCD will cluster around 0.7–0.9 for most societies, the effective range is 1.08–1.16×. **Noticeable in long runs, negligible in short ones.** This is probably fine for a first pass but should be surfaced in the HUD to confirm it's working.

## Part 1c — Practice loss timer

**No state proposed.** The spec says "if the field stays below 0.2 for 5+ years" but doesn't specify where this timer lives. The engine has no per-practice timer state. Options: (a) add `practiceVulnerability: Partial<Record<string, number>>` to `SimulationSnapshot` tracking elapsed years below threshold, or (b) check the ecology field's value at practice-discovery time and skip the re-add — effectively, practices are re-evaluated each year and only retained if conditions hold. Option (b) is simpler and avoids new state, but the spec's "5-year" delay requires (a). **Decision needed.**

The interaction with the 6-practice retention limit (culture.ts line 82: `.slice(-6)`) is unspecified. If ecological collapse removes a practice, does that free a slot for a new one? If so, the co-extinction feedback loop could be masked by immediate replacement. **Fix: practice loss should not immediately free the slot — add a 2-year "mourning" period where the slot is blocked.**

## Part 4 — Capability-based progression

**Call sites that need updating.** Beyond `eraAllows()`, `BUILDING_ERA` and `EVOLUTION_RANK` appear at:

1. `game.ts:109` — `EVOLUTION_RANK` constant definition
2. `game.ts:110` — `BUILDING_ERA` constant definition
3. `game.ts:1766` — `canUseBuilding()` calls `this.eraAllows()`
4. `game.ts:2534` — `trySocietyExpand()` calls `this.eraAllows(society.era, ...)`
5. `evolution.ts:60-66` — era assignment in `evolveSociety()`

Items 1-4 are in game.ts. Item 5 is the core logic being replaced. The spec's `capabilityAllows()` replaces `eraAllows()` at call sites 3 and 4. But **`BUILDING_ERA` is also used in `architectureFor()`** (game.ts, not shown in my grep but referenced in the building-style logic) — if it's removed, the architecture style selection breaks. Check whether `BUILDING_ERA` is used anywhere for visual purposes vs. gate logic.

**Era label from highest capability.** A society with `maritime: 0.16` and everything else at 0.14 would be labeled "Maritime" — barely above Camp level. The 0.15 minimum threshold in the spec is too low. At 0.15, having a single port (`0.2`) makes you Maritime. **Fix: raise the minimum era threshold to 0.25** and require the top capability to exceed the second by at least 0.05 for a non-Camp label. If capabilities are close, "Camp" is more honest than a hair-splitting label.

**Spacecraft scenario.** The current code has `if (origin === "spacecraft" && era !== "Adaptive") era = "Orbital"` (evolution.ts:66). The capability system doesn't define this override. Spacecraft mode should set a fixed `era = "Orbital"` regardless of capabilities, or map it to the highest non-agricultural capability. The spec is silent on this — **it will break spacecraft mode**.

**Backward compatibility.** Existing saves/manifests store `era: EvolutionEra` in checkpoints. The capability system changes when eras appear but the enum values are the same. Old checkpoints will still load, but their progression will differ on replay. This is acceptable if documented but should be noted.
