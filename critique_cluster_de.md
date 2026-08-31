# Critique: Clusters D and E

## 1. War state machine — over-engineered for a background simulation

Six phases is too many. The simulation ticks at sub-day fidelity (1/8 day steps); war phases span years. A `grievance → ultimatum → mobilization → campaign → attrition → settlement` pipeline requires phase-year tracking, minimum-duration guards, and transition conditions that reference game.ts state (mood, building counts). That's a lot of machinery for what the observer sees as a few chronicle entries.

**The "grievance" phase is redundant.** The existing `resolveConflict()` already computes pressure from grievance + scarcity + relation. Grievance accumulation is just the current system. Renaming it a "phase" adds a state machine wrapper around behavior that already exists.

**Collapse into 3 phases:** `escalation` (current conflict check + ultimatum), `active` (mobilization + campaign merged — drain production, tick strength), `resolution` (settlement). This halves the state and removes the stuck-transition risk where a campaign never reaches 2:1 ratio and attrition never drops mood below 20, creating a permanent war.

**Missing: trade routes during war.** The spec says nothing about what happens to trade routes between warring societies. Currently `channelSupportsTrade()` checks treaty state, but war isn't a treaty — it's a separate state machine. Trade routes would remain open during active warfare unless the spec explicitly severs them. This is a bug-in-waiting.

**Missing: war cooldown enforcement.** The "30 years between any pair" constraint needs a data structure (a `Map<string, number>` of pair→lastWarYear), but none is specified.

## 2. Pandemic vs epidemic — unclear boundary

Cluster B1 adds endemic disease transmission (`diseaseImport` in `exchangeRegions`), which sets `diseaseOutbreak: boolean` when aggregate disease > 0.55. Cluster D1 adds pandemics that trigger when disease > 0.65 with trade routes. The boundary is: 0.55-0.65 = epidemic, >0.65 = pandemic?

**Problem:** The endemic system *raises* disease via trade, which means it directly feeds the pandemic trigger. This creates a positive feedback loop: trade → disease import → disease rises → pandemic triggers → massive mortality → disease falls → trade resumes → repeat. The spec has no damping mechanism other than "plague-memory" practice (+0.1 healthProtection permanently). After 3 pandemics, the society is essentially immune.

**`Set<string>` doesn't serialize.** `PandemicState.affectedRegions` is typed as `Set<string>`, but the spec requires all state to serialize into `WorldManifest` checkpoints. `Set` doesn't survive `JSON.stringify`. Use `string[]`.

**Missing: can pandemics recur?** The spec says pandemics end when disease < 0.3 in all regions. It doesn't say whether the same seed can produce a second pandemic. If yes, the trigger check would fire again once disease drifts back above 0.65. If no, there needs to be a cooldown or "already had a pandemic" flag.

## 3. Alien contact — scope is barely contained

The spec says "the alien civilization is never directly modeled" but then defines 5 outcomes that modify knowledge, gold, mood, and cultural practices on an ongoing per-year basis. "Material-trade" grants +8 gold/year and +20 knowledge/year permanently — that's a massive economic injection. Where does the gold come from? The simulation tracks every store flow; injecting 8 gold/year from nowhere breaks the closed-loop accounting that the rest of the simulation respects.

**Fix:** Model alien trade as an asymmetric exchange — the society sends resources (gold, cultural artifacts) and receives knowledge. This keeps stores balanced and creates a tradeoff (gold drain for knowledge gain) instead of a free bonus.

**Missing: what if the society collapses during interpretation?** Interpretation takes ~6-12 years (rate 0.08-0.21/year). If the society collapses mid-interpretation (population → 0, society deleted from `this.societies`), the `AlienContactState` on the snapshot becomes orphaned. The engine keeps ticking it on a deleted entity. Need a "contact abandoned" exit path.

**The probability math is wrong.** `base * (knowledge / 100)` means a society with knowledge=1000 has a 20% annual chance of contact (base 0.002 × 10). Knowledge is uncapped and regularly exceeds 100 in long games. Either cap the multiplier or use a diminishing function.

## 4. Simulation hypothesis — more noise than signal

**The numerical-coincidence detector will fire constantly.** It checks 6 pairs of metrics (C(4,2)) for integer-ratio proximity within 0.005. With 4 floating-point metrics that change every tick, hitting a near-integer ratio is overwhelmingly likely. In testing, this will probably fire every 2-5 years — too frequent to feel "anomalous." The threshold needs to be much tighter (0.0005), or the check should require the ratio to be a *specific* integer (exactly 2:1, 3:1) rather than any integer.

**The shadow simulation for parameter sensitivity is unrealistic at <1ms.** `advanceYears()` with a 10-year span runs the full ecology, institution, innovation, and culture update pipeline. Running it 3× per frame (or even per lens selection) on the main thread will cause jank. The engine runs in a Web Worker specifically to avoid blocking the main thread. Either run sensitivity analysis in the worker (async, results arrive next frame) or drop it in favor of static sensitivity heuristics.

**"Constant shift" mutates simulation state.** The spec has the anomaly detector *modify* `soilRecoveryModifier` — a simulation parameter — as a side effect. This breaks the principle that anomalies are patterns in output, not violations of the model. If the soil recovery rate actually changes, it's no longer an "anomaly" — it's a real simulation mechanic disguised as philosophy.

## 5. Determinism concerns

War phase transitions depend on `mood`, `forgeCount`, `population`, and `terrainAdvantage`. The first three are computed differently in the rendered game (game.ts counts tiles and people) vs. the headless runner (which uses only SimulationSnapshot). The spec puts `WarState` in the simulation layer but its inputs come from the render layer. This will cause divergence between `npm run research` (headless) and browser runs.

**Fix:** War must live entirely in `SimulationEngine`, using only `SimulationInputs` and `SimulationSnapshot` fields. Strength should be computed from `inputs.buildings.forge`, `inputs.population`, `inputs.infrastructure`, not from tile iteration.

## 6. Should Cluster E exist in v1?

**Alien contact: yes, but simplified.** It's a rare wildcard that tests institutional resilience — that's genuine simulation value. But strip it to 3 outcomes (observation, exchange, withdrawal) and remove "material-trade" and "cultural-pressure" which both require ongoing accounting that doesn't exist yet.

**Simulation hypothesis: defer entirely.** It adds no simulation value. It's an observer-layer easter egg that depends on a mature chronicle system (which doesn't exist yet — the current chronicle is a flat event log with no structural analysis). Building anomaly detection before the underlying systems are stable means the "anomalies" will be artifacts of incomplete modeling, not meaningful patterns. Implement it after Clusters A-D are shipped and tested.

## 7. Summary of missing details

- **War:** Trade route fate during war, cooldown data structure, strength computation must use simulation-layer inputs only.
- **Pandemic:** `Set<string>` serialization, recurrence rules, damping for the epidemic→pandemic feedback loop.
- **Alien:** Collapse-during-interpretation, uncapped probability, gold-from-nowhere in material-trade.
- **Hypothesis:** False-positive rate on coincidence detector, main-thread performance of shadow simulation, state mutation in anomaly detection.
