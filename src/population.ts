import type { PersonRole } from "./models.ts";

export type BirthCandidate = {
  tileQ: number;
  tileR: number;
  tribe: boolean;
  islandId: string;
  societyName?: string;
  role: PersonRole;
};

export type DeathRecord = {
  personIndex: number;
  name: string;
};

export type HungerExile = {
  tribe: boolean;
  islandId?: string;
  societyName?: string;
};

export type PopulationContext = {
  playerCitizenCount: number;
  playerHousing: number;
  food: number;
  birthReadiness: number;
  mortalityRisk: number;
  householdBirthReadiness: number;
  societies: ReadonlyMap<string, { islandId: string; name: string; food: number; populationCount: number; housing: number }>;
};

export function shouldBirth(ctx: PopulationContext): BirthCandidate | null {
  if (
    ctx.birthReadiness > 0.34 &&
    ctx.householdBirthReadiness > 0.42 &&
    ctx.playerCitizenCount < ctx.playerHousing &&
    ctx.food > 4
  ) {
    return { tileQ: -1, tileR: -1, tribe: false, islandId: "0,0", role: "villager" };
  }
  for (const society of ctx.societies.values()) {
    if (
      society.food > society.populationCount * 1.7 &&
      society.populationCount < society.housing &&
      society.food > 4
    ) {
      return {
        tileQ: -1,
        tileR: -1,
        tribe: true,
        islandId: society.islandId,
        societyName: society.name,
        role: "villager",
      };
    }
  }
  return null;
}

export function shouldExileHungry(ctx: PopulationContext): HungerExile | null {
  if (ctx.playerCitizenCount > 1 && ctx.mortalityRisk > 0.48) {
    return { tribe: false };
  }
  for (const society of ctx.societies.values()) {
    if (society.populationCount <= 1 || society.food >= 0.5) continue;
    return { tribe: true, islandId: society.islandId, societyName: society.name };
  }
  return null;
}

export function computeDeaths(
  people: readonly { age: number; seed: number; tribe: boolean; islandId: string; name: string }[],
  year: number,
  hash: (a: number, b: number) => number,
): DeathRecord[] {
  const regionPop = new Map<string, number>();
  for (const person of people) {
    const key = person.tribe ? person.islandId : "player";
    regionPop.set(key, (regionPop.get(key) ?? 0) + 1);
  }
  const deaths: DeathRecord[] = [];
  for (let i = 0; i < people.length; i++) {
    const person = people[i]!;
    if (person.age < 78) continue;
    const regionKey = person.tribe ? person.islandId : "player";
    if ((regionPop.get(regionKey) ?? 0) <= 6) continue;
    const mortalityChance = 0.15 + (person.age - 78) * 0.08;
    if (hash(person.seed + year * 0.0037, year) < mortalityChance) {
      deaths.push({ personIndex: i, name: person.name });
      regionPop.set(regionKey, (regionPop.get(regionKey) ?? 1) - 1);
    }
  }
  return deaths;
}
