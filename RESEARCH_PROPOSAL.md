# Research Proposal: An Open-Ended Civilization Observatory

## Purpose

Turn Tiny Civilization from a visually rich settlement loop into an explainable,
replayable laboratory for long-lived societies. The simulation remains
observer-driven: the observer chooses a starting scenario, speed, lens, and
high-level written priorities; autonomous actors make all local decisions.

The central research question is:

> Can a compact, deterministic multi-scale model generate legible, divergent
> civilizational histories without relying on scripted story events?

The existing project already provides the foundation: procedural world forms,
cellular ecology, regional exchange, cultural traits and practices, deep-time
projection, and society split/collapse/renewal. The milestones below deepen
causality rather than merely adding content.

## Design Principles

- **Causality before spectacle.** Every visible outcome needs model inputs that
  can be inspected in the chronicle.
- **Bounded detail.** Simulate a small number of meaningful agents and fields
  rather than pretending to model every individual at full resolution.
- **Deterministic replay.** A world seed plus written policy should reproduce
  the same history; controlled variation comes from explicit branches.
- **Cross-scale feedback.** Household choices affect districts, districts
  affect regions, and regional exchange alters household opportunity.
- **Multiple viable futures.** Success is not one tech tree. A maritime commons,
  a resilient agrarian federation, or an extractive city-state can each emerge.
- **Deep-time honesty.** Million-year views should report which processes were
  converged or sampled, rather than implying daily historical precision.

## Milestones

### M1 — Reproducible chronicle and experiment runner

**Hypothesis:** Open-ended results become scientifically useful only when a
history can be replayed, compared, and attributed to a scenario.

Build a versioned `WorldManifest` containing seed, world form, origin,
temperament, initial stores, written directives, model-version identifiers, and
periodic snapshots. Add a headless batch runner that can execute a matrix of
seeds/scenarios and export compact JSON chronicle files.

**Observable outcome:** An observer can open any saved chronicle, replay it at
different speed, and compare two runs side-by-side by year.

**Acceptance criteria:** Same manifest produces equivalent checkpoints in the
worker and headless runner; snapshots remain small enough for at least 1,000
worlds in a research batch.

### M2 — Event-sourced historical record

**Hypothesis:** A chronological explanation is more legible than a dashboard of
final values.

Record causal events such as settlement founding, practice adoption, drought,
trade opening, migration, schism, treaty, collapse, and renewal. Every event
stores triggering measurements and affected regions.

**Observable outcome:** The observer can select a year and read why a society
changed, not only that it changed.

**Acceptance criteria:** Every major state transition has an event record with
source IDs, simulation time, and a short generated explanation; event playback
does not modify simulation state.

### M3 — Spatial ecology at regional resolution

**Hypothesis:** Civilizations become more interesting when ecology is a
landscape with gradients and corridors, not one average per settlement.

Replace each settlement's small anonymous cellular grid with persistent regional
fields for soil, biomass, water, fish, disease habitat, mineral depletion, and
land-cover. Couple fields across adjacent tiles and watersheds. Render only the
aggregated or visible portion, while worker state remains chunked and sparse.

**Observable outcome:** A farm basin can exhaust upstream soil, forests can
recover along protected corridors, and fishing towns can damage distant stocks.

**Acceptance criteria:** Conservation-oriented and extractive policies produce
measurably distinct land-cover maps from the same seed; inactive chunks advance
without needing resident Three.js meshes.

### M4 — Hydrology, climate, and seasonal circulation

**Hypothesis:** Climate becomes a source of history when it has spatial memory
and teleconnections instead of random weather labels.

Add elevation-driven watersheds, groundwater, prevailing winds, sea surface
temperature, and seasonal precipitation. Use low-frequency climate oscillators
to create multi-year drought/flood regimes. Visual weather remains paced for
readability and independent of accelerated simulation time.

**Observable outcome:** Regions share drought patterns, mountain rain shadows
matter, and ports respond to storm seasons differently from inland towns.

**Acceptance criteria:** Weather maps are deterministic per seed; 30-year
climate statistics predict agricultural variance better than single-day weather.

### M5 — Households, kinship, and life courses

**Hypothesis:** Population behavior is more believable when migration,
inheritance, and labor arise from household needs rather than a global counter.

Represent only a sampled population of households with age structure, skills,
dependents, wealth, home, social ties, and remembered shocks. Use cohort weights
for the rest of the population. Households choose work, marriage/household
formation, migration, adoption, and specialization through utility rules.

**Observable outcome:** A famine may drive young households outward while elders
remain; prosperous towns may attract distinct worker types.

**Acceptance criteria:** Demographic totals remain consistent with weighted
households; household decisions aggregate to existing food, housing, and labor
accounts.

### M6 — Institutions as evolving rules

**Hypothesis:** Institutions should alter how a society allocates resources,
resolves conflict, and survives shocks—not simply add building bonuses.

