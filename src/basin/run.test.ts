import assert from 'node:assert/strict';
import test from 'node:test';
import { BasinEngine } from './engine.ts';
import { runSeasons } from './run.ts';
import { DEFAULT_PARAMETERS } from './parameters.ts';

test('long runs yield and resume exactly after cancellation and JSON restoration', async () => {
  const parameters = { ...DEFAULT_PARAMETERS, householdsPerSettlement: 18, rainfall: 0.7, cropYield: 0.8 };
  const engine = new BasinEngine(47, parameters);
  const controller = new AbortController();
  let yielded = 0;
  await runSeasons(engine, 80, { signal: controller.signal, yieldControl: async () => { yielded++; controller.abort(); } });
  assert.equal(yielded, 1);
  assert.ok(engine.state.season > 0 && engine.state.season < 80);
  const restored = BasinEngine.restore(engine.export());
  await runSeasons(restored, 80 - restored.state.season, { signal: new AbortController().signal, yieldControl: async () => {} });
  const uninterrupted = new BasinEngine(47, parameters);
  uninterrupted.advance(80);
  assert.deepEqual(restored.state, uninterrupted.state);
});

test('an already cancelled run does not advance and invalid horizons fail', async () => {
  const engine = new BasinEngine(1);
  const controller = new AbortController(); controller.abort();
  await runSeasons(engine, 10, { signal: controller.signal });
  assert.equal(engine.state.season, 0);
  for (const invalid of [Infinity, NaN, -1, 0.5]) {
    assert.throws(() => engine.advance(invalid));
    await assert.rejects(runSeasons(engine, invalid, { signal: controller.signal }));
  }
});

test('settings change initial conditions and yields, and survive restoration', () => {
  const normal = new BasinEngine(123, { ...DEFAULT_PARAMETERS });
  const abundant = new BasinEngine(123, { ...DEFAULT_PARAMETERS, startingFood: 2, cropYield: 1.5 });
  assert.equal(normal.state.households.length, 105);
  assert.ok(Math.abs(abundant.state.households[0].stocks.food - normal.state.households[0].stocks.food * 2) <= 0.0011, 'initial food multiplier respects rounding');
  normal.advance(1); abundant.advance(1);
  assert.ok(abundant.state.settlements[0].production.food > normal.state.settlements[0].production.food);
  assert.deepEqual(BasinEngine.restore(abundant.export()).state, abundant.state);
  for (const value of [Infinity, NaN, -1, 0, 101, 12.5]) assert.throws(() => new BasinEngine(1, { ...DEFAULT_PARAMETERS, householdsPerSettlement: value }));
  const malformed = JSON.parse(normal.export()); malformed.parameters.rainfall = 'wet';
  assert.throws(() => BasinEngine.restore(JSON.stringify(malformed)));
});

test('millennium runs keep bounded history, valid saves, and exact continuation', { timeout: 120_000 }, () => {
  const engine = new BasinEngine(151, { ...DEFAULT_PARAMETERS, householdsPerSettlement: 12, cropYield: 0.5, rainfall: 0.5, forestGrowth: 0.25 });
  engine.intervene({ type: 'drought', duration: 24 });
  engine.advance(4000);
  assert.equal(engine.state.season, 4000);
  assert.equal(engine.state.history.length, 160);
  assert.ok(engine.state.archive!.entries.length <= 512);
  assert.equal(engine.state.archive!.entries[0].season, 0);
  assert.ok(engine.state.archive!.stride >= 8);
  assert.ok(engine.state.events.length <= 120);
  assert.ok(engine.export().length < 1_000_000);
  const restored = BasinEngine.restore(engine.export());
  engine.advance(8); restored.advance(8);
  assert.deepEqual(restored.state, engine.state);
});

test('rainfall and forest regrowth affect ecology independently', () => {
  const baseline = new BasinEngine(91, { ...DEFAULT_PARAMETERS });
  const dry = new BasinEngine(91, { ...DEFAULT_PARAMETERS, rainfall: 0.5 });
  const slowForest = new BasinEngine(91, { ...DEFAULT_PARAMETERS, forestGrowth: 0.25 });
  baseline.advance(); dry.advance(); slowForest.advance();
  const moisture = (engine: BasinEngine) => engine.state.world.cells.reduce((sum, cell) => sum + cell.moisture, 0);
  const forest = (engine: BasinEngine) => engine.state.world.cells.reduce((sum, cell) => sum + cell.forest, 0);
  assert.ok(moisture(dry) < moisture(baseline));
  assert.ok(forest(slowForest) < forest(baseline));
});

test('older saves without parameters or an archive still continue', () => {
  const engine = new BasinEngine(27);
  engine.advance(10);
  const legacy = JSON.parse(engine.export()); delete legacy.archive;
  const restored = BasinEngine.restore(JSON.stringify(legacy));
  engine.advance(10); restored.advance(10);
  assert.deepEqual(restored.state.households, engine.state.households);
  assert.deepEqual(restored.state.world, engine.state.world);
  assert.deepEqual(restored.state.history, engine.state.history);
  assert.ok(restored.state.archive!.entries.length > 0);
  const badArchive = JSON.parse(restored.export()); badArchive.archive.entries[0].food = -1;
  assert.throws(() => BasinEngine.restore(JSON.stringify(badArchive)), /archived observation/);
});
