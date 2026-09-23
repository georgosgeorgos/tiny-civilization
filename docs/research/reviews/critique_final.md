# Final Critique: TECH_SPEC.md v2

## 1. Resolved Findings

- RESOLVED: A1 — spec misread ClimateForcing fields (now extends real type with seaState/drought/floodRisk)
- RESOLVED: A1 — existing regime oscillator ignored (now composes with it via super-regime)
- RESOLVED: A1 — no compound dry+cold regime (added "dry-cold" classification)
- RESOLVED: A1 — weatherDays/simDays clock split undocumented (explicitly documented in v2)
- RESOLVED: A2 — Game has no SeededRandom (gameRandom added in Overview as project-wide prerequisite)
- RESOLVED: A2 — epicenter selection on unloaded tiles (explicitly scoped to loaded tiles only)
- RESOLVED: A2 — ash/eruption overlap (eruption suppresses ash for 20 years)
- RESOLVED: A2 — people on destroyed tiles (deferred removal + assignHomes/assignJobs after loop)
- RESOLVED: A2 — spacecraft mode unaddressed (all except meteorite→hull-breach disabled)
- RESOLVED: A2 — WorldState doesn't store biome (biomeOverrides map added)
- RESOLVED: A2 — crater landmark mesh work acknowledged (scoped at ~20 lines)
- RESOLVED: B1 — healthProtection not on NetworkRegion (field added, computation site specified)
- RESOLVED: B1 — epidemic as mutually exclusive WorldEvent (now parallel state)
- RESOLVED: B1 — society-level epidemic missing (flows through RegionSimulationInput)
- RESOLVED: B2 — depletion curve discontinuity (smooth sqrt, floor raised to 0.18)
- RESOLVED: B2 — death spiral risk (floor raised, AI deprioritizes mines)
- RESOLVED: B3 — engine already has spoilage + storage (tunes existing, no duplication)
- RESOLVED: B3 — commonReserve ordering bug (release before recompute)
- RESOLVED: B3 — society infrastructure hardcoded to 0 (pass actual counts)
- RESOLVED: B3 — double-enforcement of storage cap (single enforcement in engine)
- RESOLVED: C1 — marriage is free population (reciprocal + 12 gold cost)
- RESOLVED: C2 — iterator mutation bug (deferred removal with reverse-order splice)
- RESOLVED: C2 — small-population crash risk (guard on pop > 6)
- RESOLVED: C2 — children model hand-waved (simplified to cohort weight × 0.28)
- RESOLVED: C2 — dependency ratio double-counting (coefficient reduced, orthogonality justified)
- RESOLVED: C3 — negotiation uses unspecified random (uses gameRandom)
- RESOLVED: C3 — splitContestedTerritory undefined (distance-based, equity tiebreak)
- RESOLVED: C4 — too large / maturity adds bookkeeping (separate PR, boolean-only phase 1)
- RESOLVED: C4 — innovation maturity vs era gates (era gate wiring specified for new techniques)
- RESOLVED: C — three overlapping conflict paths (arbitration rules: war suppresses others, negotiation cooldown)
- RESOLVED: D1 — Set<string> won't serialize (string[])
- RESOLVED: D1 — endemic→pandemic feedback loop (×0.5 damping, 40-year cooldown, plague-memory)
- RESOLVED: D1 — recurrence rules missing (recur after cooldown, progressively weaker)
- RESOLVED: D2 — 6 phases over-engineered (collapsed to 3)
- RESOLVED: D2 — strength uses render-layer state (SimulationInputs-only computation)
- RESOLVED: D2 — trade routes during war (treaty→hostile auto-severs)
- RESOLVED: D2 — cooldown data structure missing (Map<string, number> specified)
- RESOLVED: E1 — probability uncapped (knowledge capped at 2.0, total at 8%)
- RESOLVED: E1 — gold from nowhere in material-trade (outcome removed)
- RESOLVED: E1 — collapse during interpretation (→ withdrawal + chronicle)
- RESOLVED: E2 — all findings (deferred entirely to post-v1)

## 2. Unresolved Findings

- **B2 — minerals is a settlement-wide average, not per-tile.** Critique B noted this is acceptable as a first pass but should be acknowledged. The spec silently applies one `ecology.minerals` to all mines uniformly. The limitation is fine but should be stated explicitly — an implementer might try to make it per-tile and waste effort.

- **C1 — gift cost doesn't scale.** Critique C noted 5 gold is 3-4 years of early income but trivial late-game. The spec kept the flat cost. Not blocking, but a balance note for tuning.

- **C2 — `demographics` field not added to SimulationInputs type definition.** The spec says "SimulationInputs gets a new field" but doesn't specify whether this is optional (backward-compat with existing callers, e.g., `advanceRegions()`) or required. Tribe societies would need to compute demographics from their own people arrays too.

## 3. New Issues Introduced by Revisions

- **A1 temperature threshold uses raw value.** The classification `combined < -0.25 && temperature < 0` checks `temperature < 0`, but `ClimateForcing.temperature` is computed as `seasonal * 0.62 + regime * 0.18` (climate.ts:41), which is a centered oscillation ranging roughly -0.8 to +0.8. It IS often negative. This means "dry-cold" will fire whenever the combined signal is low AND it happens to be winter-half of the seasonal cycle. This may over-trigger. Consider using a longer-window temperature average or a threshold like `< -0.2` instead of `< 0`.

- **D2 war uses `gameRandom` for negotiation.** The spec says `trust > 0.3 via gameRandom` in the active→resolution transition. But war state was specifically moved to the simulation layer (strength computed from SimulationInputs). If negotiation rolls use `gameRandom` (render-layer), this reintroduces headless/rendered divergence. Negotiation rolls should use the engine's `this.random` via a passed input field, not `gameRandom`.

- **B3 spoilage bump from 0.018 to 0.028 is a 56% increase.** This affects every existing game, not just new features. Early-game food is tight (camp origin starts with 22 food, ~4 people). A 56% increase in spoilage will make the first few years noticeably harder. This needs playtesting before committing — consider making it 0.022 as a safer first step.

## 4. Overall Assessment

**Ready for implementation with minor fixes.** The spec addressed 40+ critique findings systematically. The three new issues above are all fixable without structural changes: adjust the temperature threshold, route war negotiation through the engine's random, and be conservative with the spoilage bump. The biggest remaining risk is **interaction effects during playtesting** — when climate regimes, resource depletion, food spoilage, epidemics, and age mortality all activate together, compound pressure may make survival too hard. The implementation order correctly front-loads the simpler features (A1, B2, B3), which should give early playtesting signal before the heavier systems (D1, D2) land.
