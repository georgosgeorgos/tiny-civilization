import type { SimulationConfig } from "../config.ts";
import type { SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

/**
 * The complete, portable starting contract for a world. It deliberately holds
 * no wall-clock timestamp or random ID: the same manifest is the same run.
 */
export type WorldManifest = {
  schema: "tiny-civilization.world/v1";
  modelVersion: string;
  id: string;
  config: SimulationConfig;
  directives: string[];
};

export type ExperimentCheckpoint = {
  year: number;
  snapshot: SimulationSnapshot;
};

export type ChronicleEventKind =
  | "observation"
  | "directive"
  | "discovery"
  | "construction"
  | "founding"
  | "migration"
  | "trade"
  | "culture"
  | "collapse"
  | "renewal"
  | "weather"
  | "milestone";

export type ChronicleEvent = {
  id: number;
  day: number;
  year: number;
  kind: ChronicleEventKind;
  message: string;
  /** Region identifiers affected by the event; player is always explicit. */
  regions: string[];
  metrics: { population: number; food: number; gold: number; knowledge: number; towns: number };
};

/** All non-world inputs needed to replay one headless research run. */
export type ExperimentDefinition = {
  stores: Stores;
  knowledge: number;
  inputs: Omit<SimulationInputs, "deltaDays">;
  years: number;
  checkpointEvery: number;
};

export function createWorldManifest(config: SimulationConfig, directives: readonly string[] = []): WorldManifest {
  const stableConfig = structuredClone(config);
  const id = [stableConfig.seed, stableConfig.archetype, stableConfig.origin, stableConfig.temperament].join("-");
  return {
    schema: "tiny-civilization.world/v1",
    modelVersion: "research-foundation-1",
    id: `world-${id}`,
    config: stableConfig,
    directives: [...directives],
  };
}

/** A compact reusable shape for exports and batch experiment records. */
export type ExperimentRecord = {
  manifest: WorldManifest;
  definition: ExperimentDefinition;
  events: ChronicleEvent[];
  checkpoints: ExperimentCheckpoint[];
};

export function serializeExperiment(record: ExperimentRecord): string {
  return JSON.stringify(record, null, 2);
}
