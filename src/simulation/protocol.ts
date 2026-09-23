import type { GenerativePractice, RegionSimulationInput, RegionSimulationSnapshot, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

export type RegionalAdvanceRequest = RegionSimulationInput & { storeChange: Stores };

export type SimulationRequest =
  | { type: "init"; seed: number; stores: Stores; knowledge: number }
  | { type: "advance"; storeChange: Stores; inputs: SimulationInputs }
  | { type: "advance-years"; storeChange: Stores; inputs: SimulationInputs; years: number }
  | { type: "add-practice"; practice: GenerativePractice }
  | { type: "advance-regions"; seed: number; regions: RegionalAdvanceRequest[] }
  | { type: "retire-region"; id: string };

export type SimulationResponse =
  | { type: "snapshot"; snapshot: SimulationSnapshot }
  | { type: "region-snapshots"; snapshots: RegionSimulationSnapshot[] };