Model councils, clans, guilds, temples, markets, cooperatives, militaries, and
archives as rule bundles. Each sets taxation, common-resource access, dispute
resolution, emergency stores, labor mobilization, and knowledge access. Their
legitimacy changes through outcomes and cultural fit.

**Observable outcome:** A common granary cushions a bad harvest but may invite
elite capture; a guild city trades efficiently but excludes newcomers.

**Acceptance criteria:** At least four institutional configurations can reach a
stable adaptive era through distinct mechanisms, with no mandatory building
sequence.

### M7 — Political geography and contested territory

**Hypothesis:** Territory becomes dynamic when claims emerge from settlement,
patrol, livelihood, sacred places, and treaties rather than colored radius.

Create layered claims: habitation, economic use, legal sovereignty, cultural
memory, and strategic control. Claims diffuse along roads, rivers, coasts, and
social networks; overlapping claims create negotiation, tribute, shared zones,
or conflict.

**Observable outcome:** Borders move after migrations and agreements; a ruined
city can retain a cultural claim long after its buildings disappear.

**Acceptance criteria:** Map colors distinguish claim type rather than only
owner; territorial changes have traceable causes in the chronicle.

### M8 — Diplomacy, trust, and information reliability

**Hypothesis:** Communication becomes meaningful when a signal can carry trust,
misunderstanding, and delayed information—not just resources.

Extend regional links into treaties, kin networks, merchant houses, religious
pilgrimage, hostile borders, and diplomatic missions. Messages travel with delay
and fidelity determined by infrastructure, language similarity, and relations.

**Observable outcome:** Two societies can exchange crops yet distrust each
other; a rumor can provoke migration before a distant disaster is visually known.

**Acceptance criteria:** Removing a route changes knowledge and coordination
before it changes trade volume; every agreement has maintenance costs and can
decay.

### M9 — Innovation as recombination and diffusion

**Hypothesis:** Technology should emerge from needs, materials, institutions,
and contact, rather than from a single scalar knowledge score.

Replace linear unlock checks with a directed knowledge graph of practices,
techniques, materials, and organizational know-how. Discoveries occur through
recombination of locally held capabilities and experiments. Preserve uncertainty:
an innovation may be adopted, forgotten, or adapted differently elsewhere.

**Observable outcome:** Similar inventions arise independently, while a port
can transmit navigational practice without transmitting a whole “era.”

**Acceptance criteria:** At least two independent pathways lead to each major
economic capacity; innovation provenance lists source practices and regions.

### M10 — Language, identity, and cultural phylogeny

**Hypothesis:** Cultural divergence is easier to perceive when it has an
audible/legible identity beyond five numeric traits.

Give each lineage a compact evolving lexicon, naming grammar, symbols, taboos,
ritual calendar, and identity boundaries. Model borrowing and creolization when
groups communicate, plus identity hardening under threat.

**Observable outcome:** Offshoots retain recognizable ancestry while eventually
developing distinct names, institutions, and alliances.

**Acceptance criteria:** A lineage tree can be rendered from event data;
linguistic distance correlates imperfectly—not identically—with geographic
distance.

### M11 — Trade networks, prices, and logistics

**Hypothesis:** Trade should be an emergent network constrained by transport,
risk, storage, and comparative advantage.

Introduce goods classes (staples, timber, metal, tools, luxuries, knowledge),
inventories, market prices, route capacity, seasonal travel time, spoilage, and
merchant credit. Let routes form from profit and trust, then reshape regional
specialization.

**Observable outcome:** An inland mining town depends on a coastal grain route;
route disruption can trigger price shocks and political change.

**Acceptance criteria:** Supply/demand is balanced per good; trade routes can
emerge, reroute, and fail without scripted missions.

### M12 — Conflict, deterrence, and recovery

**Hypothesis:** Conflict is most informative when it is a costly political
process, not a combat minigame or a random penalty.

Model grievances, bargaining, defense capacity, logistics, morale, intelligence,
and war aims. Resolve conflict at an abstract campaign scale. Include sanctions,
raids, civil unrest, secession, coups, reconciliation, and reparations.

**Observable outcome:** Strong societies can lose through overextension;
resource stress can end in negotiation, migration, or civil reform rather than
always war.

**Acceptance criteria:** Conflict has explicit alternatives to escalation;
post-conflict recovery leaves demographic, ecological, and cultural traces.

### M13 — Urban morphology and district self-organization

**Hypothesis:** Cities will feel alive when their visible form follows economic
and social structure.

Generate streets, lots, waterfronts, civic centers, informal settlements,
industrial belts, gardens, and infrastructure from land value, travel cost,
pollution, and institutions. Upgrade building silhouettes through construction
styles rather than replacing an entire city at once.

**Observable outcome:** Harbor cities grow along docks, ritual centers attract
public space, and inequality can produce peripheral housing.

