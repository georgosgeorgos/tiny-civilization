# Technical Specification: Simulation Realism Improvements (v2)

## Overview

This spec covers 13 issues across 5 clusters. The simulation runs
deterministically in a Web Worker (`SimulationEngine`) with a render-side game
loop (`Game`) that owns Three.js visuals, tile state, and people. Changes must
preserve this split: simulation logic in `src/simulation/`, visual and
tile-level logic in `src/game.ts` and related render modules.

All randomness uses `SeededRandom` — no `Math.random()` in simulation paths.
All new state must serialize into `WorldManifest` checkpoints. `Set<string>` is
never used in serializable state — use `string[]` instead.

**Key architectural constraint:** `Game` has no `SeededRandom`. A new
`this.gameRandom = new SeededRandom(config.seed ^ 0x47414d45)` must be added
to the `Game` constructor for any render-layer random decisions (catastrophe
epicenters, negotiation rolls, etc.). This is tracked alongside the engine's
random for deterministic replay.

---

## Cluster A: Environmental Systems (#2, #9)

### A1 — Multi-year climate oscillations (#2)

**Current state:** `ClimateSystem` in `climate.ts` already has a regime
oscillator at line 38: `regime = Math.sin((this.elapsedDays / 148) * ...)`
with period ~12.3 years. The actual `ClimateForcing` type has fields:
`rainfall`, `temperature`, `seaState`, `drought`, `floodRisk`. There is also
a seasonal oscillator (period 12 days = 1 year) and a storm cycle (period 31
days ≈ 2.6 years).

**What's missing:** The existing regime oscillator modulates rainfall and
temperature, but the result is not classified or exposed. The weather
generation in `game.ts:~2430` uses `hash2()` independently of the climate
state, so the regime has weak coupling to what the observer sees.

**Data structures — extend (not replace) ClimateForcing:**

```typescript
export type ClimateRegime = "wet" | "normal" | "dry" | "dry-cold";
export type ClimateForcing = {
  rainfall: number;
  temperature: number;
  seaState: number;
  drought: number;
  floodRisk: number;
  regime: ClimateRegime;       // NEW: classified from existing oscillator
  regimeIntensity: number;     // NEW: 0-1, how deep into the regime
};
```

**Algorithm — compose with existing oscillator:**

Keep the existing `regime` sinusoidal at period 148 days. Add a longer
super-regime oscillator at period `(220 + (seed % 180))` days (18-33 years):

```typescript
const superRegime = Math.sin((this.elapsedDays / superPeriod) * Math.PI * 2
  + this.regimePhase * 0.7);
const combined = regime * 0.4 + superRegime * 0.6;  // weight toward long cycle
```

Classify the combined signal:
- `combined < -0.25 && temperature < -0.2` → `"dry-cold"` (compound regime;
  threshold at -0.2 avoids over-triggering from normal seasonal winter dips)
- `combined < -0.25` → `"dry"`
- `combined > 0.25` → `"wet"`
- else → `"normal"`

This allows compound dry+cold states, addressing the critique that the original
classification couldn't express the most dangerous historical combination.

**Integration with weather in game.ts:**

Weather generation uses `this.weatherDays` (observer-paced), while the climate
regime advances with `this.simDays` (simulation-paced). The regime is read from
`this.simulation.snapshot.climate.regime` — which advances with simDays. This
is correct: at 96× speed, many years of regime pass while the observer sees a
few weather cycles, but the regime-adjusted baselines reflect the simulated
climate, not the visual clock.

Replace flat probability bands at line ~2434:

```typescript
const regime = this.simulation.snapshot.climate.regime;
const dryBias = regime === "dry" ? 0.18
  : regime === "dry-cold" ? 0.22
  : regime === "wet" ? -0.12 : 0;
const clearCutoff = (0.48 - seasonWetness) + dryBias;
// ... adjust overcast/rain/storm cutoffs similarly
```

Drought events: probability ×2 during dry/dry-cold regimes.
Flood events: probability ×2 during wet regimes.

