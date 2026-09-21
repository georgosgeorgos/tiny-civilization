import assert from "node:assert/strict";
import test from "node:test";
import { buildRoutes, generateBasin } from "./world.ts";

test("same seed is deterministic and different seeds vary", () => {
  const first = generateBasin(17);
  const again = generateBasin(17);
  const other = generateBasin(18);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first.cells.map((cell) => cell.elevation), other.cells.map((cell) => cell.elevation));
});

test("basin has valid cells, a connected north to south river, and acyclic drainage", () => {
  const world = generateBasin(91);
  assert.equal(world.width, 48);
  assert.equal(world.height, 36);
  assert.equal(world.cells.length, world.width * world.height);
  for (const cell of world.cells) {
    assert.equal(cell.id, cell.z * world.width + cell.x);
    assert.ok(cell.elevation >= 0 && cell.moisture >= 0 && cell.moisture <= 1);
    assert.ok(cell.fertility >= 0 && cell.fertility <= 1 && cell.forest >= 0 && cell.forest <= 1);
    if (cell.downstream !== null) assert.ok(world.cells[cell.downstream].elevation < cell.elevation);
  }
  const river = world.cells.filter((cell) => cell.river);
  assert.equal(river.some((cell) => cell.z === 0), true);
  assert.equal(river.some((cell) => cell.z === world.height - 1), true);
  for (let index = 1; index < river.length; index += 1) {
    const previous = river[index - 1];
    const current = river[index];
    assert.ok(Math.abs(previous.z - current.z) <= 1 && Math.abs(previous.x - current.x) <= 1);
  }
  for (const cell of world.cells) {
    const seen = new Set<number>();
    let at: number | null = cell.id;
    while (at !== null) {
      assert.equal(seen.has(at), false);
      seen.add(at);
      at = world.cells[at].downstream;
    }
  }
});

test("three settlement routes connect their endpoints and bridges improve crossing trade", () => {
  const world = generateBasin(44);
  const settlements = world.settlements.map((settlement) => ({ ...settlement, bridge: false }));
  const baseline = buildRoutes(world, settlements);
  assert.equal(baseline.length, 3);
  for (const route of baseline) {
    const from = settlements.find((settlement) => settlement.id === route.from);
    const to = settlements.find((settlement) => settlement.id === route.to);
    assert.ok(from && to);
    assert.equal(route.cells[0], toId(from.x, from.z, world.width));
    assert.equal(route.cells[route.cells.length - 1], toId(to.x, to.z, world.width));
    assert.ok(route.distance > 0 && route.travelSeasons >= 1 && route.travelSeasons <= 3);
  }
  const withBridge = settlements.map((settlement) => ({ ...settlement, bridge: settlement.id === "willowbank" }));
  const improved = buildRoutes(world, withBridge);
  const crossing = baseline.find((route) => route.from === "willowbank" || route.to === "willowbank");
  const crossingImproved = improved.find((route) => route.id === crossing?.id);
  assert.ok(crossing && crossingImproved);
  assert.equal(crossingImproved?.bridge, true);
  assert.equal(crossingImproved?.capacity, crossing.capacity * 2);
  assert.ok((crossingImproved?.travelSeasons ?? 99) <= crossing.travelSeasons);
});

function toId(x: number, z: number, width: number): number {
  return Math.round(z) * width + Math.round(x);
}
