import type { BuildingId } from "../buildings.ts";

export type Stores = { food: number; wood: number; gold: number };
export type Ecology = { soil: number; forest: number; fish: number };
export type Demographics = { children: number; adults: number; elders: number };

export type SimulationSnapshot = {
  elapsedDays: number;
  stores: Stores;
  ecology: Ecology;
  demographics: Demographics;
  health: number;
  stability: number;
  knowledge: number;
  lastFlow: Stores;
};

export type SimulationInputs = {
  deltaDays: number;
  population: number;
  housing: number;
  annualProduction: Stores;
  buildings: Record<BuildingId, number>;
  moodPressure: number;
  disruption: "none" | "storm" | "drought" | "flood" | "wildfire" | "ash";
};