**HUD:** In `refreshHud()`, when regime !== "normal":
- `"dry"` → "A dry decade is settling in."
- `"wet"` → "Wet years are favoring the fields."
- `"dry-cold"` → "Cold drought is stressing crops and morale."

---

### A2 — Rare catastrophic events (#9)

**Prerequisite:** `Game` must have `this.gameRandom: SeededRandom` (see
Overview). All catastrophe rolls use this instance.

**Data structures:**

```typescript
// Parallel to WorldEvent, not a member of the union.
// WorldEvent remains mutually exclusive for mild events.
type CatastropheState = {
  kind: "earthquake" | "eruption" | "meteorite" | "tsunami" | "locusts";
  epicenterQ: number;
  epicenterR: number;
  radius: number;
  intensity: number;        // 0-1
  startDay: number;
  durationDays: number;
  buildingsDestroyed: number;
  resolved: boolean;
} | null;

// New field on Game:
private catastrophe: CatastropheState = null;
```

Catastrophes run as parallel state alongside `WorldEvent` — an earthquake
during a drought is valid and compounds the pressure.

**Probability model (checked once per year via `this.gameRandom`):**

```
earthquake:  base 1/100, ×2.5 if any volcanic tile in this.tiles
eruption:    base 1/200, only when volcano landmark tile exists in this.tiles
meteorite:   base 1/800 (global, always possible)
tsunami:     not independent — triggered by coastal earthquake or eruption
locusts:     base 1/50, ×2 during dry/dry-cold climate regime
```

**Epicenter selection (handling unloaded tiles):**

Earthquakes and eruptions use only loaded tiles (`this.tiles`). This matches
the existing society-founding pattern: unobserved regions don't produce events.
Meteorites pick a random loaded tile. Volcanic eruptions target the volcano
landmark tile directly (found by iterating `this.tiles`).

**Damage algorithm:**

After picking epicenter and radius, iterate tiles within radius:

1. For each tile with a building, roll destruction:
   `destroyChance = intensity * (1 - mitigation)` where mitigation =
   `watch` institution (0.15) + `resilience` trait × 0.1 + `maintenance`
   institution (0.12).
2. If destroyed: remove building mesh, set `tile.building = null`,
   `tile.ready = false`, record `abandonment` stratigraphy at 0.65.
3. After the destruction loop: call `assignHomes()` and `assignJobs()` to
   reassign displaced workers. People whose `homeQ/homeR` or `workQ/workR`
   pointed at a destroyed tile get reassigned — they don't vanish.
4. For destroyed huts specifically: remove residents via a deferred removal
   list (collect person references first, then splice — never mutate
   `this.people` during iteration).

**Ash/eruption overlap:** The mild `"ash"` event (line 2455) coexists with
the catastrophic `"eruption"`. An eruption suppresses further ash events for
20 years (tracked via `this.lastEruptionDay`). An active eruption implies
stronger ashfall than the mild event.

**Spacecraft mode:** All catastrophes except meteorite are disabled in
`spacecraftMode`. Meteorite becomes a hull-breach event: reduces
`hullIntegrity` by 5-15 points instead of destroying tiles, and triggers the
existing hull-repair mechanic.

**Biome mutation (eruption):** `WorldState` doesn't store biome — it comes
from `sampleWorld()`. Add a `biomeOverrides: Map<string, Biome>` to
`WorldState`. When `WorldState.sample()` is called, check overrides first.
Eruptions write `"volcanic"` overrides for tiles in the inner radius.
Overrides persist across tile load/unload.

**Crater landmark:** Add `"crater"` to the `Landmark` type in `world.ts`.
Add `makeCrater()` in `models.ts`: inverted cone (radius 0.4, depth 0.3)
with a ring of scorched material (dark brown torus). This is ~20 lines of
Three.js geometry. The crater is written as a landmark override in
`WorldState` alongside the biome override system.

**Chronicle:** Every catastrophe logs: kind, year, epicenter, buildings
destroyed, casualties, mitigation applied.

---

