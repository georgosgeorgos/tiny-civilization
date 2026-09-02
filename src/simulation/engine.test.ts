import assert from "node:assert/strict";
import { configFromSearch } from "../config.ts";
import { directivesFromText, speedFromText, yearsFromText } from "../directive.ts";
import { SimulationEngine } from "./engine.ts";
import { SimulationClient } from "./client.ts";
import { exchangeRegions } from "./network.ts";
import { forkCulture, shouldSocietyCollapse, shouldSocietyFragment } from "./lineage.ts";
import { runExperiment } from "./experiment.ts";
import { createWorldManifest } from "./manifest.ts";
import { classifyChronicleEvent, EventChronicle } from "./chronicle.ts";
import { HouseholdSystem, inheritBehavioralStrategy, initialBehavioralStrategy } from "./households.ts";
import { evolveInstitutions, institutionEffects } from "./institutions.ts";
import { evolveInnovations, innovationEffects } from "./innovation.ts";
import { settleShipment } from "./market.ts";
import { resolveConflict } from "./conflict.ts";
import { advanceDiplomaticChannel, channelSupportsContact, channelSupportsTrade, createDiplomaticChannel, dispatchMessage } from "./diplomacy.ts";
import { advanceRegionalRelation, createRegionalRelation, regionalRelationMode } from "./interregional.ts";
import { makeBuilding } from "../models.ts";
import type { SimulationInputs } from "./types.ts";

const buildings = { hut: 3, farm: 2, mine: 0, fishery: 1, lumber: 1, shrine: 0, market: 1, orchard: 0, forge: 0 };
const input: SimulationInputs = {
  deltaDays: 1,
  population: 5,
  housing: 6,
  annualProduction: { food: 18, wood: 8, gold: 6 },
  buildings,
  moodPressure: 0.2,
  infrastructure: { roads: 0, ports: 0, tradeRoutes: 0 },
  disruption: "none",
};

assert.equal(configFromSearch("").speed, 4, "a page opened without URL settings should start time at the default pace");
assert.equal(configFromSearch("?origin=city").origin, "city", "origin scenarios should remain serializable in the world URL");
assert.equal(configFromSearch("?origin=spacecraft").origin, "spacecraft", "the orbital habitat scenario should remain serializable in the world URL");
assert.equal(configFromSearch("?archetype=shattered").archetype, "shattered", "world archetypes should remain serializable in the world URL");
assert.ok(makeBuilding("hut", "camp").children.length >= 4, "frontier camps should render as clustered temporary shelter rather than a generic house");
assert.ok(makeBuilding("farm", "agrarian").children.length > makeBuilding("farm", "rustic").children.length, "farming origins should visibly retain extra harvest infrastructure");

const manifest = createWorldManifest(configFromSearch("?seed=91&archetype=continental&origin=farmers"), ["secure food"]);
const experimentPlan = {
  manifest,
  stores: { food: 22, wood: 12, gold: 8 },
  years: 20,
  checkpointEvery: 5,
  inputs: { ...input, population: 7, housing: 10, annualProduction: { food: 22, wood: 8, gold: 5 } },
};
const replayA = runExperiment(experimentPlan);
const replayB = runExperiment(experimentPlan);
assert.equal(manifest.id, "world-91-continental-farmers-balanced", "a manifest should have a stable scenario identity");
assert.deepEqual(replayA, replayB, "a manifest and plan must produce deterministic experiment checkpoints");
assert.equal(replayA.checkpoints.length, 5, "the experiment runner should retain initial and scheduled checkpoints");
assert.deepEqual(replayA.definition.stores, experimentPlan.stores, "an exported experiment should retain all inputs needed for replay");
assert.equal(replayA.definition.inputs.origin, "farmers", "a research replay should preserve its manifest origin in the actual evolutionary inputs");

