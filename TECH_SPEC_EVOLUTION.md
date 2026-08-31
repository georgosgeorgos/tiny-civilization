# Technical Specification: Evolutionary Realism (v2)

## Motivation

Three weaknesses identified from Terralingua's biocultural diversity
framework, Boyd & Richerson's dual inheritance theory, Park et al.'s
Simulacra cognitive architecture, and Buehler's SwarmWorld:

1. **Eras are a linear checklist**, not emergent capability paths
2. **Cultural traits are society-level averages** with no within-group
   variation or transmission biases
3. **Knowledge dies with its society** instead of persisting as durable
   infrastructure

All logic is deterministic via `SeededRandom`. No LLM dependencies.

---

## Part 1: Biocultural Coupling (from Terralingua)

### 1a. Practices modify ecological dynamics

Add `practices: string[]` as a 7th parameter to
`CellularEcology.advance()`. Call site: `engine.ts:192` — pass
`this.state.culture.practices`. Also wire through `advanceYears()`.

Practice effects as additive pressure terms per step (scaled by `dt`):

```typescript
const practiceEffects: Record<string, Partial<Record<string, number>>> = {
  "soil-rest covenant":    { soil: +0.032 },
  "common granary":        { disease: -0.015 },
  "wayfinding compact":    { fish: +0.012 },   // reduced from 0.022
  "living commons":        { soil: +0.018, forest: +0.014 },
  "storm ledger":          { water: +0.012 },
  "open archive":          { disease: -0.008 },
  "plague-memory":         { disease: -0.025 },
  "forestry-management":   { forest: +0.028 },
  "soil-restoration":      { soil: +0.022 },
};
```

**Fix from critique:** Fish practice "wayfinding compact" reduced from
+0.022 to +0.012. Even at 0.012, it's 24-80% of natural fish recovery
on non-coastal cells. Apply an additional ×0.5 scaling for cells where
`coast` is false in the cellular grid (coastal cells already have higher
natural fish recovery).

### 1b. Biocultural diversity index

Add `bioculturalDiversity: number` to `SimulationSnapshot`. Computed
once per year.

**Fix from critique:** `linguisticDiv` and `practiceDiv` converge to
~1.0 for any established society. Replace with discrimination-capable
metrics:

```typescript
// Dialect divergence: how far the current dialect has drifted from
// the root language family. Measures cultural distinctiveness.
const linguisticDiv = clamp01(
  0.3 + culture.language.boundary * 0.4
  + (culture.language.dialect !== culture.language.family ? 0.2 : 0)
  + culture.language.lexicon.filter(w => w.includes("memory")).length * 0.05
);

// Practice diversity: weighted by inverse frequency across known regions.
// For a single-region view, just use count / max with a harder cap.
const practiceDiv = clamp01(culture.practices.length / 8);

const ecologicalDiv = (ecology.soil + ecology.forest + ecology.fish
  + ecology.water) / 4;
const bcd = Math.cbrt(linguisticDiv * practiceDiv * ecologicalDiv);
```

BCD resilience multiplier: `1 + (bcd - 0.5) * 0.4` (range 0.8–1.2×).
Effective range for most societies ~1.08–1.16× — acceptable for v1.
Surface BCD in the HUD next to the culture readout.

Low BCD (< 0.3) increases collapse vulnerability: added as a term in
`shouldSocietyCollapse()`.

### 1c. Practice loss from ecological collapse

**Fix from critique:** Need explicit timer state. Add to
`SimulationSnapshot`:

```typescript
practiceVulnerability: Record<string, number>;  // practice → years below threshold
```

Initialize as `{}`. Each year, for each practice with an ecological
dependency, if the field < 0.2, increment the counter. If >= 0.2, reset
to 0. When counter >= 5, remove the practice.

Practice loss does NOT immediately free the slot — the removed practice
leaves a "gap" tracked in `practiceVulnerability` for 2 additional years
before the slot is available for new discovery. This prevents immediate
replacement masking the co-extinction feedback.

---

## Part 2: Individual Cultural Transmission (from Boyd & Richerson)

### 2a. Per-person cultural weights

**Fix from critique:** Actual `BehavioralStrategy` fields are `mobility`,
`reserve`, `tradeOpenness`. Rename the cultural mobility to
`culturalMobility` to avoid collision:

