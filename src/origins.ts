import type { BuildingId } from "./buildings";
import type { Origin } from "./config";

export type OriginProfile = {
  title: string;
  premise: string;
  foundations: BuildingId[];
  storeBonus: { gold: number; food: number; wood: number };
  knowledgeFloor: number;
  startingMood: number;
  production: { food: number; wood: number; gold: number };
  moodPressure: number;
};

/** Origins are policies and material inheritances, not cosmetic presets. */
export const ORIGIN_PROFILES: Record<Origin, OriginProfile> = {
  camp: {
    title: "Frontier camp",
    premise: "A small mobile society learns directly from a demanding landscape.",
    foundations: ["hut", "hut", "farm", "lumber", "fishery"],
    storeBonus: { gold: 0, food: 0, wood: 0 }, knowledgeFloor: 0, startingMood: 52,
    production: { food: 0.92, wood: 1.08, gold: 0.82 }, moodPressure: 0.03,
  },
  farmers: {
    title: "Farmers’ village",
    premise: "Food security and inherited land practices support a dense, rooted community.",
    foundations: ["hut", "hut", "hut", "hut", "farm", "farm", "farm", "orchard", "lumber", "fishery"],
    storeBonus: { gold: 18, food: 36, wood: 14 }, knowledgeFloor: 18, startingMood: 61,
    production: { food: 1.18, wood: 0.94, gold: 0.84 }, moodPressure: 0.07,
  },
  city: {
    title: "Established city",
    premise: "A wealthy civic center begins with institutions, inequality, and high expectations.",
    foundations: ["hut", "hut", "hut", "hut", "hut", "hut", "farm", "farm", "orchard", "lumber", "fishery", "market", "shrine", "mine", "forge"],
    storeBonus: { gold: 110, food: 70, wood: 42 }, knowledgeFloor: 110, startingMood: 46,
    production: { food: 0.94, wood: 0.88, gold: 1.28 }, moodPressure: -0.08,
  },
  spacecraft: {
    title: "Deep-space habitat",
    premise: "A closed life-support system turns material maintenance and research into survival.",
    foundations: ["hut", "hut", "hut", "hut", "hut", "hut", "farm", "farm", "orchard", "fishery", "mine", "market", "shrine", "forge"],
    storeBonus: { gold: 160, food: 90, wood: 64 }, knowledgeFloor: 220, startingMood: 55,
    production: { food: 1.08, wood: 1.12, gold: 1.3 }, moodPressure: 0.02,
  },
};

export function originProfile(origin: Origin): OriginProfile {
  return ORIGIN_PROFILES[origin];
}
