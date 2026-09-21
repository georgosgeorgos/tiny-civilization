import assert from "node:assert/strict";
import test from "node:test";
import { BasinEngine } from "./engine.ts";
import type { BasinState, Good } from "./types.ts";

const goods: Good[] = ["food", "timber", "tools"];
const mutable = (engine: BasinEngine): BasinState => engine.state as BasinState;
const money = (state: BasinState): number => state.households.reduce((sum, home) => sum + home.coin, 0) + state.settlements.reduce((sum, place) => sum + place.treasury, 0);
const goodsWithTransit = (state: BasinState, good: Good): number =>
  state.households.reduce((sum, home) => sum + home.stocks[good], 0) + state.shipments.filter((shipment) => shipment.good === good).reduce((sum, shipment) => sum + shipment.amount, 0);

test("the same seed remains deterministic for 100 seasonal steps", () => {
  const left = new BasinEngine(41);
  const right = new BasinEngine(41);
  left.advance(100);
  right.advance(100);
  assert.deepEqual(left.state, right.state);
  assert.ok(left.state.households.length >= 102 && left.state.households.length <= 108, "three settlements begin near 108 households");
  assert.ok(left.state.history.at(-1)!.wellbeing > 0.5, "the ordinary seasonal economy remains viable");
  assert.equal(left.state.history.length, 101, "history retains the initial observation and every season");
  const latest = left.state.history.at(-1)!;
  assert.ok(Number.isFinite(latest.foodPrice) && latest.foodPrice! > 0, "history records the basin food price");
  assert.ok(Number.isInteger(latest.migration) && latest.migration! >= 0, "history records household moves");
  assert.ok(Number.isFinite(latest.forest) && latest.forest! >= 0 && latest.forest! <= 1, "history records forest cover");
});

test("an exported simulation continues exactly after restoration", () => {
  const original = new BasinEngine(73);
  original.intervene({ type: "drought", duration: 4 });
  original.advance(11);
  const restored = BasinEngine.restore(original.export());
  assert.deepEqual(restored.state, original.state, "restoring a basin does not evolve or recompute saved state");
  original.advance(17);
  restored.advance(17);
  assert.deepEqual(restored.state, original.state);
  assert.throws(() => BasinEngine.restore('{"schema":"wrong"}'), /Invalid basin save/);
});

test("restore rejects malformed nested state and unsafe replay horizons", () => {
  const exported = new BasinEngine(73).export();
  const corrupted = (mutate: (state: BasinState) => void): string => {
    const state = JSON.parse(exported) as BasinState;
    mutate(state);
    return JSON.stringify(state);
  };
  assert.throws(() => BasinEngine.restore(corrupted((state) => { state.history[0] = null as unknown as BasinState["history"][number]; })), /history entry/);
  assert.throws(() => BasinEngine.restore(corrupted((state) => { state.events.push({ id: 1, season: 0, kind: "trade", settlementId: null, message: "broken", causes: null as unknown as Record<string, number> }); state.nextEventId = 2; })), /event/);
  assert.throws(() => BasinEngine.restore(corrupted((state) => { state.routes[0]!.cells[0] = state.world.cells.length; })), /route/);
  assert.throws(() => BasinEngine.restore(corrupted((state) => { state.households[0]!.parcelId = -1; })), /household/);
  assert.throws(() => BasinEngine.restore(corrupted((state) => { state.season = Number.MAX_SAFE_INTEGER + 1; })), /seed or season/);
});

test("coins are conserved and outgoing cargo is represented in transit", () => {
  const engine = new BasinEngine(19);
  const before = money(mutable(engine));
  engine.advance(14);
  const state = mutable(engine);
  assert.ok(Math.abs(money(state) - before) < 0.02, "taxes and public purchasing only move existing coin");
  for (const good of goods) assert.ok(Number.isFinite(goodsWithTransit(state, good)) && goodsWithTransit(state, good) >= 0);
  for (const shipment of state.shipments) {
    assert.ok(shipment.amount > 0 && shipment.arrival > state.season, "a shipment has removed cargo until its future arrival");
  }
});

test("drought visibly reduces food held after equal seasons", () => {
  const normal = new BasinEngine(109);
  const dry = new BasinEngine(109);
  dry.intervene({ type: "drought", duration: 8 });
  normal.advance(8);
  dry.advance(8);
  const normalFood = goodsWithTransit(mutable(normal), "food");
  const dryFood = goodsWithTransit(mutable(dry), "food");
  assert.ok(dryFood < normalFood, `drought food ${dryFood} should be below normal ${normalFood}`);
  assert.equal(dry.state.droughtUntil, 8);
});

