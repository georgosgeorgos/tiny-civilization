import type { GenerativePractice, RegionSimulationInput, RegionSimulationSnapshot, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

export type SimulationRequest =
  | { type: "init"; seed: number; stores: Stores; knowledge: number }
  | { type: "advance"; stores: Stores; inputs: SimulationInputs }
  | { type: "advance-years"; stores: Stores; inputs: SimulationInputs; years: number }
  | { type: "add-practice"; practice: GenerativePractice }
  | { type: "advance-regions"; seed: number; regions: RegionSimulationInput[] }
  | { type: "retire-region"; id: string };

export type SimulationResponse =
  | { type: "snapshot"; snapshot: SimulationSnapshot }
  | { type: "region-snapshots"; snapshots: RegionSimulationSnapshot[] };
