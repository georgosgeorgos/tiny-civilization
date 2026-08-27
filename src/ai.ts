import type { LandKind } from "./world";
import { BUILDINGS, type BuildingId } from "./buildings";
import { priorityBuildings, type Directive } from "./directive";

export type CivCounts = Record<BuildingId, number>;

export type CivSnapshot = {
  food: number;
  gold: number;
  wood: number;
  mood: number;
  people: number;
  housing: number;
  counts: CivCounts;
  buildingTotal: number;
};

export function emptyCounts(): CivCounts {
  const counts = {} as CivCounts;
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) counts[id] = 0;
  return counts;
}

export function eraName(people: number, buildings: number): string {
  if (people < 3 || buildings < 2) return "Camp";
  if (people < 8) return "Hamlet";
  if (people < 16) return "Village";
  if (people < 28) return "Town";
  return "City";
}

export function chooseNextBuilding(
  snap: CivSnapshot,
  canBuild: (id: BuildingId) => boolean,
  directive: Directive = "balanced",
): BuildingId | null {
  const { food, gold, wood, mood, people, housing, counts, buildingTotal } = snap;
  if (buildingTotal >= 56) return null;

  const pick = (ids: BuildingId[]): BuildingId | null => {
    for (const id of ids) {
      const def = BUILDINGS[id];
      if (!canBuild(id)) continue;
      if (gold < def.goldCost || wood < def.woodCost) continue;
      return id;
    }
    return null;
  };

  const hungry = people > 0 && food < people * 1.8;
  if (!hungry && directive !== "balanced") {
    const priority = pick(priorityBuildings(directive));
    if (priority) return priority;
  }
  if (hungry) {
    const id = pick(["fishery", "orchard", "farm", "lumber"]);
    if (id) return id;
  }
  if (people === 0 || housing === 0) {
    const id = pick(["hut"]);
    if (id) return id;
  }
  if (wood < 6) {
    const id = pick(["lumber", "orchard"]);
    if (id) return id;
  }
  if (people >= housing + 1 && !hungry) {
    const id = pick(["hut"]);
    if (id) return id;
  }
  if (gold < 14) {
    const id = pick(["lumber", "market", "mine", "fishery"]);
    if (id) return id;
  }
  if (mood < 40) {
    const id = pick(["shrine", "market"]);
    if (id) return id;
  }
  if (counts.farm + counts.fishery + counts.orchard < Math.ceil(people / 3)) {
    const id = pick(["farm", "fishery", "orchard"]);
    if (id) return id;
  }
  if (counts.lumber === 0) {
    const id = pick(["lumber"]);
    if (id) return id;
  }
  if (people >= 4 && counts.market === 0) {
    const id = pick(["market"]);
    if (id) return id;
  }
  if (people >= 6 && counts.orchard === 0) {
    const id = pick(["orchard"]);
    if (id) return id;
  }
  if (people >= 8 && counts.shrine === 0) {
    const id = pick(["shrine"]);
    if (id) return id;
  }
  if (people >= 10 && counts.forge === 0) {
    const id = pick(["forge", "mine"]);
    if (id) return id;
  }
  if (counts.mine === 0) {
    const id = pick(["mine", "forge"]);
    if (id) return id;
  }
  if (housing - people < 2) {
    const id = pick(["hut"]);
    if (id) return id;
  }
  return pick(["fishery", "farm", "orchard", "lumber", "market", "hut", "shrine", "forge", "mine"]);
}

export const SOCIETY_NAMES: Record<LandKind, string> = {
  home: "Home",
  continent: "Hill Tribes",
  volcano: "Ashfolk",
  jungle: "Palm Kin",
  desert: "Dune Camp",
  swamp: "Reedfolk",
  tundra: "Ice Hearth",
  crystal: "Gleam Clan",
  ruins: "Old Wall",
  mesa: "Red Mesa",
  atoll: "Lagoon Kin",
  isles: "Scatterfolk",
  metro: "Glassport",
  harbor: "Red Wharf",
};

export const SOCIETY_PLANS: Partial<Record<LandKind, BuildingId[]>> = {
  jungle: ["hut", "hut", "orchard", "lumber", "shrine", "market"],
  desert: ["hut", "hut", "fishery", "market", "shrine"],
  swamp: ["hut", "hut", "lumber", "fishery", "shrine"],
  tundra: ["hut", "hut", "fishery", "shrine"],
  volcano: ["hut", "hut", "fishery", "mine", "forge", "shrine"],
  crystal: ["hut", "hut", "fishery", "mine", "shrine", "market"],
  ruins: ["hut", "hut", "farm", "market", "shrine"],
  mesa: ["hut", "hut", "fishery", "mine", "forge"],
  atoll: ["hut", "hut", "fishery", "fishery", "shrine"],
  isles: ["hut", "fishery", "lumber"],
  continent: ["hut", "hut", "farm", "lumber", "market", "shrine"],
  metro: ["hut", "hut", "market", "fishery", "forge", "shrine"],
  harbor: ["hut", "hut", "fishery", "market", "forge", "lumber"],
};
