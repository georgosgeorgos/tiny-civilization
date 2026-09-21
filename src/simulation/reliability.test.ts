import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { DEFAULT_CONFIG, configFromPrompt, configFromSearch } from "../config.ts";
import { SimulationEngine } from "./engine.ts";
import { SimulationClient } from "./client.ts";
import { ClimateSystem } from "./climate.ts";
import { EventChronicle } from "./chronicle.ts";
import { runExperiment, branchExperiment } from "./experiment.ts";
import { createWorldManifest } from "./manifest.ts";
import type { SimulationInputs } from "./types.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";

const stores = { food: 40, wood: 20, gold: 20 };
const inputs: SimulationInputs = {
  deltaDays: 1, population: 10, housing: 14,
  annualProduction: { food: 32, wood: 8, gold: 8 },
  buildings: { hut: 4, farm: 3, mine: 0, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 0, forge: 0 },
  moodPressure: 0.2,
  infrastructure: { roads: 2, ports: 1, tradeRoutes: 1 }, disruption: "none",
};

test("long experiments replay independently of other experiments", () => {
  const plan = { manifest: createWorldManifest({ ...DEFAULT_CONFIG, seed: 100 }), stores, inputs, years: 200, checkpointEvery: 10 };
  const first = runExperiment(plan);
  assert.ok(first.checkpoints.some((cp) => cp.snapshot.culture.practices.length > 0));
  runExperiment({ ...plan, manifest: createWorldManifest({ ...DEFAULT_CONFIG, seed: 200 }) });
  assert.deepEqual(runExperiment(plan), first);
});

test("JSON checkpoints continue exactly, including fractional days and ecological memory", () => {
  const original = new SimulationEngine(42, stores);
  original.advance({ ...inputs, deltaDays: 35.31 });
  const saved = JSON.parse(JSON.stringify(original.checkpoint));
  const restored = new SimulationEngine(42, stores);
  restored.loadCheckpoint(saved);
  for (let i = 0; i < 24; i++) {
    original.advance(inputs);
    restored.advance(inputs);
  }
  assert.deepEqual(restored.checkpoint, original.checkpoint);
  original.advanceYears(inputs, 20);
  restored.advanceYears(inputs, 20);
  assert.deepEqual(restored.checkpoint, original.checkpoint);
});

test("an unchanged experiment branch reproduces the original future", () => {
  const original = new SimulationEngine(100, stores);
  original.advanceYears(inputs, 40);
  const checkpoint = { year: 40, snapshot: original.checkpoint };
  original.advanceYears(inputs, 10);
  const branch = branchExperiment({ checkpoint, seed: 100, inputs, years: 10 });
  assert.deepEqual(branch.at(-1)?.snapshot, original.checkpoint);
});

test("macro projections advance climate in days and honor culture ablation", () => {
  const original = new SimulationEngine(91, stores);
  original.advanceYears(inputs, 20);
  assert.deepEqual(original.snapshot.climate, new ClimateSystem(91).advance(240));
  const checkpoint = original.checkpoint;
  checkpoint.culture.practices = [{ id: "soil-custom", name: "Soil custom", parentId: null, discoveredDay: 0,
    effects: { soil: 0.05, forest: 0.05, water: 0.05, food: 0.05, knowledge: 0, stability: 0 } }];
  const coupled = new SimulationEngine(91, stores);
  const uncoupled = new SimulationEngine(91, stores);
  coupled.loadCheckpoint(checkpoint);
  uncoupled.loadCheckpoint(checkpoint);
  coupled.advanceYears(inputs, 1);
  uncoupled.advanceYears({ ...inputs, cultureToEcology: false }, 1);
  assert.notDeepEqual(coupled.snapshot.ecology, uncoupled.snapshot.ecology);
});

test("chronicle retention keeps unique IDs and refreshes the current-year checkpoint", () => {
  const chronicle = new EventChronicle();
  for (let day = 0; day < 2500; day++) chronicle.record(day, "observation", `Day ${day}`, ["player"], { population: 5, food: 10, gold: 2, knowledge: 0, towns: 1 });
  const events = chronicle.getEvents();
  assert.equal(events.length, 2400);
  assert.equal(new Set(events.map((event) => event.id)).size, 2400);
  assert.equal(events.at(-1)?.id, 2500);
  const engine = new SimulationEngine(1, stores);
  chronicle.checkpoint(1, engine.checkpoint);
  engine.advance(inputs);
  chronicle.checkpoint(1, engine.checkpoint);
  assert.equal(chronicle.getCheckpoints().length, 1);
  assert.equal(chronicle.getCheckpoints()[0].snapshot.elapsedDays, 1);
});

