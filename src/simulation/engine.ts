import type { BuildingId } from "../buildings.ts";
import { SeededRandom } from "./random.ts";
import type { Demographics, Ecology, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

const DAYS_PER_YEAR = 12;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class SimulationEngine {
  private accumulator = 0;
  private readonly random: SeededRandom;
  private state: SimulationSnapshot;

  constructor(seed: number, stores: Stores, knowledge = 0) {
    this.random = new SeededRandom(seed);
    this.state = {
      elapsedDays: 0,
      stores: { ...stores },
      ecology: { soil: 0.92, forest: 0.88, fish: 0.9 },
      demographics: { children: 0, adults: 0, elders: 0 },
      health: 0.72,
      stability: 0.62,
      knowledge,
      birthReadiness: 0,
      mortalityRisk: 0,
      lastFlow: { food: 0, wood: 0, gold: 0 },
    };
  }

  get snapshot(): Readonly<SimulationSnapshot> {
    return this.state;
  }

  setStores(stores: Stores): void {
    this.state.stores = { ...stores };
  }

  advance(inputs: SimulationInputs): Readonly<SimulationSnapshot> {
    this.accumulator += Math.max(0, inputs.deltaDays);
    while (this.accumulator >= 1) {
      this.stepDay(inputs);
      this.accumulator -= 1;
    }
    return this.state;
  }

  private stepDay(inputs: SimulationInputs): void {
    const yearPart = 1 / DAYS_PER_YEAR;
    this.reconcilePopulation(inputs.population);
    const foodNeed = inputs.population * 1.5 * yearPart;
    const infrastructure = clamp01(
      inputs.infrastructure.roads * 0.035 + inputs.infrastructure.ports * 0.07 + inputs.infrastructure.tradeRoutes * 0.16,
    );
    // Better-connected settlements move and preserve staples more reliably, without tracking every cart.
    const spoilage = this.state.stores.food * 0.018 * yearPart * (1 - infrastructure * 0.48);
    const maintenance = this.totalBuildings(inputs.buildings) * 0.08 * yearPart * (1 - infrastructure * 0.16);
    const production = {
      food: inputs.annualProduction.food * this.state.ecology.soil * yearPart,
      wood: inputs.annualProduction.wood * this.state.ecology.forest * yearPart,
      gold: inputs.annualProduction.gold * yearPart,
    };
    this.state.lastFlow = {
      food: production.food - foodNeed - spoilage,
      wood: production.wood - maintenance,
      gold: production.gold - maintenance * 0.35,
    };
    this.state.stores.food = Math.max(0, this.state.stores.food + this.state.lastFlow.food);
    this.state.stores.wood = Math.max(0, this.state.stores.wood + this.state.lastFlow.wood);
    this.state.stores.gold = Math.max(0, this.state.stores.gold + this.state.lastFlow.gold);

    const foodSecurity = clamp01(this.state.stores.food / Math.max(2, inputs.population * 2.5));
    const crowding = inputs.population > inputs.housing ? 0.18 : 0;
    const disaster = inputs.disruption === "none" ? 0 : inputs.disruption === "storm" ? 0.04 : 0.09;
    const healthTarget = clamp01(0.32 + foodSecurity * 0.62 + infrastructure * 0.045 - crowding - disaster);
    this.state.health += (healthTarget - this.state.health) * 0.16;
    const noise = (this.random.next() - 0.5) * 0.012;
    this.state.stability = clamp01(this.state.stability + inputs.moodPressure * 0.015 + infrastructure * 0.008 - crowding * 0.08 - disaster * 0.12 + noise);
    const spareHousing = inputs.housing <= 0 ? 0 : clamp01((inputs.housing - inputs.population) / Math.max(2, inputs.housing));
    this.state.birthReadiness = clamp01((this.state.health - 0.5) * 1.8 + spareHousing * 0.65 + (this.state.stability - 0.5) * 0.35);
    this.state.mortalityRisk = clamp01((0.42 - this.state.health) * 2.2 + (1 - foodSecurity) * 0.55 + disaster * 1.6);

    this.updateEcology(inputs.buildings, inputs.disruption);
    const institutions = inputs.buildings.market + inputs.buildings.shrine + inputs.buildings.forge;
    this.state.knowledge += (inputs.population * 0.22 + institutions * 1.6) * yearPart * (0.65 + this.state.stability * 0.5);
    this.state.elapsedDays += 1;
  }

  private updateEcology(buildings: Record<BuildingId, number>, disruption: SimulationInputs["disruption"]): void {
    const ecology: Ecology = this.state.ecology;
    ecology.soil = clamp01(ecology.soil + 0.012 - buildings.farm * 0.0045 - buildings.orchard * 0.0015);
    ecology.forest = clamp01(ecology.forest + 0.009 - buildings.lumber * 0.006 - (disruption === "wildfire" ? 0.08 : 0));
    ecology.fish = clamp01(ecology.fish + 0.011 - buildings.fishery * 0.0055 + (disruption === "storm" ? 0.01 : 0));
    if (disruption === "flood") ecology.soil = clamp01(ecology.soil - 0.025);
    if (disruption === "drought") ecology.soil = clamp01(ecology.soil - 0.04);
  }

  private reconcilePopulation(total: number): void {
    const demographics: Demographics = this.state.demographics;
    demographics.children = Math.round(total * 0.22);
    demographics.elders = Math.round(total * 0.12);
    demographics.adults = Math.max(0, total - demographics.children - demographics.elders);
  }

  private totalBuildings(buildings: Record<BuildingId, number>): number {
    return Object.values(buildings).reduce((sum, count) => sum + count, 0);
  }
}
