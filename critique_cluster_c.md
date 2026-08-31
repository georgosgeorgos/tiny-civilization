# Critique: Cluster C — Social Complexity (#5, #6, #7, #8)

## 1. Feasibility

**Innovation graph (C4):** Expanding from 7 to 18 techniques is manageable in isolation, but the spec underestimates the blast radius. The current `innovationEffects()` returns a flat struct with 6 fields. With 18 techniques each at variable maturity, effects become `sum(effect_i * maturity_i)` — every consumer of `InnovationEffects` must now handle continuous values where it previously got boolean steps. The `eraAllows()` method in `game.ts:1826` checks specific practice names to gate buildings; the spec doesn't explain how maturity interacts with this — does a technique at maturity 0.15 unlock a building? That's a balance landmine.

**The maturity model adds real complexity only if decay is implemented.** Without decay, maturity is just a slow boolean that reaches 1.0 and stays there — pure bookkeeping. But decay requires tracking "are preconditions still met?" every tick for every technique in every region, which is O(techniques × regions × tick) work. The spec should specify whether this runs in the worker or render thread, and at what cadence.

**Recommendation:** Ship the expanded graph with boolean has/doesn't-have first, add maturity as a follow-up.

## 2. Correctness

**Age advancement (C2):** The proposed once-per-year age increment works with the 12-days/year model, but the elder mortality algorithm has a critical flaw. It calls `this.exileHungry(person.tribe, ...)` — this function finds *any* matching person, not the specific elder being iterated. You're iterating `this.people` and mutating it via `splice` inside `exileHungry()`. This will skip people or crash with index corruption. The mortality check needs to collect condemned persons first, then remove them in a separate pass.

**Population crash risk:** With initial ages of `16 + random * 40` (range 16–56), nobody starts as an elder. But after ~22 years of simulation, the oldest cohort hits 78 and the mortality curve kicks in. If the initial population is small (camp origin: ~4 people), losing even one elder to age-mortality while simultaneously losing another to hunger creates a death spiral. The spec needs a minimum-population floor or a graduated mortality curve that's gentler for settlements under ~8 people.

**Dependency ratio double-counting:** The spec applies `laborEfficiency` to `annualProduction` before sending to the engine, but the engine already discounts production based on `health` and `stability`. Both are partially derived from food-per-capita, which is itself affected by population size. The dependency ratio effectively taxes food production twice — once through reduced output and once through increased per-capita need (elders still consume food). The spec should clarify whether `laborEfficiency` replaces or supplements the engine's existing `health`-based production scaling.

## 3. Balance

**Marriage alliance is free population.** Zero gold cost, and you receive a person (with housing capacity, labor, and strategy). Compare: a `hut` costs 8 gold + 4 wood and only provides housing *capacity* — you still need births to fill it. A marriage alliance every ~5 years would outpace natural growth entirely. It needs either a gold cost (10+), a cooldown, or a reciprocal transfer (you also lose a person).

**Gift at 5 gold:** Gold production rates are ~0.7 base + market income. Early-game, 5 gold is 3-4 years of passive income. Late-game with markets and trade routes, it's trivial. The cost should scale or be percentage-based.

## 4. Missing Details

**Children are hand-waved.** The spec says children are "counted but not spawned" via a "childrenCount tracker per region" but never defines the data structure, where it's stored, how it persists across checkpoints, or how it interacts with `tryBirths()`. Currently `tryBirths()` is gated by `birthReadiness` from the engine — does the child tracker replace that signal or supplement it? If children take 16 years to mature, and the simulation year is 12 days, that's 192 simulation-days — about 16 real-time minutes at 1×. This needs explicit timing.

**Innovation maturity vs. era system:** `BUILDING_ERA` maps each building to an evolution era, and `eraAllows()` checks `EVOLUTION_RANK[era] >= EVOLUTION_RANK[BUILDING_ERA[id]]`. The spec adds 11 new techniques but doesn't specify which ones unlock buildings or bypass era gates. Currently practices like "soil-rest covenant" bypass era requirements for specific buildings. The new techniques need equivalent wiring or the era system and innovation system will be parallel, disconnected progression tracks.

**`splitContestedTerritory()` is undefined.** The spec references it in C3 but only says it "divides contested tiles evenly, converting them from contested to economic with alternating claimants." What determines which society gets which tile? Geographic proximity? Resource value? Random? The answer changes whether the mechanic is exploitable.

## 5. Scope

**Cluster C is too large.** C4 (innovation graph) alone touches `innovation.ts`, `engine.ts`, `network.ts`, and every call site of `innovationEffects()`. Combined with C1 (diplomacy: new message types, autonomous behavior, kinship mechanic), C2 (age: lifecycle, demographics, children tracker), and C3 (territory: pressure counting, negotiation, splitting) — this is 4 PRs worth of work jammed into one cluster. C4 should be its own cluster, and C2's child-tracking system should be a separate issue from age advancement.

## 6. Determinism

**C3's negotiation uses `random.next()`** — but `Game` doesn't have a `SeededRandom` instance. It uses `hash2()` for procedural generation and `Math.random()` for person movement. The spec needs to specify which random source the 60% negotiation check uses. If it's `Math.random()`, deterministic replay breaks.

**C1's autonomous diplomatic choices** ("high cooperation → gifts") are deterministic based on trait thresholds, which is fine. But the *timing* of when autonomous societies send messages isn't specified — is it once per diplomacy tick (every 3 sim-days), once per year, or probabilistic?

## 7. Integration

**Overlap between C1 + C3 + D2 (war):** The spec creates three separate paths to conflict: (a) low relation triggers `resolveConflict()` (existing), (b) contested territory pressure feeds into grievance (C3), (c) the war state machine has its own grievance accumulation phase (D2). These will fire independently and stack. A society could simultaneously be in a negotiated territory split (C3), receiving a hostile rival-claim message (C1), and entering the war ultimatum phase (D2). The spec needs a conflict arbitration layer — or at minimum, mutual exclusion: if a war is active between two societies, skip the C3 negotiation and existing `resolveConflict()` for that pair.