test("setup prompts recognize all origins and geography without substring technology matches", () => {
  assert.equal(configFromPrompt("a spacecraft", DEFAULT_CONFIG).technology, "primitive");
  assert.equal(configFromPrompt("an archipelago", DEFAULT_CONFIG).archetype, "archipelago");
  assert.equal(configFromPrompt("a camp", { ...DEFAULT_CONFIG, origin: "city" }).origin, "camp");
  assert.equal(configFromSearch("?speed=").speed, DEFAULT_CONFIG.speed);
  assert.equal(configFromSearch("?seed=-1").seed, 4294967295);
});

test("invalid simulation horizons fail promptly", () => {
  const engine = new SimulationEngine(1, stores);
  assert.throws(() => engine.advance({ ...inputs, deltaDays: Infinity }), RangeError);
  assert.throws(() => engine.advanceYears(inputs, NaN), RangeError);
  assert.throws(() => runExperiment({ manifest: createWorldManifest(DEFAULT_CONFIG), stores, inputs, years: Infinity }), RangeError);
});

function mockWorker(t: TestContext, implementation: unknown): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: implementation });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  });
}

class TestWorker {
  static latest: TestWorker;
  onmessage?: (event: { data: SimulationResponse }) => void;
  onerror?: (event: { preventDefault(): void }) => void;
  onmessageerror?: () => void;
  requests: SimulationRequest[] = [];
  terminated = false;
  engine!: SimulationEngine;
  constructor() { TestWorker.latest = this; }
  postMessage(request: SimulationRequest) { this.requests.push(structuredClone(request)); }
  terminate() { this.terminated = true; }
  deliver() {
    const request = this.requests.shift()!;
    if (request.type === "init") this.engine = new SimulationEngine(request.seed, request.stores, request.knowledge);
    if (request.type === "advance" || request.type === "advance-years") {
      this.engine.setStores(request.stores);
      if (request.type === "advance") this.engine.advance(request.inputs);
      else this.engine.advanceYears(request.inputs, request.years);
    }
    if (request.type === "advance-regions") {
      this.onmessage?.({ data: { type: "region-snapshots", snapshots: request.regions.map((region) => ({ id: region.id, snapshot: this.engine.checkpoint })) } });
    } else this.onmessage?.({ data: { type: "snapshot", snapshot: this.engine.checkpoint } });
  }
}

test("worker results can be delivered while paused, and a crash replays only outstanding work", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  client.advance(inputs);
  worker.deliver();
  const acknowledged = client.drain()!;
  assert.equal(acknowledged.elapsedDays, 1);
  client.setStores(acknowledged.stores);
  assert.equal(client.advanceYears(inputs, 100), null);
  worker.deliver();
  const projected = client.drain()!;
  assert.equal(projected.elapsedDays, 1201);
  assert.equal(client.drain(), null);
  client.setStores(projected.stores);
  client.advance(inputs);
  const expected = new SimulationEngine(42, stores);
  expected.loadCheckpoint(projected);
  expected.advance(inputs);
  worker.onerror?.({ preventDefault() {} });
  assert.equal(worker.terminated, true);
  assert.deepEqual(client.drain(), expected.checkpoint);
});

test("regional response batches merge and retired regions cannot reappear", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  for (const id of ["a", "b", "retired"]) client.advanceRegions([{ id, stores, knowledge: 0, inputs }]);
  client.retireRegion("retired");
  worker.deliver(); worker.deliver(); worker.deliver();
  assert.deepEqual([...client.advanceRegions([]).keys()], ["a", "b"]);
});

test("worker construction failure starts a functional synchronous simulation", (t) => {
  mockWorker(t, class { constructor() { throw new Error("blocked"); } });
  const client = new SimulationClient(42, stores, 0);
  assert.equal(client.advance(inputs)?.elapsedDays, 1);
});
