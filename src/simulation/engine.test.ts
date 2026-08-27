import assert from "node:assert/strict";
import { directivesFromText } from "../directive.ts";
import { SimulationEngine } from "./engine.ts";
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
  extraction.advance({ ...input, buildings: { ...buildings, lumber: 8, farm: 8, fishery: 8 } });
}
assert.ok(extraction.snapshot.ecology.forest < 0.5, "intensive extraction should deplete forests");

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

console.log("simulation tests passed");
