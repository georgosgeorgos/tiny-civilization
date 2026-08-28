import type { BuildingId } from "../buildings.ts";
import { SeededRandom } from "./random.ts";
import { CellularEcology } from "./cellular.ts";
import { evolveSociety } from "./evolution.ts";
import { createCulture, evolveCulture } from "./culture.ts";
import { ClimateSystem } from "./climate.ts";
import { evolveInstitutions, institutionEffects } from "./institutions.ts";
import { evolveInnovations, innovationEffects } from "./innovation.ts";
import type { Demographics, Ecology, OriginCrisis, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

const DAYS_PER_YEAR = 12;
const LOCAL_STEP_DAYS = 1 / 8;
const REMOTE_STEP_DAYS = 1;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class SimulationEngine {
  private accumulator = 0;
  private readonly random: SeededRandom;
  private readonly cells: CellularEcology;
  private readonly climate: ClimateSystem;
  private state: SimulationSnapshot;

  constructor(seed: number, stores: Stores, knowledge = 0) {
    this.random = new SeededRandom(seed);
    this.cells = new CellularEcology(seed);
    this.climate = new ClimateSystem(seed);
    this.state = {
      elapsedDays: 0,
      stores: { ...stores },
      ecology: { soil: 0.92, forest: 0.88, fish: 0.9, water: 0.76, minerals: 0.72, disease: 0.04 },
      demographics: { children: 0, adults: 0, elders: 0 },
      health: 0.72,
      stability: 0.62,
      knowledge,
      birthReadiness: 0,
      mortalityRisk: 0,
      lastFlow: { food: 0, wood: 0, gold: 0 },
      cropHealth: 0.86,
      seasonalStress: 0,
      habitatDiversity: 0.7,
      settlementFootprint: 0,
      era: "Camp",
      populationCapacity: 1,
      populationTrend: 0,
      institutionalStrength: 0,
      migrationPressure: 0,
      culture: createCulture(seed),
      climate: this.climate.current,
      institutions: { forms: [], legitimacy: 0.38, commonReserve: 0, inequality: 0.1 },
      innovations: { techniques: [], provenance: {} },
      originCrisis: null,
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
    const stepDays = inputs.fidelity === "remote" ? REMOTE_STEP_DAYS : LOCAL_STEP_DAYS;
    while (this.accumulator >= stepDays) {
      this.step(inputs, stepDays);
      this.accumulator -= stepDays;
    }
    return this.state;
  }

  /**
   * A stable long-horizon projection for observer requests such as "show one
   * million years". It intentionally converges recurring systems instead of
   * replaying millions of daily random events.
   */
  advanceYears(inputs: SimulationInputs, years: number): Readonly<SimulationSnapshot> {
    const span = Math.max(0, Math.min(1_000_000_000, years));
    if (span === 0) return this.state;
    this.reconcilePopulation(inputs.population);
    const infrastructure = clamp01(
      inputs.infrastructure.roads * 0.035 + inputs.infrastructure.ports * 0.07 + inputs.infrastructure.tradeRoutes * 0.16,
    );
    const institutionRules = institutionEffects(this.state.institutions);
    const innovationRules = innovationEffects(this.state.innovations);
    const recoveryYears = Math.min(span, 80);
    const climate = this.climate.advance(span);
    this.updateEcology(inputs.buildings, inputs.disruption, recoveryYears, climate);
    const foodNeed = inputs.population * 1.5;
    const crisisRules = this.crisisRules();
    const foodProduction = inputs.annualProduction.food * institutionRules.labor * innovationRules.food * crisisRules.food * this.state.ecology.soil * (0.36 + this.state.ecology.water * 0.28 + this.state.cropHealth * 0.2 + climate.rainfall * 0.16);
    const spoilage = this.state.stores.food * 0.018 * (1 - infrastructure * 0.48) * (1 - institutionRules.spoilageProtection);
    const maintenance = this.totalBuildings(inputs.buildings) * 0.08 * (1 - infrastructure * 0.16);
    const annualFlow = {
      food: foodProduction - foodNeed - spoilage,
      wood: inputs.annualProduction.wood * innovationRules.extraction - maintenance,
      gold: inputs.annualProduction.gold * innovationRules.trade * innovationRules.extraction - maintenance * 0.35,
    };
    const reserve = Math.max(8, inputs.population * (2.5 + infrastructure * 4));
    this.state.stores.food = annualFlow.food >= 0 ? Math.min(1_000_000_000, reserve + annualFlow.food * Math.min(span, 12)) : 0;
    this.state.stores.wood = Math.max(0, Math.min(1_000_000_000, this.state.stores.wood + annualFlow.wood * span));
    this.state.stores.gold = Math.max(0, Math.min(1_000_000_000, this.state.stores.gold + annualFlow.gold * span));
    this.state.lastFlow = annualFlow;

    const foodSecurity = clamp01(this.state.stores.food / Math.max(2, inputs.population * 2.5) + institutionRules.foodSecurity);
    const crowding = inputs.population > inputs.housing ? 0.18 : 0;
    const disaster = (inputs.disruption === "none" ? 0 : inputs.disruption === "storm" ? 0.04 : 0.09) + climate.drought * 0.04 + climate.floodRisk * 0.025;
    const healthTarget = clamp01(0.32 + foodSecurity * 0.62 + infrastructure * 0.045 - crowding - disaster - this.state.ecology.disease * 0.28);
    const stabilityTarget = clamp01(this.state.stability + inputs.moodPressure * 0.22 + infrastructure * 0.12 + institutionRules.stability - crowding - disaster * 0.75);
    const convergence = 1 - Math.exp(-span * 0.45);
    this.state.health += (healthTarget - this.state.health) * convergence;
    this.state.stability += (stabilityTarget - this.state.stability) * convergence;
    this.state.cropHealth += (clamp01(0.78 + this.state.ecology.soil * 0.28 - disaster * 1.8) - this.state.cropHealth) * convergence;
    this.state.birthReadiness = clamp01((this.state.health - 0.5) * 1.8 + (this.state.stability - 0.5) * 0.35);
    this.state.mortalityRisk = clamp01((0.42 - this.state.health) * 2.2 + (1 - foodSecurity) * 0.55 + disaster * 1.6);
    const civicWorks = inputs.buildings.market + inputs.buildings.shrine + inputs.buildings.forge;
    this.state.knowledge = Math.min(1_000_000_000, this.state.knowledge + (inputs.population * 0.22 + civicWorks * 1.6) * institutionRules.knowledgeMultiplier * innovationRules.knowledge * crisisRules.knowledge * span * (0.65 + this.state.stability * 0.5));
    this.state.seasonalStress = clamp01(disaster * 0.7 + (1 - foodSecurity) * 0.3);
    this.state.climate = climate;
    this.updateCulture(inputs, span);
    this.updateInstitutions(inputs, span);
    this.updateInnovations(inputs);
    this.updateEvolution(inputs);
    this.state.elapsedDays += span * DAYS_PER_YEAR;
    this.resolveOriginCrisis(inputs);
    return this.state;
  }

  private step(inputs: SimulationInputs, stepDays: number): void {
    const yearPart = stepDays / DAYS_PER_YEAR;
    this.reconcilePopulation(inputs.population);
    const climate = this.climate.advance(stepDays);
    const foodNeed = inputs.population * 1.5 * yearPart;
    const infrastructure = clamp01(
      inputs.infrastructure.roads * 0.035 + inputs.infrastructure.ports * 0.07 + inputs.infrastructure.tradeRoutes * 0.16,
    );
    const institutionRules = institutionEffects(this.state.institutions);
    const innovationRules = innovationEffects(this.state.innovations);
    const crisisRules = this.crisisRules();
    // Better-connected settlements move and preserve staples more reliably, without tracking every cart.
    const spoilage = this.state.stores.food * 0.018 * yearPart * (1 - infrastructure * 0.48) * (1 - institutionRules.spoilageProtection);
    const maintenance = this.totalBuildings(inputs.buildings) * 0.08 * yearPart * (1 - infrastructure * 0.16);
    const cropTarget = clamp01(
      0.58 + this.state.ecology.soil * 0.25 + climate.rainfall * 0.28 - (inputs.disruption === "drought" ? 0.38 : 0) - (inputs.disruption === "flood" ? 0.16 : 0),
    );
    this.state.cropHealth += (cropTarget - this.state.cropHealth) * Math.min(1, stepDays * 0.1);
    const production = {
      food: inputs.annualProduction.food * institutionRules.labor * innovationRules.food * crisisRules.food * this.state.ecology.soil * (0.36 + this.state.ecology.water * 0.28 + this.state.cropHealth * 0.2 + climate.rainfall * 0.16) * yearPart,
      wood: inputs.annualProduction.wood * innovationRules.extraction * this.state.ecology.forest * yearPart,
      gold: inputs.annualProduction.gold * innovationRules.trade * innovationRules.extraction * yearPart,
    };
    this.state.lastFlow = {
      food: production.food - foodNeed - spoilage,
      wood: production.wood - maintenance,
      gold: production.gold - maintenance * 0.35,
    };
    this.state.stores.food = Math.max(0, this.state.stores.food + this.state.lastFlow.food);
    this.state.stores.wood = Math.max(0, this.state.stores.wood + this.state.lastFlow.wood);
    this.state.stores.gold = Math.max(0, this.state.stores.gold + this.state.lastFlow.gold);

    const foodSecurity = clamp01(this.state.stores.food / Math.max(2, inputs.population * 2.5) + institutionRules.foodSecurity);
    const crowding = inputs.population > inputs.housing ? 0.18 : 0;
    const disaster = (inputs.disruption === "none" ? 0 : inputs.disruption === "storm" ? 0.04 : 0.09) + climate.drought * 0.04 + climate.floodRisk * 0.025;
    const healthTarget = clamp01(0.32 + foodSecurity * 0.62 + infrastructure * 0.045 + institutionRules.stability * 0.08 - crowding - disaster - this.state.ecology.disease * 0.28);
    this.state.health += (healthTarget - this.state.health) * Math.min(1, 0.16 * stepDays);
    const noise = (this.random.next() - 0.5) * 0.012 * Math.sqrt(stepDays);
    this.state.stability = clamp01(this.state.stability + (inputs.moodPressure * 0.015 + infrastructure * 0.008 - crowding * 0.08 - disaster * 0.12) * stepDays + noise);
    const spareHousing = inputs.housing <= 0 ? 0 : clamp01((inputs.housing - inputs.population) / Math.max(2, inputs.housing));
    this.state.birthReadiness = clamp01((this.state.health - 0.5) * 1.8 + spareHousing * 0.65 + (this.state.stability - 0.5) * 0.35);
    this.state.mortalityRisk = clamp01((0.42 - this.state.health) * 2.2 + (1 - foodSecurity) * 0.55 + disaster * 1.6);

    this.state.seasonalStress = clamp01(this.state.seasonalStress + (disaster * 0.5 + (1 - foodSecurity) * 0.08 - 0.035) * stepDays);
    this.updateEcology(inputs.buildings, inputs.disruption, stepDays, climate);
    this.state.climate = climate;
    const civicWorks = inputs.buildings.market + inputs.buildings.shrine + inputs.buildings.forge;
    this.state.knowledge += (inputs.population * 0.22 + civicWorks * 1.6) * institutionRules.knowledgeMultiplier * innovationRules.knowledge * crisisRules.knowledge * yearPart * (0.65 + this.state.stability * 0.5);
    this.updateCulture(inputs, yearPart);
    this.updateInstitutions(inputs, yearPart);
    this.updateInnovations(inputs);
    this.updateEvolution(inputs);
    this.state.elapsedDays += stepDays;
    this.resolveOriginCrisis(inputs);
  }

  private updateEcology(buildings: Record<BuildingId, number>, disruption: SimulationInputs["disruption"], stepDays: number, climate = this.state.climate): void {
    const ecology: Ecology = this.state.ecology;
    const cellular = this.cells.advance(buildings, disruption, stepDays, this.state.culture.traits, climate);
    ecology.soil = cellular.soil;
    ecology.forest = cellular.forest;
    ecology.fish = cellular.fish;
    ecology.water = cellular.water;
    ecology.minerals = cellular.minerals;
    ecology.disease = cellular.disease;
    this.state.habitatDiversity = cellular.habitatDiversity;
    this.state.settlementFootprint = cellular.settlementFootprint;
  }

  private reconcilePopulation(total: number): void {
    const demographics: Demographics = this.state.demographics;
    demographics.children = Math.round(total * 0.22);
    demographics.elders = Math.round(total * 0.12);
    demographics.adults = Math.max(0, total - demographics.children - demographics.elders);
  }

  private updateEvolution(inputs: SimulationInputs): void {
    const evolution = evolveSociety({
      knowledge: this.state.knowledge,
      health: this.state.health,
      stability: this.state.stability,
      ecology: this.state.ecology,
      landscape: {
        soil: this.state.ecology.soil,
        forest: this.state.ecology.forest,
        fish: this.state.ecology.fish,
        water: this.state.ecology.water,
        minerals: this.state.ecology.minerals,
        disease: this.state.ecology.disease,
        habitatDiversity: this.state.habitatDiversity,
        settlementFootprint: this.state.settlementFootprint,
      },
      stores: this.state.stores,
      culture: this.state.culture,
      inputs,
    });
    this.state.era = evolution.era;
    this.state.populationCapacity = evolution.populationCapacity;
    this.state.populationTrend = evolution.populationTrend;
    this.state.institutionalStrength = evolution.institutionalStrength;
    this.state.migrationPressure = evolution.migrationPressure;
  }

  private updateCulture(inputs: SimulationInputs, elapsedYears: number): void {
    this.state.culture = evolveCulture(this.state.culture, {
      elapsedDays: this.state.elapsedDays,
      ecology: this.state.ecology,
      landscape: {
        soil: this.state.ecology.soil,
        forest: this.state.ecology.forest,
        fish: this.state.ecology.fish,
        water: this.state.ecology.water,
        minerals: this.state.ecology.minerals,
        disease: this.state.ecology.disease,
        habitatDiversity: this.state.habitatDiversity,
        settlementFootprint: this.state.settlementFootprint,
      },
      stores: this.state.stores,
      health: this.state.health,
      stability: this.state.stability,
      inputs,
    }, this.random, elapsedYears);
  }

  private updateInstitutions(inputs: SimulationInputs, elapsedYears: number): void {
    this.state.institutions = evolveInstitutions(this.state.institutions, {
      inputs, culture: this.state.culture, stores: this.state.stores, health: this.state.health, stability: this.state.stability,
    }, elapsedYears);
  }

  private updateInnovations(inputs: SimulationInputs): void {
    this.state.innovations = evolveInnovations(this.state.innovations, {
      inputs, ecology: this.state.ecology, culture: this.state.culture, knowledge: this.state.knowledge,
    });
  }

  private crisisRules(): { food: number; knowledge: number } {
    const outcome = this.state.originCrisis?.outcome;
    if (outcome === "seasonal diaspora") return { food: 0.92, knowledge: 1.14 };
    if (outcome === "soil covenant") return { food: 1.12, knowledge: 1.04 };
    if (outcome === "fortified quarters") return { food: 0.94, knowledge: 0.94 };
    if (outcome === "civic reform") return { food: 1.03, knowledge: 1.12 };
    if (outcome === "emergency rationing") return { food: 0.88, knowledge: 1.06 };
    if (outcome === "redundant loop") return { food: 1.08, knowledge: 1.15 };
    return { food: 1, knowledge: 1 };
  }

  private resolveOriginCrisis(inputs: SimulationInputs): void {
    if (this.state.originCrisis || !inputs.origin || this.state.elapsedDays < 36 * DAYS_PER_YEAR) return;
    const origin = inputs.origin;
    let outcome: string;
    if (origin === "camp") outcome = this.state.ecology.soil < 0.7 || this.state.stores.food < inputs.population * 2 ? "seasonal diaspora" : "border commons";
    else if (origin === "farmers") outcome = this.state.ecology.soil < 0.76 || this.state.ecology.water < 0.5 ? "soil covenant" : "new fields";
    else if (origin === "city") outcome = this.state.stability < 0.64 || this.state.institutions.inequality > 0.35 ? "civic reform" : "fortified quarters";
    else outcome = this.state.health < 0.68 || this.state.stores.wood < inputs.population * 5 ? "emergency rationing" : "redundant loop";
    const crisis: OriginCrisis = { origin, outcome, year: Math.floor(this.state.elapsedDays / DAYS_PER_YEAR) };
    this.state.originCrisis = crisis;
    this.state.culture = { ...this.state.culture, practices: [...new Set([...this.state.culture.practices, outcome])].sort() };
    if (outcome === "civic reform" || outcome === "soil covenant" || outcome === "redundant loop") this.state.stability = clamp01(this.state.stability + 0.08);
    if (outcome === "fortified quarters" || outcome === "emergency rationing") this.state.stability = clamp01(this.state.stability - 0.06);
  }

  private totalBuildings(buildings: Record<BuildingId, number>): number {
    return Object.values(buildings).reduce((sum, count) => sum + count, 0);
  }
}
