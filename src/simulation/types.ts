import type { BuildingId } from "../buildings.ts";
import type { Origin } from "../config.ts";
import type { Capabilities, EvolutionEra } from "./evolution.ts";
import type { ClimateForcing } from "./climate.ts";
import type { InstitutionState } from "./institutions.ts";
import type { InnovationState } from "./innovation.ts";
import type { CellularCheckpoint } from "./cellular.ts";

export type Stores = { food: number; wood: number; gold: number };

export type ResourceBreakdown = {
  production: number;
  consumption: number;
  spoilage: number;
  maintenance: number;
};
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
export type PracticeEffects = {
  soil: number;
  forest: number;
  food: number;
  water: number;
  knowledge: number;
  stability: number;
};

export type GenerativePractice = {
  id: string;
  effects: PracticeEffects;
  name: string;
  parentId: string | null;
  discoveredDay: number;
};

export type CulturalState = {
  lineage: string;
  generation: number;
  traits: CultureTraits;
  /** Practices are generative effect vectors discovered from lived conditions. */
  practices: GenerativePractice[];
  novelty: number;
  language: LanguageState;
};

/** A deterministic early-history fork. It is retained in every checkpoint so
 * an origin's later institutions can be explained by a concrete past crisis. */
export type OriginCrisis = { origin: Origin; outcome: string; year: number };

export type AlienContactPhase = "signal" | "interpretation" | "response" | "resolved";
export type AlienContactOutcome = "observation" | "knowledge-exchange" | "withdrawal";
export type AlienContactState = {
  phase: AlienContactPhase;
  detectedYear: number;
  interpretationProgress: number;
  outcome: AlienContactOutcome | null;
  culturalImpact: number;
};

export type PandemicState = {
  id: number;
  virulence: number;
  transmissibility: number;
  originRegion: string;
  startYear: number;
  affectedRegions: string[];
  resolved: boolean;
};

export type SimulationSnapshot = {
  /** Present on portable checkpoints; omitted on lightweight live readings. */
  continuation?: {
    randomState: number;
    cells: CellularCheckpoint;
    accumulator: number;
    lastPandemicYear: number;
    cultureToEcology: boolean;
  };
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
  flowBreakdown: { food: ResourceBreakdown; wood: ResourceBreakdown; gold: ResourceBreakdown };
  /** Local crop condition is simulated separately from stored food. */
  cropHealth: number;
  /** A compact measure used when a distant settlement is fast-forwarded. */
  seasonalStress: number;
  /** Aggregate readings from the settlement's cellular landscape. */
  habitatDiversity: number;
  settlementFootprint: number;
  era: EvolutionEra;
  capabilities: Capabilities;
  populationCapacity: number;
  populationTrend: number;
  institutionalStrength: number;
  migrationPressure: number;
  culture: CulturalState;
  climate: ClimateForcing;
  institutions: InstitutionState;
  innovations: InnovationState;
  originCrisis: OriginCrisis | null;
  bioculturalDiversity: number;
  practiceVulnerability: Record<string, number>;
  diseaseOutbreak: boolean;
  pandemic: PandemicState | null;
  alienContact: AlienContactState | null;
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
  /** Disease burden imported from connected regions via trade and migration. */
  diseaseImport?: number;
  /** Starting inheritance changes what this society can stabilize and discover. */
  origin?: Origin;
  /** When provided from actual person ages, replaces the flat demographic ratios. */
  demographics?: Demographics;
  /** When provided from per-person cultural weights, overrides engine trait evolution. */
  aggregateTraits?: CultureTraits;
  /** When false, cultural practices do not modify ecological recovery (ablation switch). */
  cultureToEcology?: boolean;
  /** When false, ecological conditions do not gate practice discovery (ablation switch). */
  ecologyToCulture?: boolean;
};

export type RegionSimulationInput = {
  id: string;
  stores: Stores;
  knowledge: number;
  inputs: SimulationInputs;
};

export type RegionSimulationSnapshot = { id: string; snapshot: SimulationSnapshot };