const chronicle = new EventChronicle();
chronicle.record(12, classifyChronicleEvent("A trade pact opens a sea route."), "A trade pact opens a sea route.", ["player", "coast"], { population: 8, food: 20, gold: 12, knowledge: 9, towns: 2 });
chronicle.checkpoint(2, replayA.checkpoints[0]?.snapshot as import("./types.ts").SimulationSnapshot);
assert.equal(chronicle.getEvents()[0]?.kind, "trade", "chronicle events should preserve a typed causal category");
assert.equal(chronicle.getCheckpoints()[0]?.year, 2, "chronicle checkpoints should be queryable for a selected year");

const households = new HouseholdSystem();
const householdMetrics = households.advance([
  { id: "a", regionId: "player", homeKey: "0,0", age: 24, role: "farmer", seed: 0.2, strategy: initialBehavioralStrategy(0.2) },
  { id: "b", regionId: "player", homeKey: "0,0", age: 8, role: "villager", seed: 0.4, strategy: initialBehavioralStrategy(0.4) },
], [{ id: "player", food: 1, housing: 1, mood: 25 }], 1).get("player");
assert.ok((householdMetrics?.migrationPressure ?? 0) > 0.2, "hardship should create household-level migration pressure");
assert.equal(householdMetrics?.dependents, 1, "households should retain demographic dependents alongside workers");
const inheritedStrategy = inheritBehavioralStrategy({ mobility: 0.8, reserve: 0.3, tradeOpenness: 0.65 }, 0.42);
assert.ok(Math.abs(inheritedStrategy.mobility - 0.8) <= 0.07 && Math.abs(inheritedStrategy.reserve - 0.3) <= 0.07, "children should inherit behavioral tendencies with bounded variation");
const adaptation = new HouseholdSystem();
const adaptiveResidents = [
  { id: "dry-low", regionId: "dry", homeKey: "a", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.1, reserve: 0.5, tradeOpenness: 0.5 } },
  { id: "dry-high", regionId: "dry", homeKey: "b", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.9, reserve: 0.5, tradeOpenness: 0.5 } },
  { id: "lush-low", regionId: "lush", homeKey: "a", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.1, reserve: 0.5, tradeOpenness: 0.5 } },
  { id: "lush-high", regionId: "lush", homeKey: "b", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.9, reserve: 0.5, tradeOpenness: 0.5 } },
];
let adaptiveMetrics: ReadonlyMap<string, import("./households.ts").HouseholdMetrics> | undefined;
for (let year = 0; year < 40; year += 1) {
  adaptiveMetrics = adaptation.advance(adaptiveResidents, [
    { id: "dry", food: 1, housing: 3, mood: 35, environmentalStress: 0.95 },
    { id: "lush", food: 18, housing: 3, mood: 72, environmentalStress: 0.05 },
  ], 1);
}
assert.ok((adaptiveMetrics?.get("dry")?.strategy.mobility ?? 0) > (adaptiveMetrics?.get("lush")?.strategy.mobility ?? 1), "local hardship should select a more mobile household strategy than a secure region");
const hardshipSelection = new HouseholdSystem();
hardshipSelection.advance([
  { id: "exposed", regionId: "shore", homeKey: "a", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.5, reserve: 0.05, tradeOpenness: 0.5 } },
  { id: "buffered", regionId: "shore", homeKey: "b", age: 28, role: "farmer", seed: 0, strategy: { mobility: 0.5, reserve: 0.95, tradeOpenness: 0.5 } },
], [{ id: "shore", food: 0.5, housing: 3, mood: 25, environmentalStress: 0.9 }], 4);
assert.ok(hardshipSelection.hardshipFor("exposed") > hardshipSelection.hardshipFor("buffered"), "migration selection should follow household hardship rather than a mobility trait");