test("a funded bridge consumes public funds and increases route capacity", () => {
  const engine = new BasinEngine(5);
  const state = mutable(engine);
  const target = state.settlements[0]!;
  target.treasury = 200;
  const before = state.routes.filter((route) => route.from === target.id || route.to === target.id).map((route) => route.capacity);
  engine.intervene({ type: "bridge", settlementId: target.id });
  engine.advance(8);
  const after = engine.state.routes.filter((route) => route.from === target.id || route.to === target.id);
  assert.equal(engine.state.settlements[0]!.bridge, true);
  assert.ok(engine.state.settlements[0]!.treasury < 200, "construction bought timber and tools from households");
  assert.ok(after.some((route, index) => route.capacity > (before[index] ?? 0)));
});

test("public works require enough material to preserve seller reserves", () => {
  const engine = new BasinEngine(31);
  const state = mutable(engine);
  const settlement = state.settlements[0]!;
  const homes = state.households.filter((home) => home.settlementId === settlement.id);
  for (const home of homes) { home.stocks.timber = 0; home.stocks.tools = 0; }
  const timberSeller = homes[0]!;
  const toolSeller = homes[1]!;
  timberSeller.stocks.timber = 3.299;
  toolSeller.stocks.tools = 0.749;
  settlement.treasury = 200;
  settlement.bridgeProgress = 0.001;
  (engine as unknown as { publicWorks(): void }).publicWorks();
  assert.equal(settlement.bridgeProgress, 0.001, "construction waits when protected inventory is insufficient");
  assert.equal(timberSeller.stocks.timber, 3.299);
  assert.equal(toolSeller.stocks.tools, 0.749);

  timberSeller.stocks.timber = 3.3;
  toolSeller.stocks.tools = 0.75;
  (engine as unknown as { publicWorks(): void }).publicWorks();
  assert.ok(settlement.bridgeProgress > 0.001);
  assert.equal(timberSeller.stocks.timber, 1.1);
  assert.equal(toolSeller.stocks.tools, 0.3);
});

test("cargo follows a buyer that migrates before delivery", () => {
  const engine = new BasinEngine(57);
  const state = mutable(engine);
  const route = state.routes[0]!;
  const buyer = state.households.find((home) => home.settlementId === route.to)!;
  const destination = state.settlements.find((settlement) => settlement.id !== route.to && settlement.id !== route.from)!;
  const before = buyer.stocks.food;
  buyer.settlementId = destination.id;
  state.shipments.push({ id: state.nextShipmentId++, from: route.from, to: route.to, buyerId: buyer.id, good: "food", amount: 4, arrival: state.season });
  (engine as unknown as { deliverShipments(): void }).deliverShipments();
  assert.equal(buyer.stocks.food, before + 4);
  assert.equal(state.shipments.length, 0);
  assert.equal(state.events.at(-1)!.settlementId, destination.id);
});

test("tax policy changes treasury receipts and sustained hardship can move a whole household", () => {
  const low = new BasinEngine(88);
  const high = new BasinEngine(88);
  const lowState = mutable(low);
  const highState = mutable(high);
  for (const state of [lowState, highState]) {
    const place = state.settlements[0]!;
    place.treasury = 0;
    const homes = state.households.filter((home) => home.settlementId === place.id);
    homes[0]!.stocks.food = 50;
    homes[1]!.stocks.food = 0;
    homes[1]!.coin = 50;
  }
  low.intervene({ type: "tax", settlementId: lowState.settlements[0]!.id, rate: 0 });
  high.intervene({ type: "tax", settlementId: highState.settlements[0]!.id, rate: 0.4 });
  low.advance();
  high.advance();
  assert.ok(high.state.settlements[0]!.treasury > low.state.settlements[0]!.treasury, "a higher tax takes a larger share of paid trade");

  const migration = new BasinEngine(96);
  const migrationState = mutable(migration);
  const origin = migrationState.settlements[0]!;
  const destination = migrationState.settlements[1]!;
  for (const home of migrationState.households.filter((home) => home.settlementId === origin.id)) home.stocks.food = 0;
  for (const home of migrationState.households.filter((home) => home.settlementId === destination.id)) home.stocks.food = 80;
  const traveler = migrationState.households.find((home) => home.settlementId === origin.id)!;
  traveler.hardship = 8;
  migration.advance();
  assert.equal(traveler.settlementId, destination.id, "migration transfers the actual household rather than abstract population");
  assert.ok(traveler.coin >= 0 && traveler.stocks.food >= 0, "the moved household retains its material holdings");
});

test("stocks and ecological values remain finite and nonnegative", () => {
  const engine = new BasinEngine(151);
  engine.intervene({ type: "drought", duration: 18 });
  engine.advance(120);
  for (const home of engine.state.households) {
    assert.ok(Number.isFinite(home.coin) && home.coin >= 0);
    for (const good of goods) assert.ok(Number.isFinite(home.stocks[good]) && home.stocks[good] >= 0);
  }
  for (const cell of engine.state.world.cells) {
    assert.ok(Number.isFinite(cell.fertility) && cell.fertility >= 0);
    assert.ok(Number.isFinite(cell.forest) && cell.forest >= 0);
    assert.ok(Number.isFinite(cell.moisture) && cell.moisture >= 0);
  }
});
