import type { BuildingId } from "../buildings.ts";
import type { CellularMetrics } from "./cellular.ts";
import type { CulturalState, Ecology, SimulationInputs, Stores } from "./types.ts";

export type EvolutionEra = "Camp" | "Agrarian" | "Maritime" | "Civic" | "Industrial" | "Adaptive" | "Orbital";

export type EvolutionState = {
  era: EvolutionEra;
  populationCapacity: number;
  populationTrend: number;
  institutionalStrength: number;
  migrationPressure: number;
};

type EvolutionContext = {
  knowledge: number;
  health: number;
  stability: number;
  ecology: Ecology;
  landscape: CellularMetrics;
  stores: Stores;
  culture: CulturalState;
  inputs: SimulationInputs;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const count = (buildings: Record<BuildingId, number>, ids: BuildingId[]) => ids.reduce((total, id) => total + buildings[id], 0);

/**
 * Societal phases emerge from food security, institutions, connectivity and
 * ecological condition. These conditions are deliberately independent: a rich
 * mining town can be industrial but fragile, while a stable civic culture may
 * remain small and maritime.
 */
export function evolveSociety(context: EvolutionContext): EvolutionState {
  const { inputs, ecology, landscape, knowledge, health, stability, stores, culture } = context;
  const origin = inputs.origin ?? "camp";
  const foodWorks = count(inputs.buildings, ["farm", "fishery", "orchard"]);
  const institutions = count(inputs.buildings, ["market", "shrine", "forge"]);
  const extractiveWorks = count(inputs.buildings, ["mine", "lumber", "forge"]);
  const connectedness = inputs.infrastructure.roads * 0.06 + inputs.infrastructure.ports * 0.2 + inputs.infrastructure.tradeRoutes * 0.26;
  const irrigation = 0.55 + ecology.water * 0.45;
  const agriculturalInheritance = origin === "farmers" ? 1.18 : origin === "city" ? 0.94 : origin === "spacecraft" ? 1.08 : 0.92;
  const foodPotential = ((inputs.buildings.farm * 7 * ecology.soil * irrigation) + (inputs.buildings.orchard * 9 * ecology.soil * irrigation * 0.92) + inputs.buildings.fishery * 8 * ecology.fish + 1.5) * agriculturalInheritance;
  const foodCapacity = foodPotential / 1.5;
  const populationCapacity = Math.max(1, Math.floor(Math.min(inputs.housing, foodCapacity * (0.62 + health * 0.28 + connectedness * 0.14 + culture.traits.stewardship * 0.08))));
  const foodSecurity = clamp(stores.food / Math.max(2, inputs.population * 2.5), 0, 1);
  const spareCapacity = clamp((populationCapacity - inputs.population) / Math.max(1, populationCapacity), -1, 1);
  const populationTrend =
    inputs.population * (0.016 + health * 0.025 + stability * 0.012) * Math.max(0, spareCapacity) * foodSecurity -
    inputs.population * (Math.max(0, 0.46 - health) * 0.12 + (1 - foodSecurity) * 0.075 + Math.max(0, -spareCapacity) * 0.04 + ecology.disease * 0.05);
  const civicInheritance = origin === "city" ? 0.14 : origin === "spacecraft" ? 0.1 : 0;
  const institutionalStrength = clamp(institutions * 0.14 + connectedness * 0.45 + stability * 0.25 + knowledge / 900 + culture.traits.cooperation * 0.12 + civicInheritance, 0, 1);
  const migrationPressure = clamp(
    (1 - foodSecurity) * 0.5 + Math.max(0, -spareCapacity) * 0.28 + (1 - stability) * 0.16 + landscape.settlementFootprint * 0.12 + culture.traits.mobility * 0.1 - institutionalStrength * 0.2 - culture.traits.resilience * 0.08,
    0,
    1,
  );

  let era: EvolutionEra = "Camp";
  if (foodWorks >= 2 && inputs.population >= 5 && knowledge >= (origin === "farmers" ? 4 : 8)) era = "Agrarian";
  if (era !== "Camp" && inputs.infrastructure.ports + inputs.infrastructure.tradeRoutes >= 1 && inputs.buildings.market >= 1 && knowledge >= 28) era = "Maritime";
  if (institutions >= 2 && inputs.population >= (origin === "city" ? 8 : 12) && stability >= (origin === "city" ? 0.48 : 0.58) && knowledge >= (origin === "city" ? 45 : 70)) era = "Civic";
  if (era === "Civic" && extractiveWorks >= 3 && inputs.buildings.forge >= 1 && knowledge >= 150) era = "Industrial";
  if (era === "Industrial" && institutionalStrength >= 0.72 && landscape.habitatDiversity >= 0.48 && knowledge >= 320) era = "Adaptive";
  if (origin === "spacecraft" && era !== "Adaptive") era = "Orbital";
  return { era, populationCapacity, populationTrend, institutionalStrength, migrationPressure };
}