const institutions = evolveInstitutions({ forms: [], legitimacy: 0.4, commonReserve: 0, inequality: 0.1 }, {
  inputs: { ...input, population: 9, buildings: { ...buildings, farm: 3, orchard: 1, shrine: 1, market: 1, mine: 1, forge: 1 }, disruption: "storm" },
  culture: { ...(replayA.checkpoints[0]?.snapshot.culture as import("./types.ts").CulturalState), traits: { cooperation: 0.76, curiosity: 0.74, stewardship: 0.7, resilience: 0.72, mobility: 0.4 } },
  stores: { food: 42, wood: 12, gold: 20 }, health: 0.8, stability: 0.78,
}, 3);
assert.ok(institutions.forms.length >= 4, "different material and cultural conditions should support multiple institutional paths");
assert.ok(institutionEffects(institutions).knowledgeMultiplier > 1, "archives and guilds should alter knowledge production through explicit rules");

const innovations = evolveInnovations({ techniques: [], provenance: {} }, {
  inputs: { ...input, buildings: { ...buildings, farm: 3, orchard: 1, market: 1, mine: 1, forge: 1 }, infrastructure: { roads: 2, ports: 1, tradeRoutes: 1 } },
  ecology: { soil: 0.55, forest: 0.7, fish: 0.8, water: 0.52, minerals: 0.7, disease: 0.08 },
  culture: { ...(replayA.checkpoints[0]?.snapshot.culture as import("./types.ts").CulturalState), traits: { cooperation: 0.6, curiosity: 0.72, stewardship: 0.7, resilience: 0.6, mobility: 0.7 } },
  knowledge: 80,
});
assert.ok(innovations.techniques.includes("waterworks") && innovations.techniques.includes("sailcraft"), "distinct agrarian and maritime pathways should discover techniques");
assert.ok(innovationEffects(innovations).food > 1 && innovationEffects(innovations).trade > 1, "discoveries should change productive capabilities");

const shipment = settleShipment({ stores: { food: 40, wood: 4, gold: 3 }, population: 5 }, { stores: { food: 1, wood: 8, gold: 50 }, population: 8 }, 4, 0);
assert.equal(shipment.shipment?.good, "food", "markets should send a surplus good toward documented scarcity");
assert.ok((shipment.destination.food ?? 0) > 1 && (shipment.source.gold ?? 0) > 3, "shipments should conserve goods while settling a price and credit transfer");
assert.equal(resolveConflict({ relation: -45, scarcity: 0.9, grievance: 0.9, defense: 0.05, diplomacy: 0.05 }).outcome, "raid", "unresolved scarcity and grievance should allow costly conflict");
assert.equal(resolveConflict({ relation: 22, scarcity: 0.1, grievance: 0.1, defense: 0.2, diplomacy: 0.8 }).outcome, "reconciliation", "diplomacy should offer a nonviolent recovery path");

const envoy = dispatchMessage(createDiplomaticChannel(), "trade-proposal", 10, { distance: 7, infrastructure: 0.75, languageAffinity: 0.9 });
assert.equal(advanceDiplomaticChannel(envoy, 10, { infrastructure: 0.75, languageAffinity: 0.9, scarcity: 0.1 }).arrivals.length, 0, "diplomatic effects should wait for message travel");
const envoyArrival = advanceDiplomaticChannel(envoy, 12, { infrastructure: 0.75, languageAffinity: 0.9, scarcity: 0.1 });
assert.ok(channelSupportsContact(envoyArrival.channel), "an arrived envoy should establish a real information channel before any shipment");
const pactOffer = dispatchMessage(envoyArrival.channel, "trade-proposal", 12, { distance: 7, infrastructure: 0.75, languageAffinity: 0.9 });
const pactArrival = advanceDiplomaticChannel(pactOffer, 14, { infrastructure: 0.75, languageAffinity: 0.9, scarcity: 0.1 });
assert.ok(channelSupportsTrade(pactArrival.channel), "well-supported, legible diplomacy should mature from parley into a trade pact");

const regionalContext = { distance: 12, languageAffinity: 0.9, infrastructure: 0.9, scarcityA: 0.12, scarcityB: 0.2, borderFriction: 0.05 };
const regionalOrigin = createRegionalRelation(1, regionalContext);
const regionalParley = advanceRegionalRelation(regionalOrigin, 4, regionalContext);
const regionalTrade = advanceRegionalRelation(regionalParley, 16, regionalContext);
assert.equal(regionalRelationMode(regionalParley), "parley", "nearby autonomous societies should establish direct contact without routing through the player");
assert.equal(regionalRelationMode(regionalTrade), "trade", "reliable autonomous contact should mature into its own trade relation");

