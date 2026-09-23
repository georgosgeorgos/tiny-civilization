# Critique: TECH_SPEC_EVOLUTION Parts 2 and 3

## Part 2a: Per-person cultural weights

**The spec's `BehavioralStrategy` is wrong.** The actual type in `households.ts:1-4` has three fields: `mobility`, `reserve`, `tradeOpenness` — not `riskTolerance`, `tradeOpenness`, `migrationThreshold` as the spec claims. The existing `mobility` field overlaps with the proposed cultural `mobility` trait — a name collision. Either rename the existing behavioral `mobility` to `migrationDisposition` or namespace the cultural traits (e.g., `culturalMobility`).

**8 fields per person is fine.** Each is a single float. The existing household system already iterates all people, computes per-household means, and does pairwise blending — adding 5 more floats doesn't change the computational profile. The inheritance pattern in `inheritBehavioralStrategy` (line 62-68) — `clamp(parent.field + (noise - 0.5) * 0.14)` — works identically for cultural traits. No new inheritance infrastructure needed; just extend the existing function.

## Part 2b: Prestige bias is broken

**`n.seed > best.seed` is not success — it's a fixed random number set at spawn.** It never changes. A person born with seed 0.95 is permanently "prestigious" regardless of what they accomplish. Prestige should measure something that changes: household wealth (`this.households.hardshipFor(n.id)` is already available — low hardship correlates with success), or role seniority (a smith or merchant vs a villager), or age (elders in traditional societies). The simplest fix: use `household.wealth + household.cohesion * 6` as the prestige score — this is already computed in `households.ts:130` as the exemplar ranking criterion.

**Migrants and conformist pressure.** The spec filters neighbors by `islandId`, so a migrant who just arrived immediately participates in — and is subject to — local conformist pull. This is actually correct for conformist bias (Boyd & Richerson describe it as rapid); the problem is the other direction — a migrant's traits instantly influence the local mean, potentially creating an unrealistically fast cultural shift from a single arrival. Fix: weight each person's contribution to the local mean by `min(1, yearsInRegion / 5)` — but this requires tracking arrival year, which `Person` doesn't have. An acceptable shortcut: weight by `age - 16` (time since adulthood), which is already available.

## Part 2c: Aggregate traits vs engine-computed traits — practice discovery conflict

**This is the spec's most dangerous integration point.** `evolveCulture()` in `culture.ts:50-93` does four things: (1) compute trait targets from ecology, (2) drift traits toward targets, (3) discover practices by checking trait thresholds, (4) evolve language. If we override trait values with the per-person aggregate, steps 1-2 become irrelevant — but step 3 still checks `traits.stewardship > 0.54` etc. **Whose traits?**

The spec says "trait values are seeded from the aggregate each step" — meaning the engine's `culture.traits` gets overwritten with the aggregate before `evolveCulture()` runs. But `evolveCulture` then drifts those traits toward environment-derived targets, which partially undoes the aggregate. On the next step, the aggregate overwrites again. This creates an oscillation: aggregate → engine drift → aggregate → engine drift.

**Fix:** Split `evolveCulture()` into two functions: `evolvePracticesAndLanguage()` (takes traits as input, discovers practices, evolves language) and `evolveTraits()` (the target-tracking). Call only the first from the engine, and let individual transmission handle trait evolution entirely.

## Part 3a: Innovations on tiles — wrong granularity

**Innovations are per-society, not per-building.** When `metallurgy` is discovered, it doesn't belong to one specific forge — it belongs to the society that has forges. The spec maps `forge → metallurgy`, but if a society has 3 forges, which one gets the innovation? All three? Then `innovations: string[]` on StoredTile is redundant storage. One forge? Then destroying a different forge has no effect, which is arbitrary.

**Better approach:** Store innovations per-region (island), not per-tile. Add `innovations: string[]` to `WorldState` keyed by `islandId`, not by hex coordinate. When a society collapses, its innovations persist on the region. When a successor founds there, they check the region's innovations, not individual tiles. This matches the actual discovery granularity and avoids the "which forge" problem.

## Part 3c: Knowledge carriers — deep-time and role-change gaps

**Role changes invalidate carriers.** `setRole()` in game.ts changes a person's role (farmer → merchant) when jobs are reassigned. The spec assigns knowledge based on role (`roleForTechnique(technique)`), but doesn't update carriers when roles change. A farmer who learned `seed-selection` then gets reassigned to merchant — do they keep the knowledge? They should, but the spec implies role-based assignment, not role-based retention.

**Deep-time projection has no people.** `advanceYears()` operates on `SimulationSnapshot`, which has no individual Person entities. Hub vulnerability can't be evaluated because there are no carriers to check. The spec doesn't address this. For deep-time: either skip hub vulnerability entirely (acceptable — it's a short-term pressure, and deep-time converges away from individual events), or model it statistically as `techniqueRisk = 1 / numberOfCarriers` and sample loss events per technique per century.
