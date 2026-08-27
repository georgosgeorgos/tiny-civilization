import type { SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

export type SimulationRequest =
  | { type: "init"; seed: number; stores: Stores; knowledge: number }
  | { type: "advance"; stores: Stores; inputs: SimulationInputs };

export type SimulationResponse = { type: "snapshot"; snapshot: SimulationSnapshot };