const noRoute = exchangeRegions([
  { id: "a", q: 0, r: 0, population: 5, capacity: 8, food: 30, wood: 4, gold: 3, knowledge: 18, stability: 0.7, migrationPressure: 0.1, markets: 2, ports: 1, institutions: 2 },
  { id: "b", q: 2, r: 0, population: 7, capacity: 12, food: 2, wood: 4, gold: 3, knowledge: 1, stability: 0.4, migrationPressure: 0.8, markets: 2, ports: 1, institutions: 2 },
], 1, () => "none");
assert.equal(noRoute.get("a")?.knowledge, 0, "isolated regions must not receive invisible network effects");

const relay = exchangeRegions([
  { id: "source", q: 0, r: 0, population: 10, capacity: 14, food: 50, wood: 4, gold: 3, knowledge: 100, stability: 0.7, migrationPressure: 0.1, markets: 3, ports: 1, institutions: 2 },
  { id: "crossroads", q: 4, r: 0, population: 7, capacity: 14, food: 2, wood: 4, gold: 3, knowledge: 4, stability: 0.7, migrationPressure: 0.1, markets: 3, ports: 1, institutions: 2 },
  { id: "frontier", q: 8, r: 0, population: 7, capacity: 12, food: 1, wood: 4, gold: 3, knowledge: 1, stability: 0.7, migrationPressure: 0.1, markets: 3, ports: 1, institutions: 2 },
], 1, (from, to) => {
  const pair = [from.id, to.id].sort().join(":");
  return pair === "frontier:source" ? "none" : "trade";
});
assert.ok((relay.get("frontier")?.food ?? 0) > 0, "a connected crossroads should relay a decayed share of received food beyond its direct source");

const exchangePair = [
  { id: "open-source", q: 0, r: 0, population: 8, capacity: 12, food: 50, wood: 4, gold: 3, knowledge: 20, stability: 0.7, migrationPressure: 0.1, markets: 2, ports: 1, institutions: 2, openness: 1 },
  { id: "open-destination", q: 4, r: 0, population: 8, capacity: 12, food: 1, wood: 4, gold: 3, knowledge: 2, stability: 0.7, migrationPressure: 0.1, markets: 2, ports: 1, institutions: 2, openness: 1 },
] as const;
const openExchange = exchangeRegions(exchangePair, 1);
const guardedExchange = exchangeRegions(exchangePair.map((region) => ({ ...region, openness: 0 })), 1);
assert.ok((openExchange.get("open-destination")?.food ?? 0) > (guardedExchange.get("open-destination")?.food ?? 0), "household trade openness should alter the material strength of an otherwise identical route");
const mountainExchange = exchangeRegions(exchangePair.map((region) => ({ ...region, terrainCost: 2.5 })), 1);
assert.ok((mountainExchange.get("open-destination")?.food ?? 0) < (openExchange.get("open-destination")?.food ?? 0), "rough terrain should reduce exchange despite equal straight-line distance");

const first = new SimulationEngine(42, { food: 12, wood: 8, gold: 10 });
const second = new SimulationEngine(42, { food: 12, wood: 8, gold: 10 });
for (let day = 0; day < 48; day += 1) {
  first.advance(input);
  second.advance(input);
}
assert.deepEqual(first.snapshot, second.snapshot, "identical seeds and inputs must replay exactly");
assert.ok(first.snapshot.knowledge > 0, "institutions and population should generate knowledge");

const scarcity = new SimulationEngine(9, { food: 0, wood: 2, gold: 2 });
for (let day = 0; day < 12; day += 1) {
  scarcity.advance({ ...input, annualProduction: { food: 0, wood: 0, gold: 0 }, disruption: "drought" });
}
assert.ok(scarcity.snapshot.health < 0.55, "food scarcity and drought should reduce health");
assert.ok(scarcity.snapshot.mortalityRisk > 0.5, "sustained scarcity should create demographic risk");

