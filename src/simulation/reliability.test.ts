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
import { addStores } from "./stores.ts";

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

test("experiment outcomes do not depend on checkpoint cadence", () => {
  const plan = { manifest: createWorldManifest({ ...DEFAULT_CONFIG, seed: 143 }), stores, inputs, years: 20 };
  const everyFive = runExperiment({ ...plan, checkpointEvery: 5 });
  const everyTen = runExperiment({ ...plan, checkpointEvery: 10 });
  assert.deepEqual(everyFive.checkpoints.at(-1)?.snapshot, everyTen.checkpoints.at(-1)?.snapshot);
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

test("lightweight snapshots are rejected for continuation", () => {
  const source = new SimulationEngine(42, stores);
  source.advance(inputs);
  const restored = new SimulationEngine(42, stores);
  assert.equal(source.snapshot.continuation, undefined);
  assert.throws(() => restored.loadCheckpoint(structuredClone(source.snapshot)), /lightweight simulation snapshot/);
});

test("an unchanged experiment branch reproduces the original future", () => {
  const original = new SimulationEngine(100, stores);
  for (let year = 0; year < 40; year += 1) original.advanceYears(inputs, 1);
  const checkpoint = { year: 40, snapshot: original.checkpoint };
  for (let year = 0; year < 10; year += 1) original.advanceYears(inputs, 1);
  const branch = branchExperiment({ checkpoint, seed: 100, inputs, years: 10 });
  assert.deepEqual(branch.at(-1)?.snapshot, original.checkpoint);
});

test("macro projection depletes reserves proportionally and evaluates events at the projected year", () => {
  const engine = new SimulationEngine(64, stores);
  engine.advanceYears({ ...inputs, annualProduction: { food: 0, wood: 0, gold: 0 } }, 1);
  assert.ok(engine.snapshot.stores.food > 0 && engine.snapshot.stores.food < stores.food, "a one-year deficit consumes part of an existing reserve");

  const checkpoint = engine.checkpoint;
  checkpoint.pandemic = { id: 1, virulence: 0.3, transmissibility: 0.3, originRegion: "local", startYear: 0, affectedRegions: ["local"], resolved: false };
  const projected = new SimulationEngine(64, stores);
  projected.loadCheckpoint(checkpoint);
  projected.advanceYears(inputs, 3);
  assert.equal(projected.snapshot.elapsedDays, 48);
  assert.equal(projected.snapshot.pandemic?.resolved, true, "event duration is evaluated at the end of the projected interval");
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
  regionalEngines = new Map<string, SimulationEngine>();
  constructor() { TestWorker.latest = this; }
  postMessage(request: SimulationRequest) { this.requests.push(structuredClone(request)); }
  terminate() { this.terminated = true; }
  deliver() {
    const request = this.requests.shift()!;
    if (request.type === "init") this.engine = new SimulationEngine(request.seed, request.stores, request.knowledge);
    if (request.type === "advance" || request.type === "advance-years") {
      this.engine.setStores(addStores(this.engine.snapshot.stores, request.storeChange));
      if (request.type === "advance") this.engine.advance(request.inputs);
      else this.engine.advanceYears(request.inputs, request.years);
    }
    if (request.type === "add-practice") this.engine.addPractice(request.practice);
    if (request.type === "advance-regions") {
      const snapshots = request.regions.map((region) => {
        let engine = this.regionalEngines.get(region.id);
        if (!engine) {
          let seed = request.seed | 0;
          for (let i = 0; i < region.id.length; i += 1) seed = Math.imul(seed ^ region.id.charCodeAt(i), 0x45d9f3b);
          engine = new SimulationEngine(seed >>> 0, region.stores, region.knowledge);
          this.regionalEngines.set(region.id, engine);
        } else engine.setStores(addStores(engine.snapshot.stores, region.storeChange));
        engine.advance(region.inputs);
        return { id: region.id, snapshot: engine.checkpoint };
      });
      this.onmessage?.({ data: { type: "region-snapshots", snapshots } });
    } else if (request.type === "retire-region") {
      this.regionalEngines.delete(request.id);
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

test("queued worker advances preserve production and an intervening purchase", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  client.drain();

  client.advance(inputs);
  client.advance(inputs);
  const expected = new SimulationEngine(42, stores);
  expected.advance(inputs);
  expected.advance(inputs);
  worker.deliver(); worker.deliver();
  assert.deepEqual(client.drain(), expected.checkpoint);

  client.setStores({ ...expected.snapshot.stores, wood: expected.snapshot.stores.wood - 3 });
  client.advance(inputs);
  client.advance(inputs);
  expected.setStores({ ...expected.snapshot.stores, wood: expected.snapshot.stores.wood - 3 });
  expected.advance(inputs);
  expected.advance(inputs);
  worker.deliver(); worker.deliver();
  assert.deepEqual(client.drain(), expected.checkpoint);
});

test("a purchase made before a worker reply remains visible while paused", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  client.drain();
  client.advance(inputs);
  const purchased = { ...stores, wood: stores.wood - 3 };
  client.setStores(purchased);
  worker.deliver();
  const first = client.drain()!;
  const expected = new SimulationEngine(42, stores);
  expected.advance(inputs);
  assert.equal(first.stores.wood, expected.snapshot.stores.wood - 3);
  assert.equal(client.snapshot.stores.wood, first.stores.wood);

  client.advance(inputs);
  expected.setStores({ ...expected.snapshot.stores, wood: expected.snapshot.stores.wood - 3 });
  expected.advance(inputs);
  worker.deliver();
  assert.deepEqual(client.drain(), expected.checkpoint);
});

test("queued regional advances preserve production and an intervening trade", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  const region = { id: "island", stores, knowledge: 0, inputs };
  client.advanceRegions([region]);
  client.advanceRegions([region]);
  worker.deliver(); worker.deliver();
  const produced = client.getRegionSnapshot("island")!;
  let seed = 42;
  for (const character of region.id) seed = Math.imul(seed ^ character.charCodeAt(0), 0x45d9f3b);
  const expected = new SimulationEngine(seed >>> 0, stores);
  expected.advance(inputs);
  expected.advance(inputs);
  assert.deepEqual(produced, expected.checkpoint);

  // A sub-day call consumes the fresh snapshot without posting another request.
  // A trade made after that consumption is the only change in the next request.
  client.advanceRegions([{ ...region, inputs: { ...inputs, deltaDays: 0.125 } }]);
  const tradedStores = { ...produced.stores, gold: produced.stores.gold + 4 };
  client.advanceRegions([{ ...region, stores: tradedStores, inputs: { ...inputs, deltaDays: 0.125 } }]);
  expected.setStores(tradedStores);
  expected.advance({ ...inputs, deltaDays: 0.25 });
  worker.deliver();
  assert.deepEqual(client.getRegionSnapshot("island"), expected.checkpoint);
});

test("annual checkpoints wait for a completed worker snapshot", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  const chronicle = new EventChronicle();
  chronicle.checkpointSnapshot(client.drain()!);
  client.advance({ ...inputs, deltaDays: 13 });
  assert.deepEqual(chronicle.getCheckpoints().map((entry) => entry.year), [1]);
  worker.deliver();
  const completed = client.drain()!;
  assert.equal(chronicle.checkpointSnapshot(completed), 2);
  assert.ok(completed.elapsedDays >= 12);
  assert.deepEqual(chronicle.getCheckpoints().map((entry) => entry.year), [1, 2]);
  assert.equal(chronicle.getCheckpoints()[1].snapshot.elapsedDays, completed.elapsedDays);
});

test("an externally granted practice survives worker updates and crash recovery", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  const practice = {
    id: "p-war-a-b-1-player-peace-charter", name: "peace-charter", parentId: null,
    discoveredDay: 12, effects: { soil: 0, forest: 0, food: 0, water: 0, knowledge: 0.01, stability: 0.015 },
  };
  client.addPractice(practice);
  worker.deliver();
  assert.ok(client.drain()?.culture.practices.some((entry) => entry.id === practice.id));
  client.advance(inputs);
  worker.deliver();
  assert.ok(client.drain()?.culture.practices.some((entry) => entry.id === practice.id));

  const queued = { ...practice, id: "p-war-a-b-2-player-war-weariness", name: "war-weariness" };
  client.addPractice(queued);
  worker.onerror?.({ preventDefault() {} });
  const recovered = client.drain()!;
  assert.ok(recovered.culture.practices.some((entry) => entry.id === queued.id));
  assert.ok(client.advance(inputs)?.culture.practices.some((entry) => entry.id === queued.id));
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

test("switching to coupled world stepping preserves completed, queued, and fractional work", (t) => {
  mockWorker(t, TestWorker);
  const client = new SimulationClient(42, stores, 0);
  const worker = TestWorker.latest;
  worker.deliver();
  client.advance(inputs); worker.deliver();
  const acknowledged = client.drain()!;
  client.setStores(acknowledged.stores);
  client.advance(inputs);
  client.advance({ ...inputs, deltaDays: 0.125 });
  const expected = new SimulationEngine(42, stores);
  expected.loadCheckpoint(acknowledged);
  expected.advance(inputs);
  assert.deepEqual(client.useSynchronous(), expected.checkpoint);
  assert.equal(worker.terminated, true);
  client.setStores(expected.snapshot.stores);
  expected.advance({ ...inputs, deltaDays: 0.25 });
  assert.deepEqual(client.advance({ ...inputs, deltaDays: 0.125 }), expected.checkpoint);
});

test("lost cultural practices release their discovery slots after the cooldown", () => {
  const engine = new SimulationEngine(200, stores);
  const checkpoint = engine.checkpoint;
  checkpoint.practiceVulnerability = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`lost-${index}`, -2]));
  engine.loadCheckpoint(checkpoint);
  engine.advanceYears(inputs, 3);
  assert.ok(Object.keys(engine.snapshot.practiceVulnerability).every(id => !id.startsWith('lost-')));
  for (let year = 0; year < 200; year++) engine.advanceYears(inputs, 1);
  assert.ok(engine.snapshot.culture.practices.length > 0, 'societies can discover again after losing a generation of practices');
});

test("an acute pandemic resolves even when environmental disease remains endemic", () => {
  const engine = new SimulationEngine(256, stores);
  const checkpoint = engine.checkpoint;
  checkpoint.pandemic = { id: 0, startYear: 0, virulence: 0.4, transmissibility: 0.4, originRegion: "local", affectedRegions: ["local"], resolved: false };
  engine.loadCheckpoint(checkpoint);
  for (let year = 0; year < 12; year++) engine.advanceYears({ ...inputs, population: 20, diseaseImport: 0.8 }, 1);
  assert.ok(!engine.snapshot.pandemic || engine.snapshot.pandemic.resolved);
  assert.ok(engine.snapshot.culture.practices.some(practice => practice.name.includes("plague")));
});
