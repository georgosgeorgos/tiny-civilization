import type { BuildingId } from "../buildings.ts";
import type { CellularMetrics } from "./cellular.ts";
import type { InnovationState, Technique } from "./innovation.ts";
import type { CulturalState, Ecology, SimulationInputs, Stores } from "./types.ts";

export type EvolutionEra = "Camp" | "Agrarian" | "Maritime" | "Civic" | "Industrial" | "Adaptive" | "Orbital";

export type Capabilities = {
  agricultural: number;
  maritime: number;
  institutional: number;
  extractive: number;
  ecological: number;
};

export type EvolutionState = {
  era: EvolutionEra;
  capabilities: Capabilities;
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
  innovations: InnovationState;
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

  const has = (t: Technique) => context.innovations.techniques.includes(t);
  const capabilities: Capabilities = {
    agricultural: clamp(foodWorks * 0.15 + ecology.soil * 0.2
      + (has("seed-selection") ? 0.1 : 0) + (has("crop-rotation") ? 0.1 : 0)
      + (has("irrigation") ? 0.12 : 0) + (has("terracing") ? 0.06 : 0), 0, 1),
    maritime: clamp(inputs.infrastructure.ports * 0.2 + inputs.infrastructure.tradeRoutes * 0.2
      + (has("coastal-navigation") ? 0.12 : 0) + (has("sailcraft") ? 0.15 : 0)
      + (has("harbor-engineering") ? 0.1 : 0), 0, 1),
    institutional: clamp(institutions * 0.14 + stability * 0.18 + connectedness * 0.15
      + (has("ledger") ? 0.08 : 0) + (has("codified-law") ? 0.1 : 0)
      + (has("public-archive") ? 0.1 : 0), 0, 1),
    extractive: clamp(extractiveWorks * 0.12 + (has("metallurgy") ? 0.18 : 0)
      + (has("masonry") ? 0.1 : 0) + ecology.minerals * 0.1, 0, 1),
    ecological: clamp(landscape.habitatDiversity * 0.25 + culture.traits.stewardship * 0.2
      + (has("soil-restoration") ? 0.12 : 0) + (has("forestry-management") ? 0.12 : 0)
      + (has("waterworks") ? 0.08 : 0), 0, 1),
  };

  const sorted = Object.entries(capabilities).sort(([, a], [, b]) => b - a);
  const [topCap, topValue] = sorted[0] as [string, number];
  const secondValue = (sorted[1] as [string, number] | undefined)?.[1] ?? 0;
  const gap = topValue - secondValue;
  let era: EvolutionEra = (topValue < 0.25 || gap < 0.05) ? "Camp"
    : topCap === "agricultural" ? "Agrarian"
    : topCap === "maritime" ? "Maritime"
    : topCap === "institutional" ? "Civic"
    : topCap === "extractive" ? "Industrial"
    : topCap === "ecological" ? "Adaptive"
    : "Camp";
  if (origin === "spacecraft") era = "Orbital";
  return { era, capabilities, populationCapacity, populationTrend, institutionalStrength, migrationPressure };
}