## Cluster B: Ecological-Economic Feedback (#1, #3, #4)

### B1 — Epidemic spread along trade routes (#1)

**Data structures — extend NetworkRegion:**

```typescript
// network.ts — add to NetworkRegion:
diseaseRisk: number;       // 0-1, from ecology.disease
healthProtection: number;  // 0-1, computed from institutions + innovations
```

`healthProtection` is computed in `game.ts` before calling
`exchangeRegions()`, at line ~2834 where `NetworkRegion` structs are built:

```typescript
const instEffects = institutionEffects(playerSim.institutions);
const innovEffects = innovationEffects(playerSim.innovations);
const healthProtection = instEffects.healthProtection + innovEffects.healthProtection;
// Add to the player NetworkRegion struct:
diseaseRisk: playerSim.ecology.disease,
healthProtection,
```

Same for each society's region struct, using their respective simulation
snapshots.

**Disease transmission in exchangeRegions():**

```typescript
// After existing trade flow computation:
for each pair (A, B) with connection !== "none":
  const factor = connection === "trade" ? 0.08 : 0.024;
  effectA.diseaseImport += factor * B.diseaseRisk * (1 - A.healthProtection);
  effectB.diseaseImport += factor * A.diseaseRisk * (1 - B.healthProtection);
```

**In engine.ts:** `diseaseImport` is passed as a new optional field on
`SimulationInputs`. In the ecology step, it adds to the cellular disease
field: `disease += diseaseImport * 0.5`. This is damped (×0.5) to prevent
runaway positive feedback between trade and disease.

**Epidemic as parallel state (not WorldEvent):**

```typescript
// New field on SimulationSnapshot:
diseaseOutbreak: boolean;  // true when ecology.disease > 0.55
```

In `game.ts`, epidemic state is checked alongside `WorldEvent` — both can be
active simultaneously. During an epidemic: `staffFactor()` returns ×0.7,
mortality risk gets +0.15, chronicle logs source attribution (the connected
region with highest diseaseRisk).

**Society-level epidemics:** The same `diseaseImport` field flows into each
society's `RegionSimulationInput.inputs`, and their engines independently
set `diseaseOutbreak`. Each society's epidemic is handled in `tickWorld()`
after `regionalSnapshots` are applied.

---

### B2 — Resource exhaustion and declining mine yields (#3)

**Depletion curve — smooth, no discontinuity:**

```typescript
// game.ts, inside gold calculation for mines (~line 2520):
const mineralStock = this.simulation.snapshot.ecology.minerals;
const depletionFactor = Math.max(0.18, Math.sqrt(mineralStock));
goldGain *= depletionFactor;
```

`Math.sqrt` gives a smooth curve: at minerals=1.0 → factor 1.0, at 0.5 →
0.71, at 0.2 → 0.45, at 0.04 → 0.20. The floor of 0.18 (raised from 0.08
per critique) represents scavenging/recycling and prevents death spirals.

**AI response:** In `ai.ts`, `chooseNextBuilding()` receives the mineral
stock. When minerals < 0.35, `mine` priority drops by 60% and `market`
priority rises by 40%.

**Limitation:** `ecology.minerals` is a settlement-wide average, not
per-tile. All mines in a settlement produce at the same depleted rate.
This is acceptable for v1 — per-tile mineral tracking would require
coupling the cellular grid to individual tile coordinates, which is a
larger refactor. Do not attempt per-tile depletion in this pass.

**Mineral regeneration:** In `cellular.ts`, minerals regenerate at 0.0001
per year when no mine is operating on a cell. At this rate, full recovery
takes ~6,000 years — functionally zero in normal play, visible only in
deep-time. This is intentional.

**Notification and chronicle:** Outlook text changes when minerals < 0.5
("mineral yields are declining") and < 0.2 ("mines are nearly exhausted").
Chronicle logs threshold crossings.

---

### B3 — Famine cascades and commons buffer (#4)

**The engine already has spoilage and storage capacity.** `engine.ts:144`
applies 1.8%/year spoilage scaled by infrastructure and institutional
`spoilageProtection`. `storageCapacity()` at line 302 enforces per-resource
caps based on buildings, population, and infrastructure.

