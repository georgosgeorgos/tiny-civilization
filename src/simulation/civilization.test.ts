import assert from 'node:assert/strict';
import test from 'node:test';
import { annualBirths, computeDeaths } from '../population.ts';
import { runWorldYears } from './world-run.ts';

test('births require reproductive adults, food, and room; blocked births do not accumulate', () => {
  const healthy = { reproductiveAdults: 10, population: 14, housing: 30, food: 80, readiness: 1, credit: 0 };
  assert.equal(annualBirths(healthy).births, 1);
  for (const change of [{ reproductiveAdults: 1 }, { food: 0 }, { housing: 14 }, { readiness: 0 }]) {
    assert.deepEqual(annualBirths({ ...healthy, credit: 0.9, ...change }), { births: 0, credit: 0 });
  }
  const scarce = annualBirths({ ...healthy, food: 15 });
  assert.equal(scarce.births, 0);
  assert.ok(scarce.credit > 0 && scarce.credit < 1);
  let credit = 0, births = 0;
  for (let year = 0; year < 10; year++) {
    const result = annualBirths({ ...healthy, reproductiveAdults: 2, readiness: 0.8, credit });
    credit = result.credit; births += result.births;
  }
  assert.equal(births, 1, 'small founding populations can have children without a per-frame birth rate');
});

test('old age applies to small settlements and never removes a child as an elder', () => {
  const residents = [
    { age: 110, seed: 0.1, tribe: false, islandId: 'home', name: 'Elder' },
    { age: 10, seed: 0.2, tribe: false, islandId: 'home', name: 'Child' },
  ];
  assert.deepEqual(computeDeaths(residents, 100, () => 0.5), [{ personIndex: 0, name: 'Elder' }]);
});

test('a year run advances every quarter day and cancellation stops further world mutations', async () => {
  const controller = new AbortController();
  let calls = 0, days = 0, generations = 0;
  await runWorldYears({ years: 2, signal: controller.signal, tick: (step) => {
    calls++; days += step;
    if (days % 12 === 0) generations++;
  }, yieldControl: async () => {} });
  assert.equal(days, 24); assert.equal(calls, 96); assert.equal(generations, 2);
  const stopped = new AbortController(); let afterStop = 0;
  const elapsed = await runWorldYears({ years: 100, signal: stopped.signal, tick: () => {
    afterStop++; if (afterStop === 5) stopped.abort();
  } });
  assert.equal(afterStop, 5); assert.equal(elapsed, 1.25);
  for (const years of [0, -1, 1.5, Infinity, 10001]) await assert.rejects(runWorldYears({ years, signal: stopped.signal, tick: () => {} }));
});

test('growth preferences stop commissioning houses when spare capacity already exists', async () => {
  const { chooseNextBuilding, emptyCounts } = await import('../ai.ts');
  const counts = { ...emptyCounts(), hut: 10, farm: 3, lumber: 1, market: 1 };
  const next = chooseNextBuilding({ food: 60, gold: 100, wood: 50, mood: 70, people: 8, housing: 20, counts, buildingTotal: 15 }, () => true, 'growth');
  assert.notEqual(next, 'hut');
  const shortage = chooseNextBuilding({ food: 60, gold: 100, wood: 50, mood: 70, people: 8, housing: 8, counts: { ...counts, hut: 4 }, buildingTotal: 9 }, () => true, 'growth');
  assert.equal(shortage, 'hut');
});

test('demographic counts match actual generations exactly', async () => {
  const { computeDemographics } = await import('../game-types.ts');
  assert.deepEqual(computeDemographics([0, 15, 16, 64, 65, 92].map(age => ({ age }))), { children: 2, adults: 2, elders: 2 });
  assert.deepEqual(computeDemographics([]), { children: 0, adults: 0, elders: 0 });
});

test('food shortage redirects adult labor while children and elders remain dependents', async () => {
  const { allocateLabor } = await import('./labor.ts');
  const adults = Array.from({ length: 6 }, (_, id) => ({ id: String(id), age: 30 }));
  const residents = [...adults, { id: 'child', age: 8 }, { id: 'elder', age: 72 }];
  const fields = Array.from({ length: 6 }, (_, id) => ({ id: `field${id}`, kind: 'farm' as const, workers: 1 }));
  const workplaces = [...fields, { id: 'market', kind: 'market' as const, workers: 1 }, { id: 'lumber', kind: 'lumber' as const, workers: 1 }];
  const surplus = allocateLabor(residents, workplaces, { food: 100, wood: 20 });
  const shortage = allocateLabor(residents, workplaces, { food: 0, wood: 20 });
  assert.ok([...surplus.values()].includes('market'));
  assert.ok([...shortage.values()].every(id => id.startsWith('field')));
  assert.equal(shortage.has('child'), false); assert.equal(shortage.has('elder'), false);
  assert.equal(new Set(shortage.values()).size, 6);
});

test('shortage deaths scale with population and elapsed time, and stop when food returns', async () => {
  const { hardshipLosses } = await import('../population.ts');
  const crisis = { population: 100, food: 0, risk: 1, credit: 0 };
  assert.equal(hardshipLosses({ ...crisis, years: 1 }).losses, 13);
  const small = hardshipLosses({ ...crisis, population: 4, years: 1 });
  assert.equal(small.losses, 0); assert.ok(small.credit > 0 && small.credit < 1);
  assert.deepEqual(hardshipLosses({ ...crisis, years: 1, food: 100, credit: 0.9 }), { losses: 0, credit: 0 });
});

test('exhausted fallow soil and forest can recover instead of remaining at an absorbing zero', async () => {
  const { CellularEcology } = await import('./cellular.ts');
  const { emptyCounts } = await import('../ai.ts');
  const land = new CellularEcology(42);
  const depleted = land.checkpoint;
  depleted.fields.soil.fill(0); depleted.fields.forest.fill(0);
  land.restore(depleted);
  const recovered = land.advance(emptyCounts(), 'none', 12);
  assert.ok(recovered.soil > 0.1);
  assert.ok(recovered.forest > 0);
});
