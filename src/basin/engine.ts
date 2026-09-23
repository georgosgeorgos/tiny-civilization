import { DEFAULT_PARAMETERS, validateParameters, type BasinParameters } from "./parameters.ts";
import { SeededRandom } from "../simulation/random.ts";
import { buildRoutes, generateBasin } from "./world.ts";
import type { BasinEvent, BasinIntervention, BasinState, Good, Household, Livelihood, Settlement, Shipment, Stocks } from "./types.ts";

const GOODS: Good[] = ["food", "timber", "tools"];
const EVENT_KINDS = ["trade", "migration", "weather", "works", "policy", "livelihood"] as const;
const zero = (): Stocks => ({ food: 0, timber: 0, tools: 0 });
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const round = (value: number): number => Math.round(value * 1000) / 1000;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const inRange = (value: unknown, low: number, high: number): value is number => isFiniteNumber(value) && value >= low && value <= high;
const validStocks = (value: unknown): value is Stocks => {
  if (!value || typeof value !== "object") return false;
  const stocks = value as Partial<Stocks>;
  return GOODS.every((good) => isFiniteNumber(stocks[good]) && stocks[good]! >= 0);
};
const validGood = (value: unknown): value is Good => GOODS.includes(value as Good);
const validLivelihood = (value: unknown): value is Livelihood => value === "farmer" || value === "woodcutter" || value === "toolmaker";