const extraction = new SimulationEngine(12, { food: 10, wood: 10, gold: 10 });
for (let day = 0; day < 24; day += 1) {
  extraction.advance({ ...input, buildings: { ...buildings, lumber: 8, farm: 8, fishery: 8, mine: 8 } });
}
assert.ok(extraction.snapshot.ecology.forest < 0.5, "intensive extraction should deplete forests");
assert.ok(extraction.snapshot.ecology.minerals < 0.7, "intensive extraction should leave a persistent mineral footprint");
assert.ok(extraction.snapshot.climate.rainfall >= 0 && extraction.snapshot.climate.rainfall <= 1, "the climate forcing should remain bounded over long runs");
assert.ok(extraction.snapshot.settlementFootprint > 0, "cellular settlement pressure should leave a persistent local footprint");
assert.ok(extraction.snapshot.culture.generation >= 1, "societies should carry a cultural lineage across generations");
assert.ok(Object.values(extraction.snapshot.culture.traits).every((value) => value >= 0 && value <= 1), "cultural traits should stay bounded under selection and mutation");
assert.notEqual(extraction.snapshot.culture.language.dialect, "", "cultures should retain a named evolving dialect");
assert.ok(extraction.snapshot.culture.practices.every(p => typeof p === "object" && p.effects && p.name), "practices should be GenerativePractice objects with effects and names");

const isolated = new SimulationEngine(4, { food: 40, wood: 10, gold: 10 });
const connected = new SimulationEngine(4, { food: 40, wood: 10, gold: 10 });
for (let day = 0; day < 24; day += 1) {
  isolated.advance({ ...input, annualProduction: { food: 0, wood: 0, gold: 0 } });
  connected.advance({ ...input, annualProduction: { food: 0, wood: 0, gold: 0 }, infrastructure: { roads: 6, ports: 1, tradeRoutes: 1 } });
}
assert.ok(connected.snapshot.stores.food > isolated.snapshot.stores.food, "roads and ports should reduce food spoilage");

assert.deepEqual(
  directivesFromText("Secure food, then develop coastal trade and expand to new islands."),
  ["food", "wealth", "frontier"],
  "natural-language instructions should retain their stated priority order",
);
assert.equal(speedFromText("Set speed to 2x, then focus on food."), 2, "written pace changes should parse alongside council priorities");
assert.equal(speedFromText("pause time"), 0, "written observer controls should support pausing");
assert.equal(speedFromText("years of speed"), 96, "years pace should make long-term simulation observable");
assert.equal(yearsFromText("show 1 million years"), 1_000_000, "deep-time requests should parse a million-year horizon");

const deepTime = new SimulationEngine(21, { food: 30, wood: 12, gold: 6 });
deepTime.advanceYears({ ...input, annualProduction: { food: 24, wood: 7, gold: 5 } }, 1_000_000);
assert.equal(deepTime.snapshot.elapsedDays, 12_000_000, "deep-time projection should advance calendar time without replaying every day");
assert.ok(deepTime.snapshot.knowledge > 100_000, "deep-time projection should accumulate long-horizon knowledge");

const crowdedExtraction = new SimulationEngine(71, { food: 30, wood: 20, gold: 20 });
crowdedExtraction.advanceYears({
  ...input,
  population: 18,
  housing: 18,
  annualProduction: { food: 70, wood: 60, gold: 48 },
  buildings: { hut: 8, farm: 6, mine: 4, fishery: 2, lumber: 5, shrine: 0, market: 1, orchard: 2, forge: 1 },
  infrastructure: { roads: 1, ports: 0, tradeRoutes: 0 },
}, 80);
assert.ok(crowdedExtraction.snapshot.stores.wood <= 291 && crowdedExtraction.snapshot.stores.gold <= 216, "long-horizon stores should remain constrained by physical storage capacity");
assert.ok(crowdedExtraction.snapshot.ecology.forest < 0.5 && crowdedExtraction.snapshot.populationTrend < 0, "dense ecological degradation should constrain carrying capacity and produce demographic decline rather than perpetual growth");