**What to change (tune existing, don't duplicate):**

1. **Increase base spoilage** from 0.018 to 0.022 per year. This is a
   conservative first step (22% increase, not 56%). The difference between
   a connected settlement with commons (effective ~1.0%/year) and an
   isolated camp (~2.2%/year) becomes material without punishing early game.
   Can be raised further after playtesting.

2. **Fix commonReserve ordering bug.** Currently in `evolveInstitutions()`,
   the reserve target is recomputed every step. During famine, surplus → 0 →
   target → 0 → reserve drains via exponential convergence before it can
   help. Fix: **release first, then recompute target.**

   In `engine.ts`, add a famine buffer step before calling
   `updateInstitutions()`:

   ```typescript
   if (this.state.stores.food < inputs.population * 2.0
       && this.state.institutions.forms.includes("commons")
       && this.state.institutions.commonReserve > 0.5) {
     const release = Math.min(
       this.state.institutions.commonReserve * 0.6,
       inputs.population * 2.0 - this.state.stores.food
     );
     this.state.stores.food += release;
     this.state.institutions.commonReserve -= release;
     // Flag for chronicle
   }
   ```

3. **Society food storage:** Tribe societies' infrastructure is currently
   hardcoded to `{ roads: 0, ports: 0, tradeRoutes: 0 }` at game.ts:~2668.
   This gives them minimal storage via `storageCapacity()`. Pass actual
   infrastructure counts for tribe societies (count their roads, ports, and
   trade routes the same way `playerInfrastructure()` does).

**No new storage cap in game.ts.** The engine's `storageCapacity()` is the
single enforcement point.

**Chronicle:** Log "the common granary opens its reserves" when the buffer
activates. Log "stores are at capacity — surplus decays" when food hits the
storage cap.

---

## Cluster C: Social Complexity (#5, #6, #7, #8)

**Scope note (from critique):** Cluster C is the largest. C4 (innovation
graph) should be implemented as a separate PR from C1+C2+C3. The innovation
maturity model is deferred — ship expanded techniques as boolean has/hasn't
first, add maturity as a follow-up.

### C1 — Richer diplomacy (#5)

**New message types in diplomacy.ts:**

```typescript
export type DiplomaticMessageKind =
  | "trade-proposal" | "rival-claim" | "warning"
  | "gift" | "festival-invitation" | "marriage-alliance" | "defense-pact";
```

**Per-type mechanics (revised costs from critique):**

| Kind | Cost | Prerequisite | Trust | Relation | Special |
|------|------|-------------|-------|----------|---------|
| `gift` | 5 gold | market | +0.06 | +3 | Slow, reliable |
| `festival-invitation` | 3 gold | shrine | +0.04 | +5 | +4 mood both sides, cultural exchange ×1.5 |
| `marriage-alliance` | 12 gold | pop > 8, parley | +0.12 | +8 | Reciprocal: each side sends 1 person. Adds `kinshipTie: boolean` to channel, trust decay ×0.6 |
| `defense-pact` | 8 gold | watch inst., parley | +0.08 | +6 | Conflict escalation ×0.7 between pair |

**Marriage fix (from critique):** Marriage is now reciprocal (both sides
transfer one person) and costs 12 gold. This prevents it from being free
population growth.

**Autonomous timing:** Autonomous societies evaluate diplomatic actions once
per diplomacy tick (every 3 sim-days, in `advanceAutonomousRelations()`).
They choose based on cultural traits using `this.gameRandom`, not
`Math.random()`.

**Conflict arbitration (from critique):** Three conflict paths exist:
(a) existing `resolveConflict()`, (b) C3 territorial negotiation, (c) D2 war.
Rule: **if a war is active between two societies, skip both (a) and (b) for
that pair.** If (b) territorial negotiation succeeds, suppress (a) for that
pair for 5 years. Implemented as a `conflictCooldown: Map<string, number>`
in `Game`.

---

### C2 — Population age structure (#6)

**Age advancement (deferred removal — from critique):**

In `tickWorld()`, once per year:

```typescript
const toRemove: number[] = [];  // indices to remove
for (let i = 0; i < this.people.length; i++) {
  const person = this.people[i];
  person.age += 1;
  if (person.age >= 78) {
    const mortalityChance = 0.15 + (person.age - 78) * 0.08;
    if (this.gameRandom.next() < mortalityChance) {
      toRemove.push(i);
    }
  }
}
// Remove in reverse order to preserve indices:
for (let i = toRemove.length - 1; i >= 0; i--) {
  const person = this.people[toRemove[i]];
  this.peopleGroup.remove(person.mesh);
  this.people.splice(toRemove[i], 1);
}
if (toRemove.length > 0) { this.assignHomes(); this.assignJobs(); }
```

**Small-population guard (from critique):** Elder mortality only fires when
the region's total population is > 6. Settlements with ≤ 6 people are too
fragile for stochastic elder death.

**Demographics — real ages, not flat ratios:**

Replace `reconcilePopulation()` in `engine.ts` (line 203) which currently
uses fixed 22%/12% ratios. Instead, `SimulationInputs` gets a new field:

```typescript
demographics: { children: number; adults: number; elders: number };
```

Computed in `game.ts` from actual person ages:
- Adults: 16-64, Elders: 65+ (directly counted from `this.people`)
- Children: estimated as `adults * 0.28` (cohort weight, not tracked
  individually — no deferred spawn queue, no separate data structure)

The `demographics` field on `SimulationInputs` is optional (`demographics?:`)
for backward compatibility. When absent (e.g., in `advanceRegions()` for
tribe societies that don't have per-person age tracking), the engine falls
back to the existing flat-ratio `reconcilePopulation()`. Tribe demographics
are computed from their people array in the same way as the player's.

The engine's `reconcilePopulation()` now uses the passed demographics
instead of computing flat ratios.

**Dependency ratio:** Applied to `annualProduction` in `game.ts` before
sending to the engine. This does NOT double-count with the engine's
health-based scaling — the engine's health scaling reflects food security
and stability, while the dependency ratio reflects labor availability.
They address orthogonal pressures.

```typescript
const depRatio = (demographics.children + demographics.elders)
  / Math.max(1, demographics.adults);
const laborEff = 1 / (1 + depRatio * 0.25);  // reduced from 0.35
annualProduction.food *= laborEff;
annualProduction.wood *= laborEff;
// Gold is less labor-intensive, skip
```

**Elder knowledge:** +0.6 knowledge per elder per year (reduced from 0.8).
The `elders` institution amplifies ×1.4.

---

### C3 — Territorial disputes from resource competition (#7)

**Contested resource counting** — same as original spec.

**Negotiation uses `this.gameRandom`** (not `Math.random()`).

**`splitContestedTerritory()` algorithm:** Contested tiles are sorted by
distance to each claimant's center tile. Each tile goes to the closer
claimant. Ties go to the claimant with fewer total tiles (equity). This is
deterministic and non-exploitable.

**Feed into conflict resolution** — same as original spec: contested
pressure × 0.04 added to grievance.

---

### C4 — Expanded innovation graph (#8)

**Shipped as a separate PR. Maturity deferred.**

**Phase 1 (this spec):** Expand from 7 to 15 techniques, all boolean
has/doesn't-have:

```typescript
export type Technique =
  | "seed-selection" | "crop-rotation" | "irrigation" | "terracing"
  | "coastal-navigation" | "sailcraft" | "harbor-engineering"
  | "metallurgy" | "masonry"
  | "ledger" | "codified-law" | "public-archive"
  | "waterworks" | "soil-restoration" | "forestry-management";
```

Each technique has 2-3 prerequisite paths (any one suffices). Format matches
the existing `evolveInnovations()` pattern of `discover(name, source, condition)`.

**Era gate wiring:** New techniques that should bypass era gates get added
to `eraAllows()` in `game.ts:1826`, following the existing pattern where
practices like "soil-rest covenant" gate specific buildings.

**Effects:** `innovationEffects()` returns the same 6-field struct. New
techniques contribute additively (e.g., `terracing` adds +0.06 to `food`,
`masonry` adds +0.08 to `extraction`). The struct interface doesn't change.

**Diffusion:** In `exchangeRegions()`, technique names are compared between
connected regions. A missing technique is discovered with probability
`0.03 * connectionStrength * curiosity_trait` per year. This is a simple
extension of the existing cultural exchange pattern.

**Phase 2 (future):** Add maturity (0-1 continuous), decay when
preconditions vanish, archive-institution decay resistance. This is a
separate issue and PR.

---

## Cluster D: Civilization-Scale Events (#10, #11)

### D1 — Pandemic events (#10)

**Relationship to B1:** B1 adds endemic disease transmission (steady-state,
gradual). D1 adds pandemics (rare, explosive, civilization-altering). The
boundary: when `diseaseOutbreak` (from B1) persists for 2+ years in any
region with active trade, a pandemic can trigger.

**Data structures:**

```typescript
// types.ts — new in SimulationSnapshot:
pandemic: PandemicState | null;

type PandemicState = {
  id: number;
  virulence: number;           // 0-1
  transmissibility: number;    // 0-1
  originRegion: string;
  startYear: number;
  affectedRegions: string[];   // NOT Set — must serialize
  resolved: boolean;
};
```

**Trigger (in engine.ts, once per year):**

```typescript
if (this.state.pandemic === null
    && this.state.ecology.disease > 0.65
    && inputs.population > 12
    && inputs.infrastructure.tradeRoutes > 0) {
  const roll = this.random.next();
  if (roll < (this.state.ecology.disease - 0.65) * 0.12) {
    // Spawn pandemic
  }
}
```

**Damping (from critique):** The endemic→pandemic positive feedback loop is
damped by: (1) disease transmission in B1 has a ×0.5 damping factor, (2)
pandemics have a minimum 40-year cooldown between occurrences (tracked via
`lastPandemicYear` on snapshot), (3) `plague-memory` practice provides
+0.1 healthProtection permanently, making repeat pandemics progressively
weaker.

**Recurrence:** Pandemics can recur after the 40-year cooldown, but each
subsequent one is weaker due to accumulated `plague-memory` practices
across the network.

**Spread:** Pandemic spread is computed in the engine using
`SimulationInputs.infrastructure.tradeRoutes` — not by iterating game.ts
tiles. This preserves headless/rendered determinism.

**Duration:** 2-5 years (deterministic per seed via `this.random`).

---

### D2 — War as multi-phase process (#11)

**Simplified to 3 phases (from critique):**

```typescript
// New file: src/simulation/warfare.ts
export type WarPhase = "escalation" | "active" | "resolution";
export type WarOutcome = "victory" | "defeat" | "negotiated-peace" | "exhaustion";

export type WarState = {
  aggressorId: string;
  defenderId: string;
  phase: WarPhase;
  startYear: number;
  aggressorStrength: number;
  defenderStrength: number;
  attritionAccumulated: number;
  resolved: boolean;
  outcome: WarOutcome | null;
};
```

**Phase transitions:**

| Phase | Transition |
|-------|-----------|
| `escalation` | warRisk > 0.7 AND no active diplomatic channel AND not in cooldown → `active` |
| `active` | strength ratio > 2:1 → `resolution` (victory/defeat); accumulated attrition > 25 → `resolution` (exhaustion); negotiation succeeds (trust > 0.3, roll via engine's `this.random` through a `negotiationRoll` field on `SimulationInputs`) → `resolution` (negotiated-peace) |
| `resolution` | apply outcome, set cooldown, reset war state |

This merges the original 6 phases into 3, eliminating the stuck-transition
risk where campaign and attrition could loop indefinitely.

**Strength computation — simulation-layer only (from critique):**

Strength must be computable from `SimulationInputs` fields, not game.ts
tile iteration, to preserve headless determinism:

```typescript
function computeStrength(inputs: SimulationInputs, snapshot: SimulationSnapshot): number {
  return inputs.population * 0.3
    + inputs.buildings.forge * 3
    + inputs.buildings.mine * 1.5
    + inputs.infrastructure.roads * 0.5
    + snapshot.institutionalStrength * 5
    + (snapshot.stability * 100) * 0.1;
}
```

**Trade routes during war:** When two societies enter `active` phase, their
diplomatic channel treaty is set to `"hostile"`, which causes
`channelSupportsTrade()` to return false. This severs trade routes
automatically through the existing mechanism.

**War cooldown:** `Map<string, number>` (pair key → last war end year)
stored on `Game`. Minimum 30 years between wars for the same pair.

**Mobilization effect:** During `active` phase, the mobilized society's
`SimulationInputs.moodPressure` gets -0.15, and `annualProduction` is
scaled ×0.7 (labor diverted to defense).

---

## Cluster E: Speculative/Philosophical (#12, #13)

### E1 — Alien contact (#12)

**Trigger — capped probability (from critique):**

```typescript
const base = 0.002;
const eraMultiplier = ["Adaptive", "Orbital"].includes(era) ? 3 : 1;
const archiveMultiplier = has("public-archive") ? 1.5 : 1;
const spaceMultiplier = spacecraftMode ? 2.5 : 1;
const knowledgeFactor = Math.min(2.0, knowledge / 100);  // CAPPED at 2.0
const probability = Math.min(0.08, base * eraMultiplier * archiveMultiplier
  * spaceMultiplier * knowledgeFactor);  // hard cap 8%
```

**Simplified to 3 outcomes (from critique):**

Remove `"material-trade"` (gold from nowhere breaks accounting) and
`"cultural-pressure"` (ongoing accounting doesn't exist yet):

| Outcome | Knowledge | Mood | Cultural impact |
|---------|-----------|------|-----------------|
| observation | +15/yr | +3 | 0 |
| knowledge-exchange | +40/yr | +5 | 0.15 (identity pressure) |
| withdrawal | +5 (one-time) | -8 | 0.1 |

**Collapse during interpretation:** If the society's population drops to 0
or the society is deleted from `this.societies` during interpretation, the
`AlienContactState` is set to `resolved` with outcome `"withdrawal"`. The
chronicle records "Contact abandoned — the interpreting society fell before
the signal was understood."

**Visual:** Pulsing emissive sphere on a random planet in `cosmos.ts` when
contact is active. Color: blue during interpretation, green for observation,
gold for exchange, red for withdrawal.

---

### E2 — Simulation hypothesis layer (#13)

**Deferred to post-v1 (from critique).**

Reasons:
1. The numerical-coincidence detector fires too frequently (~every 2-5 years)
   and would need much tighter thresholds to feel anomalous.
2. The shadow simulation for parameter sensitivity won't hit <1ms on the main
   thread — the engine runs in a Worker for exactly this reason.
3. "Constant shift" mutates simulation state, violating its own design
   principle that anomalies are patterns in output, not model violations.
4. The chronicle system is too immature for structural analysis (it's a flat
   event log).

**When to revisit:** After Clusters A-D are shipped and the chronicle has
causal event chains. The anomaly detector should be built on top of real
structural patterns in the chronicle, not on raw metric comparisons.

---

## Implementation Order (revised)

1. **A1** (climate oscillations) — extends existing code, no dependencies
2. **B2** (resource exhaustion) — small, self-contained, 1 file + AI tweak
3. **B3** (famine buffer) — tune existing engine values + ordering fix
4. **B1** (epidemic spread) — extends network.ts + parallel state
5. **C2** (age structure) — person lifecycle, deferred removal
6. **C3** (territorial disputes) — contested pressure → conflict
7. **C1** (richer diplomacy) — new message types + conflict arbitration
8. **A2** (catastrophic events) — needs gameRandom, WorldState extensions
9. **D1** (pandemics) — depends on B1 disease network
10. **D2** (war) — depends on C1 diplomacy, needs simulation-layer strength
11. **C4** (innovation graph) — **separate PR**, expanded boolean techniques
12. **E1** (alien contact) — largely independent, late-game
13. ~~**E2** (simulation hypothesis) — deferred to post-v1~~

## Testing Strategy

- All simulation-only changes must pass existing `engine.test.ts` and new
  deterministic snapshot tests: same seed → same snapshot fields at year N.
- **Headless/rendered parity:** War and pandemic state must produce identical
  results in `npm run research` (headless) and browser. Test by comparing
  checkpoints from both paths for the same manifest.
- Catastrophe tests: same seed → same catastrophe at same year. Mitigation
  reduces damage measurably.
- Network tests: disease and technique transmission between regions with
  known connection states and healthProtection values.
- No visual regression tests — visual changes verified via `npm run dev`.

## Critique Resolution Log

| Critique finding | Resolution |
|-----------------|------------|
| A1: spec misread ClimateForcing fields | Fixed: extend real type, keep seaState/drought/floodRisk |
| A1: existing regime oscillator ignored | Fixed: compose new super-regime with existing oscillator |
| A1: no compound dry+cold regime | Fixed: added "dry-cold" regime classification |
| A2: Game has no SeededRandom | Fixed: add gameRandom to Game constructor |
| A2: WorldState doesn't store biome | Fixed: add biomeOverrides map to WorldState |
| A2: spacecraft mode unaddressed | Fixed: disable all except meteorite→hull-breach |
| A2: people on destroyed tiles | Fixed: deferred removal + assignHomes/assignJobs |
| A2: ash/eruption overlap | Fixed: eruption suppresses ash for 20 years |
| B1: healthProtection not on NetworkRegion | Fixed: add to NetworkRegion, compute in game.ts |
| B1: epidemic as WorldEvent (mutually exclusive) | Fixed: parallel state, not union member |
| B1: society-level epidemic missing | Fixed: flows through RegionSimulationInput |
| B2: depletion curve discontinuity | Fixed: smooth sqrt curve, floor raised to 0.18 |
| B3: engine already has spoilage + storage | Fixed: tune existing values, don't duplicate |
| B3: commonReserve ordering bug | Fixed: release before recompute target |
| B3: society infrastructure hardcoded to 0 | Fixed: pass actual infrastructure counts |
| C1: marriage is free population | Fixed: reciprocal transfer + 12 gold cost |
| C2: iterator mutation bug | Fixed: deferred removal with reverse-order splice |
| C2: small-population crash risk | Fixed: guard on population > 6 |
| C2: children model hand-waved | Fixed: simple cohort weight, no spawn queue |
| C2: dependency ratio double-counting | Fixed: reduced coefficient, orthogonal to health scaling |
| C3: negotiation uses unspecified random | Fixed: uses gameRandom |
| C4: too large, maturity adds bookkeeping | Fixed: separate PR, boolean-only phase 1 |
| C: three overlapping conflict paths | Fixed: conflict arbitration rules added |
| D1: Set<string> won't serialize | Fixed: string[] |
| D1: endemic→pandemic feedback loop | Fixed: ×0.5 damping + 40-year cooldown + plague-memory |
| D2: 6 phases over-engineered | Fixed: collapsed to 3 phases |
| D2: strength uses render-layer state | Fixed: computed from SimulationInputs only |
| D2: trade routes during war unspecified | Fixed: treaty → hostile, auto-severs routes |
| D2: cooldown data structure missing | Fixed: Map<string, number> specified |
| E1: probability uncapped | Fixed: knowledge factor capped at 2.0, total capped at 8% |
| E1: gold from nowhere in material-trade | Fixed: removed material-trade outcome |
| E1: collapse during interpretation | Fixed: → withdrawal with chronicle entry |
| E2: anomaly detector fires too often | Fixed: deferred entirely to post-v1 |
| E2: shadow simulation unrealistic | Fixed: deferred |
| E2: constant shift mutates state | Fixed: deferred |
