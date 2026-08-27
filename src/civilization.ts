import type { BuildingId } from "./buildings";
import type { LandKind } from "./world";

export type DevelopmentStage = "Camp" | "Hamlet" | "Village" | "Town" | "City";

const STAGES: DevelopmentStage[] = ["Camp", "Hamlet", "Village", "Town", "City"];

const UNLOCKS: Record<DevelopmentStage, BuildingId[]> = {
  Camp: ["hut", "farm", "fishery", "lumber"],
  Hamlet: ["hut", "farm", "fishery", "lumber", "orchard", "market"],
  Village: ["hut", "farm", "fishery", "lumber", "orchard", "market", "shrine", "mine"],
  Town: ["hut", "farm", "fishery", "lumber", "orchard", "market", "shrine", "mine", "forge"],
  City: ["hut", "farm", "fishery", "lumber", "orchard", "market", "shrine", "mine", "forge"],
};

export function developmentStage(people: number, buildings: number): DevelopmentStage {
  if (people < 3 || buildings < 2) return "Camp";
  if (people < 8) return "Hamlet";
  if (people < 16) return "Village";
  if (people < 28) return "Town";
  return "City";
}

export function isUnlocked(id: BuildingId, people: number, buildings: number): boolean {
  return UNLOCKS[developmentStage(people, buildings)].includes(id);
}

export function nextStage(stage: DevelopmentStage): DevelopmentStage | null {
  return STAGES[STAGES.indexOf(stage) + 1] ?? null;
}

/** Each landform nudges its society toward a distinct economy. */
export function specialtyFor(kind: LandKind): BuildingId | null {
  if (kind === "volcano" || kind === "mesa" || kind === "crystal") return "mine";
  if (kind === "harbor" || kind === "atoll" || kind === "isles") return "fishery";
  if (kind === "jungle" || kind === "swamp") return "lumber";
  if (kind === "desert" || kind === "ruins" || kind === "metro") return "market";
  if (kind === "tundra") return "shrine";
  return "farm";
}