function validateSave(value: unknown): asserts value is BasinState {
  if (!isRecord(value)) throw new Error("Invalid basin save: expected an object.");
  const state = value as Partial<BasinState>;
  if (state.parameters !== undefined) validateParameters(state.parameters);
  if (state.schema !== "tiny-civilization.basin/v1") throw new Error("Invalid basin save: unsupported schema.");
  if (!isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff || !isInteger(state.season) || state.season < 0) throw new Error("Invalid basin save: seed or season is outside the supported range.");
  if (!state.world || state.world.seed !== state.seed || !Array.isArray(state.world.cells) || !Array.isArray(state.world.settlements)) throw new Error("Invalid basin save: world does not match its seed.");
  if (!isInteger(state.world.width) || !isInteger(state.world.height) || state.world.width < 1 || state.world.height < 1 || state.world.cells.length !== state.world.width * state.world.height) throw new Error("Invalid basin save: malformed world grid.");
  if (!Array.isArray(state.settlements) || state.settlements.length !== 3 || !Array.isArray(state.households) || !Array.isArray(state.routes) || !Array.isArray(state.shipments)) throw new Error("Invalid basin save: missing simulation collections.");
  if (!Array.isArray(state.events) || !Array.isArray(state.history) || !Array.isArray(state.interventions)) throw new Error("Invalid basin save: malformed history.");
  if (!isInteger(state.droughtUntil) || state.droughtUntil < 0 || state.droughtUntil > state.season + 24 || !isInteger(state.nextEventId) || state.nextEventId < 1 || !isInteger(state.nextShipmentId) || state.nextShipmentId < 1) throw new Error("Invalid basin save: invalid counters.");

  if (state.world.settlements.length !== state.settlements.length || state.world.settlements.some((settlement) => !settlement || typeof settlement.id !== "string" || !settlement.id || typeof settlement.name !== "string" || !isInteger(settlement.x) || !isInteger(settlement.z) || settlement.x < 0 || settlement.x >= state.world!.width || settlement.z < 0 || settlement.z >= state.world!.height || !validLivelihood(settlement.specialty))) throw new Error("Invalid basin save: malformed world settlements.");
  if (state.settlements.some((settlement) => !settlement || typeof settlement.id !== "string" || !settlement.id)) throw new Error("Invalid basin save: malformed settlements.");
  const settlementIds = new Set(state.settlements.map((settlement) => settlement.id));
  if (settlementIds.size !== state.settlements.length) throw new Error("Invalid basin save: duplicate settlement IDs.");
  const worldSettlementIds = new Set(state.world.settlements.map((settlement) => settlement.id));
  if (worldSettlementIds.size !== settlementIds.size || [...settlementIds].some((id) => !worldSettlementIds.has(id))) throw new Error("Invalid basin save: world and simulation settlements do not match.");

  for (const [index, cell] of state.world.cells.entries()) {
    const expectedX = index % state.world.width;
    const expectedZ = Math.floor(index / state.world.width);
    if (!cell || cell.id !== index || cell.x !== expectedX || cell.z !== expectedZ || !isFiniteNumber(cell.elevation) || !inRange(cell.moisture, 0, 1) || !inRange(cell.fertility, 0, 1) || !inRange(cell.forest, 0, 1) || typeof cell.river !== "boolean" || (cell.settlementId !== null && !settlementIds.has(cell.settlementId)) || (cell.downstream !== null && (!isInteger(cell.downstream) || cell.downstream < 0 || cell.downstream >= state.world.cells.length))) throw new Error("Invalid basin save: malformed world cell.");
    if (cell.downstream !== null && state.world.cells[cell.downstream]!.elevation >= cell.elevation) throw new Error("Invalid basin save: drainage must descend.");
  }

  for (const settlement of state.settlements) {
    const worldSettlement = state.world.settlements.find((candidate) => candidate.id === settlement?.id);
    if (!settlement || typeof settlement.id !== "string" || !settlement.id || typeof settlement.name !== "string" || !worldSettlement || settlement.name !== worldSettlement.name || settlement.x !== worldSettlement.x || settlement.z !== worldSettlement.z || !validLivelihood(settlement.specialty) || settlement.specialty !== worldSettlement.specialty || !validStocks(settlement.stocks) || !validStocks(settlement.prices) || !validStocks(settlement.production) || !validStocks(settlement.consumption) || !validStocks(settlement.imports) || !validStocks(settlement.exports) || !isFiniteNumber(settlement.treasury) || settlement.treasury < 0 || !inRange(settlement.taxRate, 0, 0.5) || typeof settlement.bridge !== "boolean" || !inRange(settlement.bridgeProgress, 0, 1) || (settlement.bridge && settlement.bridgeProgress !== 1) || !inRange(settlement.legitimacy, 0, 1) || !isInteger(settlement.population) || settlement.population < 0 || !isInteger(settlement.households) || settlement.households < 0 || !isInteger(settlement.migrants)) {
      throw new Error("Invalid basin save: malformed settlement.");
    }
  }

  const householdIds = new Set<string>();
  for (const home of state.households) {
    if (!home || typeof home.id !== "string" || !home.id || householdIds.has(home.id) || !settlementIds.has(home.settlementId) || !validLivelihood(home.livelihood) || !isInteger(home.parcelId) || home.parcelId < 0 || home.parcelId >= state.world.cells.length || !validStocks(home.stocks) || !isFiniteNumber(home.coin) || home.coin < 0 || !isInteger(home.size) || home.size <= 0 || !inRange(home.wellbeing, 0, 1) || !inRange(home.hardship, 0, 12) || !isInteger(home.lastMoved) || home.lastMoved > state.season) throw new Error("Invalid basin save: malformed household.");
    householdIds.add(home.id);
  }

  for (const settlement of state.settlements) {
    const homes = state.households.filter((home) => home.settlementId === settlement.id);
    const population = homes.reduce((total, home) => total + home.size, 0);
    if (settlement.households !== homes.length || settlement.population !== population) throw new Error("Invalid basin save: settlement totals do not match households.");
    for (const good of GOODS) {
      const stock = round(homes.reduce((total, home) => total + home.stocks[good], 0));
      if (Math.abs(settlement.stocks[good] - stock) > 0.001) throw new Error("Invalid basin save: settlement stocks do not match households.");
    }
  }

  const routeIds = new Set<string>();
  const routePairs = new Set<string>();
  if (state.routes.length !== state.settlements.length * (state.settlements.length - 1) / 2) throw new Error("Invalid basin save: route network is incomplete.");
  for (const route of state.routes) {
    if (!route || typeof route.id !== "string" || !route.id || routeIds.has(route.id) || !settlementIds.has(route.from) || !settlementIds.has(route.to) || route.from === route.to || !Array.isArray(route.cells) || route.cells.length < 2 || route.cells.some((cell) => !isInteger(cell) || cell < 0 || cell >= state.world!.cells.length) || !isFiniteNumber(route.distance) || route.distance !== route.cells.length - 1 || !isInteger(route.travelSeasons) || route.travelSeasons < 1 || route.travelSeasons > 3 || !isFiniteNumber(route.capacity) || route.capacity < 0 || !isFiniteNumber(route.traded) || route.traded < 0 || route.traded > route.capacity || typeof route.bridge !== "boolean") throw new Error("Invalid basin save: malformed route.");
    const from = state.settlements.find((settlement) => settlement.id === route.from)!;
    const to = state.settlements.find((settlement) => settlement.id === route.to)!;
    if (route.cells[0] !== from.z * state.world.width + from.x || route.cells.at(-1) !== to.z * state.world.width + to.x) throw new Error("Invalid basin save: route endpoints do not match settlements.");
    if (route.cells.some((cell, index) => index > 0 && Math.abs(cell % state.world!.width - route.cells[index - 1]! % state.world!.width) + Math.abs(Math.floor(cell / state.world!.width) - Math.floor(route.cells[index - 1]! / state.world!.width)) !== 1)) throw new Error("Invalid basin save: route contains a disconnected path.");
    const pair = [route.from, route.to].sort().join("|");
    if (routePairs.has(pair)) throw new Error("Invalid basin save: duplicate route endpoints.");
    routePairs.add(pair);
    routeIds.add(route.id);
  }

  const shipmentIds = new Set<number>();
  for (const shipment of state.shipments) {
    const route = state.routes.find((candidate) => candidate.id === shipment?.routeId);
    if (!shipment || !isInteger(shipment.id) || shipment.id < 1 || shipmentIds.has(shipment.id) || !settlementIds.has(shipment.from) || !settlementIds.has(shipment.to) || shipment.from === shipment.to || typeof shipment.buyerId !== "string" || !householdIds.has(shipment.buyerId) || !validGood(shipment.good) || !isFiniteNumber(shipment.amount) || shipment.amount <= 0 || !isInteger(shipment.arrival) || shipment.arrival <= state.season || !route || !((route.from === shipment.from && route.to === shipment.to) || (route.to === shipment.from && route.from === shipment.to))) throw new Error("Invalid basin save: malformed shipment.");
    shipmentIds.add(shipment.id);
  }

  const eventIds = new Set<number>();
  if (state.events.length > 120) throw new Error("Invalid basin save: event history exceeds its retention limit.");
  for (const event of state.events) {
    if (!event || !isInteger(event.id) || event.id < 1 || eventIds.has(event.id) || !isInteger(event.season) || event.season < 0 || event.season > state.season || !EVENT_KINDS.includes(event.kind) || (event.settlementId !== null && !settlementIds.has(event.settlementId)) || typeof event.message !== "string" || !isRecord(event.causes) || Object.values(event.causes).some((cause) => !isFiniteNumber(cause))) throw new Error("Invalid basin save: malformed event.");
    eventIds.add(event.id);
  }

  let previousSeason = Math.max(-1, state.season - state.history.length);
  for (const entry of state.history) {
    if (!entry || !isInteger(entry.season) || entry.season < 0 || entry.season > state.season || entry.season !== previousSeason + 1 || !isInteger(entry.population) || entry.population < 0 || !isFiniteNumber(entry.food) || entry.food < 0 || !isFiniteNumber(entry.trade) || entry.trade < 0 || !inRange(entry.wellbeing, 0, 1) || (entry.foodPrice !== undefined && (!isFiniteNumber(entry.foodPrice) || entry.foodPrice < 0)) || (entry.migration !== undefined && (!isInteger(entry.migration) || entry.migration < 0)) || (entry.forest !== undefined && !inRange(entry.forest, 0, 1))) throw new Error("Invalid basin save: malformed history entry.");
    previousSeason = entry.season;
  }
  if (!state.history.length || state.history.length > 160 || state.history.at(-1)!.season !== state.season) throw new Error("Invalid basin save: incomplete history.");

  if (state.archive !== undefined) {
    const archive = state.archive;
    if (!archive || !isInteger(archive.stride) || archive.stride < 4 || !Number.isInteger(Math.log2(archive.stride)) || !Array.isArray(archive.entries) || archive.entries.length > 512) throw new Error("Invalid basin save: malformed history archive.");
    let previous = -1;
    for (const entry of archive.entries) {
      if (!entry || !isInteger(entry.season) || entry.season <= previous || entry.season > state.season || entry.season % archive.stride !== 0 || !isInteger(entry.population) || entry.population < 0 || !isFiniteNumber(entry.food) || entry.food < 0 || !isFiniteNumber(entry.trade) || entry.trade < 0 || !inRange(entry.wellbeing, 0, 1) || (entry.foodPrice !== undefined && (!isFiniteNumber(entry.foodPrice) || entry.foodPrice < 0)) || (entry.migration !== undefined && (!isInteger(entry.migration) || entry.migration < 0)) || (entry.forest !== undefined && !inRange(entry.forest, 0, 1))) throw new Error("Invalid basin save: malformed archived observation.");
      previous = entry.season;
    }
  }

  if (state.interventions.length > 80) throw new Error("Invalid basin save: intervention history exceeds its retention limit.");
  let previousInterventionSeason = -1;
  for (const intervention of state.interventions) {
    if (!intervention || !isInteger(intervention.season) || intervention.season < 0 || intervention.season > state.season || !isRecord(intervention.action)) throw new Error("Invalid basin save: malformed intervention.");
    const action = intervention.action;
    const valid = action.type === "drought" ? isInteger(action.duration) && action.duration >= 1 && action.duration <= 24
      : action.type === "bridge" ? typeof action.settlementId === "string" && settlementIds.has(action.settlementId)
      : action.type === "tax" ? typeof action.settlementId === "string" && settlementIds.has(action.settlementId) && inRange(action.rate, 0, 0.5)
      : false;
    if (!valid) throw new Error("Invalid basin save: malformed intervention.");
    if (intervention.season < previousInterventionSeason) throw new Error("Invalid basin save: interventions are out of order.");
    previousInterventionSeason = intervention.season;
  }

  const maxEventId = Math.max(0, ...eventIds);
  const maxShipmentId = Math.max(0, ...shipmentIds);
  if (state.nextEventId <= maxEventId || state.nextShipmentId <= maxShipmentId) throw new Error("Invalid basin save: counters do not follow existing IDs.");
}

