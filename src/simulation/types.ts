import type { BuildingId } from "../buildings.ts";
import type { Origin } from "../config.ts";
import type { EvolutionEra } from "./evolution.ts";
import type { ClimateForcing } from "./climate.ts";
import type { InstitutionState } from "./institutions.ts";
import type { InnovationState } from "./innovation.ts";

export type Stores = { food: number; wood: number; gold: number };
/** Regional fields derived from the persistent cellular landscape. */
export type Ecology = {
  soil: number;
  forest: number;
  fish: number;
  water: number;
  minerals: number;
  disease: number;
};
export type Demographics = { children: number; adults: number; elders: number };
export type CultureTraits = { cooperation: number; curiosity: number; mobility: number; stewardship: number; resilience: number };
export type LanguageState = {
  family: string;
  dialect: string;
  lexicon: string[];
  /** Higher values preserve local identity and reduce unmediated borrowing. */
  boundary: number;
};
export type CulturalState = {
  lineage: string;
  generation: number;
  traits: CultureTraits;
  /** Practices are discovered from lived conditions and are retained as cultural memory. */
  practices: string[];
  novelty: number;
  language: LanguageState;
};

/** A deterministic early-history fork. It is retained in every checkpoint so
 * an origin's later institutions can be explained by a concrete past crisis. */
export type OriginCrisis = { origin: Origin; outcome: string; year: number };

export type SimulationSnapshot = {
  elapsedDays: number;
  stores: Stores;
  ecology: Ecology;
  demographics: Demographics;
  health: number;
  stability: number;
  knowledge: number;
  birthReadiness: number;
  mortalityRisk: number;
  lastFlow: Stores;
  /** Local crop condition is simulated separately from stored food. */
  cropHealth: number;
  /** A compact measure used when a distant settlement is fast-forwarded. */
  seasonalStress: number;
  /** Aggregate readings from the settlement's cellular landscape. */
  habitatDiversity: number;
  settlementFootprint: number;
  era: EvolutionEra;
  populationCapacity: number;
  populationTrend: number;
  institutionalStrength: number;
  migrationPressure: number;
  culture: CulturalState;
  climate: ClimateForcing;
  institutions: InstitutionState;
  innovations: InnovationState;
  originCrisis: OriginCrisis | null;
};

export type SimulationInputs = {
  deltaDays: number;
  population: number;
  housing: number;
  annualProduction: Stores;
  buildings: Record<BuildingId, number>;
  moodPressure: number;
  /** Aggregate infrastructure keeps the model cheap while giving connected settlements real benefits. */
  infrastructure: { roads: number; ports: number; tradeRoutes: number };
  disruption: "none" | "storm" | "drought" | "flood" | "wildfire" | "ash";
  /** Local settlements receive finer sub-day updates; distant ones use stable fast-forward steps. */
  fidelity?: "local" | "remote";
  /** Ideas arriving through exchange alter tendencies gradually; they never prescribe a decision. */
  culturalInfluence?: Partial<CultureTraits>;
  /** Starting inheritance changes what this society can stabilize and discover. */
  origin?: Origin;
};

export type RegionSimulationInput = {
  id: string;
  stores: Stores;
  knowledge: number;
  inputs: SimulationInputs;
};

export type RegionSimulationSnapshot = { id: string; snapshot: SimulationSnapshot };