```typescript
export type BehavioralStrategy = {
  mobility: number;         // existing: migration disposition
  reserve: number;          // existing
  tradeOpenness: number;    // existing
  cooperation: number;      // NEW
  curiosity: number;        // NEW
  culturalMobility: number; // NEW (renamed to avoid collision)
  stewardship: number;      // NEW
  resilience: number;       // NEW
};
```

Initialize from society traits + noise at spawn. The existing
`inheritBehavioralStrategy` pattern (line 62-68) extends naturally:
`clamp(parent.field + (seed - 0.5) * 0.06)` for each cultural trait.

### 2b. Transmission biases

Once per year, after `advanceAges()`:

**Conformist bias:** Drift toward local mean. Each person's contribution
to the mean is weighted by `Math.min(1, (person.age - 16) / 5)` — new
arrivals (young people, migrants) have reduced cultural influence for
their first ~5 adult years. This addresses the critique that a single
migrant shouldn't instantly shift the local culture.

```typescript
const ageWeight = (p: Person) => Math.min(1, Math.max(0, p.age - 16) / 5);
const weightedMean = neighbors.reduce((s, n) =>
  s + n.strategy[trait] * ageWeight(n), 0)
  / Math.max(0.01, neighbors.reduce((s, n) => s + ageWeight(n), 0));
const conformistPull = (weightedMean - person.strategy[trait]) * 0.08;
```

**Prestige bias:** **Fix from critique:** Don't use `person.seed` (fixed
random). Use household hardship as inverse prestige:

```typescript
const prestigious = neighbors.reduce((best, n) => {
  if (n.age < 25) return best;
  const prestige = -this.households.hardshipFor(n.id);  // low hardship = high prestige
  return (best === null || prestige > bestPrestige) ? n : best;
}, null as Person | null);
```

Low hardship means the person's household is thriving — their strategies
are working. This is a genuine success signal that changes over time.

**Guided variation:** Already handled by the household strategy
evolution in `households.ts`. No additional work needed.

### 2c. Society traits as emergent aggregates

**Fix from critique:** Split `evolveCulture()` into two functions to
avoid the aggregate→drift oscillation:

1. `evolvePracticesAndLanguage(traits, context, random, years)` — takes
   trait values as input (from aggregate), discovers practices, evolves
   language. Runs in the engine.

2. Remove the trait target-tracking from `evolveCulture()`. Individual
   transmission (Part 2b) handles trait evolution entirely.

The engine calls `evolvePracticesAndLanguage()` with the aggregate
traits passed via `SimulationInputs`. Practice discovery thresholds
check the aggregate traits — this is correct because practices are
societal, not individual.

### 2d. Inheritance with mutation

In `inheritBehavioralStrategy()`, extend with cultural trait inheritance:

```typescript
for (const trait of ["cooperation", "curiosity", "culturalMobility",
  "stewardship", "resilience"]) {
  child[trait] = clamp(parent[trait] + (seed - 0.5) * 0.06);
}
```

---

## Part 3: Knowledge as Durable Infrastructure (from SwarmWorld)

### 3a. Innovations persist per-region, not per-tile

**Fix from critique:** Innovations are discovered per-society, not
per-building. Storing per-tile creates a "which forge" problem.

Add `regionInnovations: Map<string, string[]>` to `WorldState` (keyed
by `islandId`). When a society discovers a technique, it's recorded on
the region:

```typescript
this.worldState.addRegionInnovation(society.islandId, technique);
```

When a society collapses (`collapseSociety()`), its innovations persist
on the region via `WorldState`. The society snapshot is deleted, but the
region's innovations survive.

### 3b. Successor rediscovery

When `tryFoundSocieties()` founds a new society on a region with
persisted innovations:

```typescript
const ruinInnovations = this.worldState.regionInnovations(islandId);
for (const technique of ruinInnovations) {
  // Instant rediscovery if the matching building exists
  if (matchingBuildingExists(society, technique)) {
    society.innovations.techniques.push(technique);
  }
  // Otherwise: prerequisites are relaxed (one path instead of two)
}
```

### 3c. Hub vulnerability — knowledge carriers

Add `knowledgeCarrier: string[]` to `Person`. When a technique is
discovered, assign it to relevant workers. When a person changes role
via `setRole()`, they KEEP their knowledge — role is occupation, not
competence.