const evolved = new SimulationEngine(33, { food: 80, wood: 60, gold: 80 }, 180);
evolved.advanceYears({
  ...input,
  population: 16,
  housing: 24,
  buildings: { hut: 12, farm: 3, mine: 1, fishery: 2, lumber: 1, shrine: 1, market: 1, orchard: 1, forge: 1 },
  infrastructure: { roads: 6, ports: 1, tradeRoutes: 1 },
}, 20);
assert.ok(evolved.snapshot.era !== "Camp", "institutions, ecology and connectivity should produce a non-Camp era");
assert.ok(evolved.snapshot.capabilities.institutional > 0.3, "civic works should raise institutional capability");

const farmingOrigin = new SimulationEngine(51, { food: 48, wood: 24, gold: 18 }, 18);
farmingOrigin.advanceYears({
  ...input,
  origin: "farmers",
  population: 6,
  housing: 10,
  buildings: { hut: 4, farm: 3, mine: 0, fishery: 1, lumber: 1, shrine: 0, market: 0, orchard: 1, forge: 0 },
  annualProduction: { food: 32, wood: 6, gold: 2 },
}, 1);
assert.equal(farmingOrigin.snapshot.era, "Agrarian", "farming origins should stabilize an explicitly agrarian evolutionary path early");

const civicOrigin = new SimulationEngine(52, { food: 70, wood: 48, gold: 100 }, 110);
civicOrigin.advanceYears({
  ...input,
  origin: "city",
  population: 12,
  housing: 18,
  buildings: { hut: 7, farm: 2, mine: 1, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 1, forge: 1 },
  annualProduction: { food: 30, wood: 9, gold: 18 },
}, 1);
assert.ok(civicOrigin.snapshot.capabilities.institutional > 0.35, "city origins should have strong institutional capability");
assert.ok(civicOrigin.snapshot.era !== "Camp", "city origins should not remain Camp");

const orbitalOrigin = new SimulationEngine(53, { food: 100, wood: 90, gold: 180 }, 220);
orbitalOrigin.advanceYears({
  ...input,
  origin: "spacecraft",
  population: 8,
  housing: 14,
  buildings: { hut: 6, farm: 2, mine: 1, fishery: 1, lumber: 0, shrine: 1, market: 1, orchard: 1, forge: 1 },
  annualProduction: { food: 26, wood: 12, gold: 22 },
}, 1);
assert.equal(orbitalOrigin.snapshot.era, "Orbital", "spacecraft origins should follow a distinct closed-habitat evolutionary branch");

const farmingCrisis = new SimulationEngine(54, { food: 30, wood: 20, gold: 12 }, 18);
farmingCrisis.advanceYears({
  ...input,
  origin: "farmers",
  population: 7,
  housing: 10,
  buildings: { hut: 4, farm: 3, mine: 0, fishery: 0, lumber: 1, shrine: 0, market: 0, orchard: 1, forge: 0 },
  annualProduction: { food: 18, wood: 4, gold: 2 },
  disruption: "drought",
}, 40);
assert.equal(farmingCrisis.snapshot.originCrisis?.origin, "farmers", "a long-running origin should record its first structural crisis in the simulation state");
assert.ok(["soil covenant", "new fields"].includes(farmingCrisis.snapshot.originCrisis?.outcome ?? ""), "the farming crisis should resolve through an origin-specific durable fork");

