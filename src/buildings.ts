import type { Biome } from "./world";
import type { PersonRole } from "./models";

export type BuildingId =
  | "hut"
  | "farm"
  | "mine"
  | "fishery"
  | "lumber"
  | "shrine"
  | "market"
  | "orchard"
  | "forge";

export type BuildingDef = {
  id: BuildingId;
  name: string;
  goldCost: number;
  woodCost: number;
  foodPerYear: number;
  goldPerYear: number;
  woodPerYear: number;
  housing: number;
  happiness: number;
  color: number;
  hint: string;
  biomes: Biome[] | "any";
  workers: number;
  workerRole: PersonRole;
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  hut: {
    id: "hut",
    name: "Hut",
    goldCost: 10,
    woodCost: 2,
    foodPerYear: 0,
    goldPerYear: 0,
    woodPerYear: 0,
    housing: 2,
    happiness: 1,
    color: 0xc4784a,
    hint: "Home for 2",
    biomes: "any",
    workers: 2,
    workerRole: "villager",
  },
  farm: {
    id: "farm",
    name: "Farm",
    goldCost: 12,
    woodCost: 1,
    foodPerYear: 7,
    goldPerYear: 0,
    woodPerYear: 0,
    housing: 0,
    happiness: 0,
    color: 0xd6c25a,
    hint: "Grass · food",
    biomes: ["grass", "plaza", "urban"],
    workers: 1,
    workerRole: "farmer",
  },
  mine: {
    id: "mine",
    name: "Mine",
    goldCost: 18,
    woodCost: 2,
    foodPerYear: 0,
    goldPerYear: 6,
    woodPerYear: 0,
    housing: 0,
    happiness: -1,
    color: 0x8a93a3,
    hint: "Rock / crystal",
    biomes: ["rock", "volcanic", "crystal", "urban"],
    workers: 1,
    workerRole: "miner",
  },
  fishery: {
    id: "fishery",
    name: "Fishery",
    goldCost: 14,
    woodCost: 4,
    foodPerYear: 8,
    goldPerYear: 0,
    woodPerYear: 0,
    housing: 0,
    happiness: 1,
    color: 0x4aa3c8,
    hint: "Sand · fish",
    biomes: ["sand", "desert", "urban"],
    workers: 1,
    workerRole: "fisher",
  },
  lumber: {
    id: "lumber",
    name: "Lumber",
    goldCost: 10,
    woodCost: 0,
    foodPerYear: 0,
    goldPerYear: 0,
    woodPerYear: 5,
    housing: 0,
    happiness: -1,
    color: 0x7a5a32,
    hint: "Grass / jungle",
    biomes: ["grass", "jungle", "swamp"],
    workers: 1,
    workerRole: "woodcutter",
  },
  shrine: {
    id: "shrine",
    name: "Shrine",
    goldCost: 16,
    woodCost: 6,
    foodPerYear: 0,
    goldPerYear: 1,
    woodPerYear: 0,
    housing: 0,
    happiness: 14,
    color: 0xe8d49a,
    hint: "Mood + gold",
    biomes: "any",
    workers: 1,
    workerRole: "keeper",
  },
  market: {
    id: "market",
    name: "Market",
    goldCost: 14,
    woodCost: 3,
    foodPerYear: 0,
    goldPerYear: 5,
    woodPerYear: 0,
    housing: 0,
    happiness: 6,
    color: 0xd4783a,
    hint: "Trade · +gold",
    biomes: ["grass", "sand", "ruin", "desert", "urban", "plaza"],
    workers: 1,
    workerRole: "merchant",
  },
  orchard: {
    id: "orchard",
    name: "Orchard",
    goldCost: 13,
    woodCost: 2,
    foodPerYear: 9,
    goldPerYear: 0,
    woodPerYear: 1,
    housing: 0,
    happiness: 2,
    color: 0x6bb35a,
    hint: "Jungle / grass",
    biomes: ["grass", "jungle", "plaza"],
    workers: 1,
    workerRole: "grower",
  },
  forge: {
    id: "forge",
    name: "Forge",
    goldCost: 20,
    woodCost: 3,
    foodPerYear: 0,
    goldPerYear: 8,
    woodPerYear: 0,
    housing: 0,
    happiness: -2,
    color: 0xc45a3a,
    hint: "Rock / lava",
    biomes: ["rock", "volcanic", "urban"],
    workers: 1,
    workerRole: "smith",
  },
};

export const BUILDING_ORDER: BuildingId[] = [
  "hut",
  "farm",
  "mine",
  "fishery",
  "lumber",
  "shrine",
  "market",
  "orchard",
  "forge",
];

export function biomeAllows(def: BuildingDef, biome: Biome): boolean {
  return def.biomes === "any" || def.biomes.includes(biome);
}
