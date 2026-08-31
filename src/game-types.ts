import * as THREE from "three";
import type { BuildingId } from "./buildings";
import type { Biome, LandKind, Terrain } from "./world";
import type { TerritorialClaim } from "./world-state";
import type { PersonRole } from "./models";
import type { BehavioralStrategy } from "./simulation/households";
import type { DevelopmentStage } from "./civilization";
import type { Capabilities, EvolutionEra } from "./simulation/evolution";
import type { CulturalState, CultureTraits } from "./simulation/types";
import type { DiplomaticChannel } from "./simulation/diplomacy";
import type { SimulationConfig } from "./config";

export type Tile = {
  q: number;
  r: number;
  building: BuildingId | null;
  mesh: THREE.Mesh;
  buildingMesh: THREE.Object3D | null;
  decor: THREE.Object3D | null;
  baseY: number;
  scaleY: number;
  topMat: THREE.MeshStandardMaterial;
  baseTop: THREE.Color;
  biome: Biome;
  terrain: Terrain;
  buildable: boolean;
  coast: boolean;
  wooded: boolean;
  owner: "player" | "tribe" | null;
  territory: TerritorialClaim;
  claimant: string | null;
  contestedWith: string | null;
  kind: LandKind;
  islandId: string;
  buildLeft: number;
  buildTotal: number;
  ready: boolean;
  historyMesh: THREE.Group | null;
};

export type Person = {
  id: string;
  mesh: THREE.Group;
  q: number;
  r: number;
  destQ: number;
  destR: number;
  homeQ: number;
  homeR: number;
  workQ: number;
  workR: number;
  progress: number;
  wait: number;
  speed: number;
  phase: number;
  offset: THREE.Vector3;
  role: PersonRole;
  sleeping: boolean;
  tribe: boolean;
  islandId: string;
  seed: number;
  age: number;
  strategy: BehavioralStrategy;
};

export type Society = {
  islandId: string;
  kind: LandKind;
  name: string;
  gold: number;
  food: number;
  wood: number;
  mood: number;
  stage: DevelopmentStage;
  relation: number;
  knowledge: number;
  populationCapacity: number;
  migrationPressure: number;
  era: EvolutionEra;
  capabilities: Capabilities;
  culture: CulturalState;
  culturalInfluence: Partial<CultureTraits>;
  diplomacy: DiplomaticChannel;
};

export type Critter = {
  mesh: THREE.Group;
  q: number;
  r: number;
  destQ: number;
  destR: number;
  progress: number;
  wait: number;
  speed: number;
  phase: number;
  offset: THREE.Vector3;
};

export type TradeRoute = {
  societyId: string;
  boat: THREE.Group;
  progress: number;
  direction: 1 | -1;
  delivered: boolean;
};

export type CommunicationLink = {
  source: THREE.Vector3;
  destination: THREE.Vector3;
  line: THREE.Line;
  pulse: THREE.Mesh;
  mode: "parley" | "trade";
};

export type District = "homes" | "fields" | "works" | "civic" | "harbor";
export type ObserverLens = "settlement" | "fields" | "citizen" | "society" | "network";
export type ObservatoryView = "world" | "universe" | "subatomic";
export type WorldEvent = "none" | "festival" | "drought" | "ash" | "trade" | "migration" | "flood" | "wildfire";
export type CivilizationGoal = SimulationConfig["goal"] | "knowledge" | "network";

export type CatastropheState = {
  kind: "earthquake" | "eruption" | "meteorite" | "tsunami" | "locusts";
  epicenterQ: number;
  epicenterR: number;
  radius: number;
  intensity: number;
  startDay: number;
  durationDays: number;
  buildingsDestroyed: number;
  resolved: boolean;
} | null;

export type Demographics = { children: number; adults: number; elders: number };

export function computeDemographics(people: readonly Person[]): Demographics {
  let adults = 0;
  let elders = 0;
  for (const person of people) {
    if (person.age >= 65) elders += 1;
    else adults += 1;
  }
  return { children: Math.round(adults * 0.28), adults, elders };
}