const network = exchangeRegions([
  { id: "food-rich", q: 0, r: 0, population: 8, capacity: 12, food: 70, wood: 20, gold: 20, knowledge: 120, stability: 0.8, migrationPressure: 0.1, markets: 1, ports: 1, institutions: 2, culture: { cooperation: 0.8, curiosity: 0.9, mobility: 0.3, stewardship: 0.7, resilience: 0.6 }, language: extraction.snapshot.culture.language },
  { id: "hungry-neighbor", q: 12, r: 0, population: 40, capacity: 60, food: 1, wood: 8, gold: 8, knowledge: 4, stability: 0.48, migrationPressure: 0.8, markets: 1, ports: 1, institutions: 1, culture: { cooperation: 0.3, curiosity: 0.2, mobility: 0.8, stewardship: 0.2, resilience: 0.5 }, language: { ...extraction.snapshot.culture.language, family: "distant", dialect: "distant-ka", boundary: 0.8 } },
], 0.25);
assert.ok((network.get("hungry-neighbor")?.food ?? 0) > 0, "connected regions should transfer food toward shortages");
assert.ok((network.get("hungry-neighbor")?.knowledge ?? 0) > 0, "connected regions should diffuse knowledge");
assert.ok((network.get("hungry-neighbor")?.migrants ?? 0) < 0, "regional pressure should produce emigration toward capacity elsewhere");
assert.ok((network.get("hungry-neighbor")?.culture.curiosity ?? 0) > 0, "connected regions should exchange cultural tendencies as well as material goods");

const lineage = first.snapshot.culture;
const branch = forkCulture(lineage, 901, "diaspora");
assert.deepEqual(branch, forkCulture(lineage, 901, "diaspora"), "cultural branches must replay deterministically");
assert.notEqual(branch.lineage, lineage.lineage, "an offshoot should carry a distinct but related lineage");
assert.ok(shouldSocietyFragment({ population: 8, capacity: 8, food: 22, mood: 64, migrationPressure: 0.2, culture: { ...lineage, traits: { ...lineage.traits, cooperation: 0.8, mobility: 0.8 } } }), "crowded and secure mobile societies should create offshoot pressure");
assert.ok(shouldSocietyCollapse({ population: 1, capacity: 5, food: 0.1, mood: 20, migrationPressure: 0.9, culture: lineage }), "exhausted settlements should be able to collapse into renewal opportunities");

const noveltyA = new SimulationEngine(100, { food: 40, wood: 20, gold: 20 });
const noveltyB = new SimulationEngine(200, { food: 40, wood: 20, gold: 20 });
const richInputs = { ...input, population: 10, housing: 14, buildings: { ...buildings, farm: 3, shrine: 1, market: 1 }, infrastructure: { roads: 2, ports: 1, tradeRoutes: 1 } };
for (let year = 0; year < 200; year++) noveltyA.advanceYears({ ...richInputs, deltaDays: 12 }, 1);
for (let year = 0; year < 200; year++) noveltyB.advanceYears({ ...richInputs, deltaDays: 12 }, 1);
assert.ok(noveltyA.snapshot.culture.practices.length > 0, "societies should discover generative practices over time");
assert.ok(noveltyB.snapshot.culture.practices.length > 0, "different seeds should also discover practices");
if (noveltyA.snapshot.culture.practices.length > 0 && noveltyB.snapshot.culture.practices.length > 0) {
  const aIds = new Set(noveltyA.snapshot.culture.practices.map(p => p.id));
  const bIds = new Set(noveltyB.snapshot.culture.practices.map(p => p.id));
  const overlap = [...aIds].filter(id => bIds.has(id)).length;
  assert.equal(overlap, 0, "different seeds should produce novel practices with distinct IDs — the innovation space is open");
}

const regions = new SimulationClient(17, { food: 1, wood: 1, gold: 1 }, 0);
const regionalSnapshots = regions.advanceRegions([
  {
    id: "distant-isle",
    stores: { food: 18, wood: 6, gold: 4 },
    knowledge: 0,
    inputs: { ...input, deltaDays: 2, fidelity: "remote" },
  },
]);
const distant = regionalSnapshots.get("distant-isle");
assert.ok(distant && distant.elapsedDays >= 2, "independent remote settlements should advance through the shared simulation client");
assert.ok(distant && distant.stores.food > 18, "remote settlements should retain their own production and stores");

console.log("simulation tests passed");