**Acceptance criteria:** District maps differ under the same population but
different economies; rendering is LOD-friendly and terrain persistence remains
separate from visuals.

### M14 — Planetary, orbital, and spacecraft ecologies

**Hypothesis:** The spacecraft scenario becomes distinct when it is an ecology
of closed loops, not a terrestrial city on a dark map.

For orbital habitats model air, water, nutrients, waste, heat, radiation,
maintenance debt, orbital windows, mission goals, and limited resupply. Add
planetary colonies and delayed communication between worlds as late-game regions.

**Observable outcome:** A habitat may thrive culturally while facing a slow
nutrient bottleneck; orbital and ground settlements exchange different goods and
ideas across delay.

**Acceptance criteria:** No terrestrial food/wood abstraction leaks into the
habitat model; closed-loop balances can be audited from the HUD and chronicle.

### M15 — Long-horizon macrohistory engine

**Hypothesis:** Deep time is credible when it composes validated short-scale
patterns into regime transitions, not when it scales daily arithmetic.

Build a multi-rate projection model. It detects stable regimes, estimates their
transition hazards from ecology/institutions/networks, samples only important
branch events, and periodically rehydrates a detailed regional simulation.

**Observable outcome:** A one-million-year view presents eras, bottlenecks,
speciations of culture, and confidence bands rather than a falsely precise daily
timeline.

**Acceptance criteria:** Projected 100-year distributions agree with ensembles
of detailed 100-year runs; the UI marks exact simulation versus converged
projection.

### M16 — Evolutionary search for interesting worlds

**Hypothesis:** Interesting scenarios can be discovered automatically without
hardcoding drama.

Use novelty search or quality-diversity optimization over seeds, climate
parameters, initial institutions, and resource layouts. Define behavioral
descriptors such as number of lineages, trade-network topology, ecological
recovery, conflict frequency, inequality, and survival time.

**Observable outcome:** A “find strange histories” mode returns reproducible
seeds: the river federation, the cyclical ruin coast, the isolated orbital
commons, and so on.

**Acceptance criteria:** The search yields more diverse chronicle descriptors
than random sampling under the same compute budget; every selected world retains
a plain-language causal summary.

### M17 — Calibration, sensitivity, and falsification suite

**Hypothesis:** Complexity is useful only if the model remains debuggable and
its outcomes are robust to reasonable parameter changes.

Add property tests, conservation checks, parameter sweeps, metamorphic tests,
counterfactual replay, and sensitivity reports. Explicitly identify parameters
with high leverage and model behaviors that are artifacts of implementation.

**Observable outcome:** A researcher can ask whether a collapse followed a
drought, a trade failure, a specific institutional rule, or chance variation.

**Acceptance criteria:** Core invariants run in CI; major model changes include
before/after ensemble reports and no unexplained divergence for fixed manifests.

### M18 — Observer tools for explanation, not control

**Hypothesis:** Rich simulation can remain approachable if lenses reveal causes
without turning the project into a keyboard-controlled game.

Add temporal map scrubbing, causal inspection, counterfactual “what changed?”
comparison, dependency graphs, lineage trees, price/ecology overlays, and a
chronicle camera that follows historically important events. Written directives
remain possible high-level influences, never direct building commands.

**Observable outcome:** An observer can understand a continent-scale collapse
through map layers and a short causal chain in under a minute.

**Acceptance criteria:** Every lens is read-only; UI testing confirms no manual
construction, unit movement, or hidden keyboard gameplay is introduced.

## Recommended Research Sequence

Start with M1–M4 to make experiments reproducible and environmental feedback
more spatially meaningful. Then build M5–M11, which form the social, cultural,
political, and economic engine. M12–M14 broaden the types of history the system
can generate. M15–M18 make long horizons, discovery, validation, and observer
understanding credible.

Each milestone should ship behind a scenario flag, with a benchmark manifest and
a compact before/after chronicle. Do not add a milestone merely because it has a
striking visual; add it when it creates a new feedback loop, constraint, or
historical pathway that can be observed and tested.

## Example Evaluation Scenarios

1. **The shared river:** Two agrarian societies upstream and downstream compete
   for water, then discover cooperative allocation or collapse into conflict.
2. **The broken sea:** Fragmented islands develop unrelated navigation cultures;
   a rare trade corridor creates a creole maritime federation.
3. **The metropolitan frontier:** A rich city spreads rapidly, degrades its
   hinterland, and must reform land institutions to avoid depopulation.
4. **The ancestral ruin:** A collapsed settlement renews repeatedly; measure how
   material ruins and inherited memory affect later resilience.
5. **The sealed voyage:** A spacecraft culture balances life-support loops,
   governance, and long communication delays while approaching a new world.

## Success Definition

The proposal succeeds when a single seed can plausibly create multiple
explainable futures, a batch of seeds produces histories that differ in structure
as well as decoration, and an observer can trace any major outcome to a chain of
ecological, social, cultural, and network conditions.