When a carrier dies or emigrates, check remaining carriers. If none
remain, apply a 50% production penalty on that technique's effects for
5 years (a `techniqueDisruption: Record<string, number>` timer on
the snapshot, similar to practice vulnerability).

**Archive institution mitigates:** When `archive` is present, all
techniques are considered carried by 2+ virtual carriers, preventing
single-point-of-failure loss.

**Deep-time projection:** Hub vulnerability is modeled statistically:
`lossRisk = 1 / max(2, carrierCount)` per century per technique.
Sampled via `this.random` in `advanceYears()`.

---

## Part 4: Capability-Based Progression

### 4a. Capability scores

Add to `EvolutionState`:

```typescript
capabilities: {
  agricultural: number;
  maritime: number;
  institutional: number;
  extractive: number;
  ecological: number;
};
```

### 4b. Buildings unlock from capabilities

Replace `eraAllows()` with `capabilityAllows()`. Call sites that need
updating:

1. `game.ts` `canUseBuilding()` → calls `eraAllows()` — replace
2. `game.ts` `trySocietyExpand()` → calls `eraAllows()` — replace
3. `game.ts` `BUILDING_ERA` constant — keep for `architectureFor()`
   visual style selection (it's used for building appearance, not gates)
4. `game.ts` `EVOLUTION_RANK` constant — remove (only used by old era
   gate logic)

Thresholds:

```typescript
orchard:  ["agricultural", 0.3],
fishery:  ["maritime", 0.15],
market:   ["institutional", 0.25],
shrine:   ["institutional", 0.2],
mine:     ["extractive", 0.2],
forge:    ["extractive", 0.4],
```

### 4c. Era label from capabilities

**Fix from critique:** Raise minimum threshold to 0.25 and require a
0.05 gap above the second-highest capability:

```typescript
const sorted = Object.entries(capabilities)
  .sort(([,a], [,b]) => b - a);
const [topCap, topValue] = sorted[0];
const [, secondValue] = sorted[1] ?? ["", 0];
const gap = topValue - secondValue;
era = (topValue < 0.25 || gap < 0.05) ? "Camp"
  : topCap === "agricultural" ? "Agrarian"
  : topCap === "maritime" ? "Maritime"
  : topCap === "institutional" ? "Civic"
  : topCap === "extractive" ? "Industrial"
  : topCap === "ecological" ? "Adaptive"
  : "Camp";
```

**Spacecraft mode:** Add explicit override:
```typescript
if (origin === "spacecraft") era = "Orbital";
```
This preserves the existing behavior at `evolution.ts:66`.

---

## Implementation Order

1. **1a** (practice effects on ecology) — smallest
2. **1b** (BCD index) — small engine addition
3. **4a-c** (capability progression) — era system replacement
4. **2a** (per-person cultural weights) — extends BehavioralStrategy
5. **2b** (transmission biases) — new yearly step
6. **2c-d** (aggregate traits, split evolveCulture, inheritance)
7. **3a-b** (region innovations + rediscovery)
8. **3c** (hub vulnerability)
9. **1c** (practice loss timer)

## Critique Resolution Log

| Finding | Resolution |
|---------|-----------|
| Fish practice too strong on non-coastal | Reduced to 0.012, ×0.5 on non-coastal cells |
| linguisticDiv/practiceDiv converge to 1.0 | Replaced with dialect divergence + harder cap |
| Practice loss timer has no state | Added practiceVulnerability record to snapshot |
| Practice slot freed immediately on loss | 2-year gap before slot reuse |
| BehavioralStrategy field names wrong | Fixed to actual: mobility, reserve, tradeOpenness |
| Cultural mobility name collision | Renamed to culturalMobility |
| Prestige uses fixed seed not success | Use household hardship as inverse prestige |
| Migrants instantly shift culture | Age-weighted contribution to local mean |
| Aggregate→drift oscillation | Split evolveCulture into practices/language vs traits |
| Innovations per-tile is wrong granularity | Changed to per-region (islandId) |
| Role change invalidates carriers | Carriers keep knowledge across role changes |
| Deep-time has no people for hub check | Statistical loss risk per century |
| Era threshold 0.15 too low | Raised to 0.25 with 0.05 gap requirement |
| Spacecraft era override missing | Explicit spacecraft → Orbital override |
| BUILDING_ERA used for architecture style | Kept for visual use, removed from gate logic |
| Call sites for eraAllows not listed | All 4 sites identified and specified |