/**
 * A deliberately small material simulation.  Settlement stock fields are
 * recomputed observations; household holdings and shipments are authoritative.
 */
export class BasinEngine {
  private simulation: BasinState;

  constructor(seed = 1337, parameters?: BasinParameters) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be an integer from 0 to 4294967295.");
    if (parameters) validateParameters(parameters);
    const world = generateBasin(seed);
    const random = new SeededRandom(seed ^ 0x9e3779b9);
    const settlements: Settlement[] = world.settlements.map((place, index) => ({
      id: place.id,
      name: place.name,
      x: place.x,
      z: place.z,
      specialty: place.specialty,
      taxRate: round(0.045 + index * 0.025),
      treasury: 16 + index * 3,
      bridge: false,
      bridgeProgress: 0,
      legitimacy: 0.62,
      population: 0,
      households: 0,
      stocks: zero(),
      prices: { food: 1, timber: 0.8, tools: 1.6 },
      production: zero(),
      consumption: zero(),
      imports: zero(),
      exports: zero(),
      migrants: 0,
    }));
    const parcels = new Map<string, number[]>();
    for (const place of settlements) {
      const near = world.cells
        .filter((cell) => cell.settlementId === place.id || Math.abs(cell.x - place.x) + Math.abs(cell.z - place.z) <= 5)
        .sort((a, b) => (b.fertility + b.forest + b.moisture) - (a.fertility + a.forest + a.moisture) || a.id - b.id)
        .map((cell) => cell.id);
      parcels.set(place.id, near.length ? near : world.cells.slice(0, 1).map((cell) => cell.id));
    }
    const households: Household[] = [];
    for (let placeIndex = 0; placeIndex < settlements.length; placeIndex += 1) {
      const settlement = settlements[placeIndex]!;
      const legacyCount = 34 + Math.floor(random.next() * 3);
      const count = parameters?.householdsPerSettlement ?? legacyCount;
      const parcelIds = parcels.get(settlement.id)!;
      for (let index = 0; index < count; index += 1) {
        const livelihood: Livelihood = index % 10 < 6 ? "farmer" : index % 10 < 8 ? "woodcutter" : "toolmaker";
        households.push({
          id: `${settlement.id}-h${index + 1}`,
          settlementId: settlement.id,
          size: 2 + Math.floor(random.next() * 3),
          livelihood,
          parcelId: parcelIds[index % parcelIds.length]!,
          stocks: { food: round((8 + random.next() * 7) * (parameters?.startingFood ?? 1)), timber: round(2 + random.next() * 3), tools: round(0.8 + random.next() * 1.2) },
          coin: round(8 + random.next() * 10),
          wellbeing: 0.66,
          hardship: 0,
          lastMoved: -20,
        });
      }
    }
    this.simulation = {
      schema: "tiny-civilization.basin/v1",
      seed,
      ...(parameters ? { parameters: { ...parameters } } : {}),
      season: 0,
      world,
      households,
      settlements,
      routes: [],
      shipments: [],
      droughtUntil: 0,
      events: [],
      history: [],
      archive: { stride: 4, entries: [] },
      interventions: [],
      nextEventId: 1,
      nextShipmentId: 1,
    };
    this.refreshObservations();
    this.simulation.routes = buildRoutes(this.simulation.world, this.simulation.settlements);
    this.recordHistory();
  }

  get state(): Readonly<BasinState> { return this.simulation; }

  advance(seasons = 1): Readonly<BasinState> {
    if (!Number.isSafeInteger(seasons) || seasons < 0 || !Number.isSafeInteger(this.simulation.season + seasons)) throw new Error("Seasons must be a nonnegative safe integer.");
    const turns = seasons;
    for (let index = 0; index < turns; index += 1) this.advanceOne();
    return this.simulation;
  }

  intervene(action: BasinIntervention): void {
    let applied: BasinIntervention;
    if (action.type === "drought") {
      const duration = clamp(Math.floor(action.duration), 1, 24);
      this.simulation.droughtUntil = Math.max(this.simulation.droughtUntil, this.simulation.season + duration);
      this.event("weather", null, "Drought reduces water and harvests.", { duration });
      applied = { type: "drought", duration };
    } else if (action.type === "tax") {
      const settlement = this.settlement(action.settlementId);
      if (!settlement) return;
      settlement.taxRate = round(clamp(action.rate, 0, 0.5));
      this.event("policy", settlement.id, "The market tax rate changed.", { rate: settlement.taxRate });
      applied = { type: "tax", settlementId: settlement.id, rate: settlement.taxRate };
    } else {
      const settlement = this.settlement(action.settlementId);
      if (!settlement || settlement.bridge || settlement.bridgeProgress > 0) return;
      settlement.bridgeProgress = 0.001;
      this.event("works", settlement.id, "Council opened a bridge funding request.", { treasury: settlement.treasury });
      applied = { type: "bridge", settlementId: settlement.id };
    }
    this.simulation.interventions.push({ season: this.simulation.season, action: applied });
    if (this.simulation.interventions.length > 80) this.simulation.interventions.splice(0, this.simulation.interventions.length - 80);
  }

  export(): string { return JSON.stringify(this.simulation); }

  static restore(json: string): BasinEngine {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { throw new Error("Invalid basin save: malformed JSON."); }
    validateSave(parsed);
    const engine = Object.create(BasinEngine.prototype) as BasinEngine;
    engine.simulation = parsed;
    return engine;
  }

  private advanceOne(): void {
    const state = this.simulation;
    state.season += 1;
    for (const settlement of state.settlements) {
      settlement.production = zero(); settlement.consumption = zero(); settlement.imports = zero(); settlement.exports = zero(); settlement.migrants = 0;
    }
    this.deliverShipments();
    const drought = state.season <= state.droughtUntil;
    this.produce(drought);
    this.localMarkets();
    this.publicWorks();
    this.ecologyRegeneration(drought);
    this.refreshObservations();
    state.routes = buildRoutes(state.world, state.settlements).map((route) => ({ ...route, traded: 0 }));
    this.regionalTrade();
    this.migrate();
    this.refreshObservations();
    this.recordHistory();
  }

  private produce(drought: boolean): void {
    const parameters = this.simulation.parameters ?? DEFAULT_PARAMETERS;
    const cellById = new Map(this.simulation.world.cells.map((cell) => [cell.id, cell]));
    for (const household of this.simulation.households) {
      const settlement = this.settlement(household.settlementId)!;
      const parcel = cellById.get(household.parcelId) ?? this.simulation.world.cells[0]!;
      const toolFactor = 0.55 + Math.min(0.45, household.stocks.tools * 0.14);
      const dryness = drought ? 0.56 : 1;
      let amount = 0;
      if (household.livelihood === "farmer") {
        amount = (3.3 + parcel.fertility * 4.2 + parcel.moisture * 2.1) * toolFactor * dryness * parameters.cropYield;
        household.stocks.food = round(household.stocks.food + amount);
        settlement.production.food = round(settlement.production.food + amount);
      } else if (household.livelihood === "woodcutter") {
        amount = (1.4 + parcel.forest * 4.7) * toolFactor * (drought ? 0.82 : 1);
        amount = Math.min(amount, parcel.forest * 6 + 0.3);
        parcel.forest = clamp(round(parcel.forest - amount * 0.012), 0, 1);
        household.stocks.timber = round(household.stocks.timber + amount);
        settlement.production.timber = round(settlement.production.timber + amount);
      } else {
        const input = Math.min(household.stocks.timber, 1.3);
        amount = input * (0.55 + toolFactor * 0.35);
        household.stocks.timber = round(household.stocks.timber - input);
        household.stocks.tools = round(household.stocks.tools + amount);
        settlement.production.tools = round(settlement.production.tools + amount);
      }
      household.stocks.tools = round(Math.max(0, household.stocks.tools - (0.045 + amount * 0.004)));
      const need = household.size * 0.75;
      const eaten = Math.min(need, household.stocks.food);
      household.stocks.food = round(household.stocks.food - eaten);
      settlement.consumption.food = round(settlement.consumption.food + eaten);
      const shortage = 1 - eaten / need;
      household.hardship = round(clamp(household.hardship * 0.76 + shortage * 1.15 + (drought ? 0.035 : 0), 0, 12));
      household.wellbeing = round(clamp(household.wellbeing * 0.82 + (1 - shortage) * 0.15 - (drought ? 0.015 : 0), 0, 1));
      this.chooseLivelihood(household, settlement, parcel);
    }
  }

  private chooseLivelihood(household: Household, settlement: Settlement, parcel: { fertility: number; forest: number; moisture: number }): void {
    const foodNeed = household.stocks.food < household.size * 2.2 ? 2.5 : 0;
    const timberNeed = household.stocks.timber < 1.4 ? 0.7 : 0;
    const toolNeed = household.stocks.tools < 0.45 ? 0.8 : 0;
    const scores: Record<Livelihood, number> = {
      farmer: parcel.fertility * 1.8 + parcel.moisture + settlement.prices.food * 0.5 + foodNeed + (settlement.specialty === "farmer" ? 0.25 : 0),
      woodcutter: parcel.forest * 2.1 + settlement.prices.timber * 0.5 + timberNeed + (settlement.specialty === "woodcutter" ? 0.25 : 0),
      toolmaker: household.stocks.timber * 0.45 + settlement.prices.tools * 0.7 + toolNeed + (settlement.specialty === "toolmaker" ? 0.25 : 0),
    };
    const current = scores[household.livelihood];
    const next = (Object.keys(scores) as Livelihood[]).sort((a, b) => scores[b] - scores[a] || a.localeCompare(b))[0]!;
    if (next !== household.livelihood && scores[next] > current + 0.65) {
      const from = household.livelihood;
      household.livelihood = next;
      this.event("livelihood", settlement.id, "A household changed work after local prices and needs shifted.", { from: from.length, to: next.length });
    }
  }

  private localMarkets(): void {
    for (const settlement of this.simulation.settlements) {
      const homes = this.homes(settlement.id);
      for (const good of GOODS) {
        const reserve = good === "food" ? 2.5 : good === "timber" ? 1.2 : 0.35;
        const buyers = homes.filter((home) => home.stocks[good] < (good === "food" ? home.size * reserve : reserve)).sort((a, b) => a.id.localeCompare(b.id));
        const sellers = homes.filter((home) => home.stocks[good] > (good === "food" ? home.size * (reserve + 1.5) : reserve + 1)).sort((a, b) => b.stocks[good] - a.stocks[good] || a.id.localeCompare(b.id));
        for (const buyer of buyers) {
          let wanted = Math.max(0, (good === "food" ? buyer.size * reserve : reserve) - buyer.stocks[good]);
          for (const seller of sellers) {
            if (wanted <= 0 || buyer.coin <= 0) break;
            const surplus = Math.max(0, seller.stocks[good] - (good === "food" ? seller.size * (reserve + 1.5) : reserve + 1));
            const price = settlement.prices[good];
            const amount = Math.min(wanted, surplus, buyer.coin / price);
            if (amount <= 0.001) continue;
            this.transfer(seller, buyer, settlement, good, amount, price);
            wanted -= amount;
          }
        }
      }
    }
  }

  private publicWorks(): void {
    for (const settlement of this.simulation.settlements) {
      if (settlement.bridge || settlement.bridgeProgress <= 0) {
        // Ordinary works are intentionally material: they purchase household
        // output, then consume it maintaining paths and common structures.
        if (settlement.treasury >= 36) {
          const timberSeller = this.bestSeller(settlement.id, "timber", 1.1, 1);
          const toolSeller = this.bestSeller(settlement.id, "tools", 0.3, 0.2);
          if (timberSeller && toolSeller) {
            const cost = settlement.prices.timber + settlement.prices.tools * 0.2;
            timberSeller.stocks.timber = round(timberSeller.stocks.timber - 1);
            toolSeller.stocks.tools = round(toolSeller.stocks.tools - 0.2);
            settlement.treasury = round(settlement.treasury - cost);
            timberSeller.coin = round(timberSeller.coin + settlement.prices.timber);
            toolSeller.coin = round(toolSeller.coin + settlement.prices.tools * 0.2);
            this.event("works", settlement.id, "Treasury bought materials for common maintenance.", { cost, treasury: settlement.treasury });
          }
        }
        continue;
      }
      const timberCost = 2.2;
      const toolCost = 0.45;
      const timberSeller = this.bestSeller(settlement.id, "timber", 1.1, timberCost);
      const toolSeller = this.bestSeller(settlement.id, "tools", 0.3, toolCost);
      if (!timberSeller || !toolSeller) continue;
      const cost = timberCost * settlement.prices.timber + toolCost * settlement.prices.tools;
      if (settlement.treasury + 0.0001 < cost) continue;
      timberSeller.stocks.timber = round(timberSeller.stocks.timber - timberCost);
      toolSeller.stocks.tools = round(toolSeller.stocks.tools - toolCost);
      settlement.treasury = round(settlement.treasury - cost);
      timberSeller.coin = round(timberSeller.coin + timberCost * settlement.prices.timber);
      toolSeller.coin = round(toolSeller.coin + toolCost * settlement.prices.tools);
      settlement.bridgeProgress = round(settlement.bridgeProgress + 0.14);
      this.event("works", settlement.id, "Treasury purchased materials for bridge construction.", { cost, progress: settlement.bridgeProgress });
      if (settlement.bridgeProgress >= 1) {
        settlement.bridge = true;
        settlement.bridgeProgress = 1;
        this.event("works", settlement.id, "The funded bridge opened to traffic.", { treasury: settlement.treasury });
      }
    }
  }

  private ecologyRegeneration(drought: boolean): void {
    const parameters = this.simulation.parameters ?? DEFAULT_PARAMETERS;
    for (const cell of this.simulation.world.cells) {
      cell.forest = clamp(round(cell.forest + (drought ? 0.003 : 0.012) * (0.35 + cell.moisture) * parameters.forestGrowth), 0, 1);
      cell.fertility = clamp(round(cell.fertility + (drought ? -0.004 : 0.003) * (0.4 + cell.moisture)), 0.05, 1);
      cell.moisture = clamp(round(cell.moisture + (cell.river ? 0.012 : 0.004) * parameters.rainfall - (drought ? 0.04 : 0.008)), 0.03, 1);
    }
  }

  private regionalTrade(): void {
    for (const route of this.simulation.routes.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const directions = [[route.from, route.to], [route.to, route.from]] as const;
      for (const [fromId, toId] of directions) {
        const source = this.settlement(fromId)!;
        const destination = this.settlement(toId)!;
        const destinationHomes = this.homes(destination.id);
        for (const good of GOODS) {
          if (route.traded >= route.capacity) break;
          const seller = this.bestSeller(source.id, good, good === "food" ? 3.2 : good === "timber" ? 1.5 : 0.45);
          const buyer = destinationHomes.filter((home) => home.coin > 0).sort((a, b) => a.id.localeCompare(b.id))[0];
          const desired = good === "food" ? buyer && buyer.size * 3.4 : good === "timber" ? 2.2 : 0.8;
          const target = buyer && buyer.stocks[good] < desired;
          if (!seller || !buyer || !target) continue;
          const reserve = good === "food" ? seller.size * 3.2 : good === "timber" ? 1.5 : 0.45;
          const price = round((source.prices[good] + destination.prices[good]) / 2);
          const amount = Math.min(route.capacity - route.traded, Math.max(0, seller.stocks[good] - reserve), 3.5, buyer.coin / price);
          if (amount <= 0.001) continue;
          seller.stocks[good] = round(seller.stocks[good] - amount);
          const payment = round(amount * price);
          buyer.coin = round(buyer.coin - payment);
          const tax = round(payment * source.taxRate);
          seller.coin = round(seller.coin + payment - tax);
          source.treasury = round(source.treasury + tax);
          source.exports[good] = round(source.exports[good] + amount);
          destination.imports[good] = round(destination.imports[good] + amount);
          route.traded = round(route.traded + amount);
          this.simulation.shipments.push({ id: this.simulation.nextShipmentId++, from: source.id, to: destination.id, buyerId: buyer.id, good, amount: round(amount), arrival: this.simulation.season + Math.max(1, route.travelSeasons), routeId: route.id });
          this.event("trade", source.id, "Cargo departed after a paid regional sale.", { amount, price, tax, travel: route.travelSeasons });
        }
      }
    }
  }

  private deliverShipments(): void {
    const pending: Shipment[] = [];
    for (const shipment of this.simulation.shipments) {
      if (shipment.arrival > this.simulation.season) { pending.push(shipment); continue; }
      const buyer = this.simulation.households.find((home) => home.id === shipment.buyerId);
      if (buyer) buyer.stocks[shipment.good] = round(buyer.stocks[shipment.good] + shipment.amount);
      this.event("trade", buyer?.settlementId ?? shipment.to, buyer ? "Cargo reached its buyer after regional transit." : "Unclaimed cargo reached its destination market.", { amount: shipment.amount, travel: 0 });
    }
    this.simulation.shipments = pending;
  }

  private migrate(): void {
    for (const home of this.simulation.households.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (home.hardship < 3.5 || this.simulation.season - home.lastMoved < 8) continue;
      const current = this.settlement(home.settlementId)!;
      const destinations = this.simulation.settlements
        .filter((place) => place.id !== current.id && this.homes(place.id).length < 39)
        .sort((a, b) => this.foodPerPerson(b.id) - this.foodPerPerson(a.id) || a.id.localeCompare(b.id));
      const destination = destinations[0];
      if (!destination || this.foodPerPerson(destination.id) < this.foodPerPerson(current.id) + 0.4) continue;
      const parcel = this.simulation.world.cells
        .filter((cell) => cell.settlementId === destination.id || Math.abs(cell.x - destination.x) + Math.abs(cell.z - destination.z) <= 5)
        .sort((a, b) => (b.fertility + b.moisture) - (a.fertility + a.moisture) || a.id - b.id)[0];
      if (!parcel) continue;
      home.settlementId = destination.id;
      home.parcelId = parcel.id;
      home.lastMoved = this.simulation.season;
      home.hardship = round(home.hardship * 0.35);
      destination.migrants += 1;
      current.migrants -= 1;
      this.event("migration", destination.id, "A whole household resettled after sustained hardship.", { size: home.size, hardship: home.hardship });
    }
  }

  private transfer(seller: Household, buyer: Household, settlement: Settlement, good: Good, amount: number, price: number): void {
    const payment = round(amount * price);
    seller.stocks[good] = round(seller.stocks[good] - amount);
    buyer.stocks[good] = round(buyer.stocks[good] + amount);
    buyer.coin = round(buyer.coin - payment);
    const tax = round(payment * settlement.taxRate);
    seller.coin = round(seller.coin + payment - tax);
    settlement.treasury = round(settlement.treasury + tax);
  }

  private refreshObservations(): void {
    for (const settlement of this.simulation.settlements) {
      const homes = this.homes(settlement.id);
      settlement.households = homes.length;
      settlement.population = homes.reduce((total, home) => total + home.size, 0);
      settlement.stocks = homes.reduce((total, home) => {
        for (const good of GOODS) total[good] += home.stocks[good];
        return total;
      }, zero());
      for (const good of GOODS) {
        settlement.stocks[good] = round(settlement.stocks[good]);
        const perHouse = settlement.stocks[good] / Math.max(1, homes.length);
        const target = good === "food" ? 9 : good === "timber" ? 3 : 1;
        settlement.prices[good] = round(clamp(0.35 + target / Math.max(0.5, perHouse), 0.35, 8));
      }
      const wellbeing = homes.length ? homes.reduce((sum, home) => sum + home.wellbeing, 0) / homes.length : 0;
      settlement.legitimacy = round(clamp(settlement.legitimacy * 0.94 + wellbeing * 0.055 + (settlement.treasury > 3 ? 0.008 : -0.008), 0, 1));
    }
  }

  private recordHistory(): void {
    const homes = this.simulation.households;
    const population = homes.reduce((total, home) => total + home.size, 0);
    const food = homes.reduce((total, home) => total + home.stocks.food, 0) + this.simulation.shipments.filter((shipment) => shipment.good === "food").reduce((total, shipment) => total + shipment.amount, 0);
    const trade = this.simulation.routes.reduce((total, route) => total + route.traded, 0);
    const wellbeing = homes.length ? homes.reduce((total, home) => total + home.wellbeing, 0) / homes.length : 0;
    const foodPrice = this.simulation.settlements.reduce((total, settlement) => total + settlement.prices.food, 0) / Math.max(1, this.simulation.settlements.length);
    const migration = this.simulation.settlements.reduce((total, settlement) => total + Math.max(0, settlement.migrants), 0);
    const forest = this.simulation.world.cells.reduce((total, cell) => total + cell.forest, 0) / Math.max(1, this.simulation.world.cells.length);
    this.simulation.history.push({
      season: this.simulation.season,
      population,
      food: round(food),
      trade: round(trade),
      wellbeing: round(wellbeing),
      foodPrice: round(foodPrice),
      migration,
      forest: round(forest),
    });
    const archive = this.simulation.archive ??= { stride: 4, entries: [] };
    if (this.simulation.season % archive.stride === 0) {
      archive.entries.push({ ...this.simulation.history.at(-1)! });
      if (archive.entries.length > 512) {
        archive.stride *= 2;
        archive.entries = archive.entries.filter((entry) => entry.season % archive.stride === 0);
      }
    }
    if (this.simulation.history.length > 160) this.simulation.history.splice(0, this.simulation.history.length - 160);
  }

  private event(kind: BasinEvent["kind"], settlementId: string | null, message: string, causes: Record<string, number>): void {
    this.simulation.events.push({ id: this.simulation.nextEventId++, season: this.simulation.season, kind, settlementId, message, causes: Object.fromEntries(Object.entries(causes).map(([key, value]) => [key, round(value)])) });
    if (this.simulation.events.length > 120) this.simulation.events.splice(0, this.simulation.events.length - 120);
  }

  private homes(id: string): Household[] { return this.simulation.households.filter((home) => home.settlementId === id); }
  private settlement(id: string): Settlement | undefined { return this.simulation.settlements.find((settlement) => settlement.id === id); }
  private foodPerPerson(id: string): number {
    const homes = this.homes(id);
    return homes.reduce((total, home) => total + home.stocks.food, 0) / Math.max(1, homes.reduce((total, home) => total + home.size, 0));
  }
  private bestSeller(settlementId: string, good: Good, reserve: number, purchase = 0): Household | undefined {
    return this.homes(settlementId)
      .filter((home) => home.stocks[good] + 0.0001 >= reserve + purchase)
      .sort((a, b) => b.stocks[good] - a.stocks[good] || a.id.localeCompare(b.id))[0];
  }
}
