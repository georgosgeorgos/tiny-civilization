export type HouseholdResident = {
  id: string;
  regionId: string;
  homeKey: string;
  age: number;
  role: string;
  seed: number;
};

export type HouseholdContext = {
  id: string;
  food: number;
  housing: number;
  mood: number;
};

export type HouseholdMetrics = {
  households: number;
  dependents: number;
  workers: number;
  cohesion: number;
  inequality: number;
  laborReadiness: number;
  birthReadiness: number;
  migrationPressure: number;
  vulnerableResidentId: string | null;
};

type Household = {
  id: string;
  regionId: string;
  members: string[];
  wealth: number;
  cohesion: number;
  rememberedHardship: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * A sampled household layer over visible residents. It is intentionally small:
 * households preserve savings and remembered shocks, then aggregate their
 * needs into labor, birth, and migration pressures for the main simulation.
 */
export class HouseholdSystem {
  private readonly households = new Map<string, Household>();
  private readonly residents = new Map<string, HouseholdResident>();

  advance(residents: readonly HouseholdResident[], contexts: readonly HouseholdContext[], years: number): ReadonlyMap<string, HouseholdMetrics> {
    this.reconcile(residents);
    const byRegion = new Map<string, Household[]>();
    for (const household of this.households.values()) {
      const group = byRegion.get(household.regionId) ?? [];
      group.push(household);
      byRegion.set(household.regionId, group);
    }
    const result = new Map<string, HouseholdMetrics>();
    for (const context of contexts) {
      const group = byRegion.get(context.id) ?? [];
      const members = group.flatMap((household) => household.members.map((id) => this.residents.get(id)).filter((resident): resident is HouseholdResident => Boolean(resident)));
      const workers = members.filter((resident) => resident.age >= 16 && resident.age < 64).length;
      const dependents = members.length - workers;
      const foodPerPerson = context.food / Math.max(1, members.length);
      const housingSecurity = clamp(context.housing / Math.max(1, members.length));
      const foodSecurity = clamp(foodPerPerson / 2.6);
      const socialSecurity = clamp(context.mood / 100);
      for (const household of group) {
        const householdMembers = household.members.map((id) => this.residents.get(id)).filter((resident): resident is HouseholdResident => Boolean(resident));
        const householdWorkers = householdMembers.filter((resident) => resident.age >= 16 && resident.age < 64).length;
        const burden = householdMembers.length - householdWorkers;
        const security = foodSecurity * 0.5 + housingSecurity * 0.2 + socialSecurity * 0.3;
        household.wealth = Math.max(0, household.wealth + years * (householdWorkers * (0.5 + security) - burden * 0.32 - (1 - foodSecurity) * householdMembers.length * 0.45));
        household.rememberedHardship = clamp(household.rememberedHardship + years * ((1 - security) * 0.38 - household.rememberedHardship * 0.08));
        household.cohesion = clamp(household.cohesion + years * (security * 0.12 - household.rememberedHardship * 0.1));
      }
      const wealths = group.map((household) => household.wealth).sort((a, b) => a - b);
      const meanWealth = wealths.reduce((sum, value) => sum + value, 0) / Math.max(1, wealths.length);
      const spread = wealths.length > 1 ? (wealths.at(-1)! - wealths[0]!) / Math.max(1, meanWealth * 3) : 0;
      const cohesion = group.reduce((sum, household) => sum + household.cohesion, 0) / Math.max(1, group.length);
      const hardship = group.reduce((sum, household) => sum + household.rememberedHardship, 0) / Math.max(1, group.length);
      const vulnerable = group
        .flatMap((household) => household.members.map((id) => ({ id, score: household.rememberedHardship * 0.7 + (1 - household.cohesion) * 0.3 })))
        .sort((a, b) => b.score - a.score)[0]?.id ?? null;
      result.set(context.id, {
        households: group.length,
        dependents,
        workers,
        cohesion,
        inequality: clamp(spread),
        laborReadiness: clamp(0.55 + cohesion * 0.32 + foodSecurity * 0.2 - hardship * 0.2),
        birthReadiness: clamp(foodSecurity * 0.45 + housingSecurity * 0.3 + cohesion * 0.25 - hardship * 0.22),
        migrationPressure: clamp(hardship * 0.48 + (1 - housingSecurity) * 0.2 + (1 - foodSecurity) * 0.25 + spread * 0.15),
        vulnerableResidentId: vulnerable,
      });
    }
    return result;
  }

  private reconcile(residents: readonly HouseholdResident[]): void {
    this.residents.clear();
    const wanted = new Map<string, string[]>();
    for (const resident of residents) {
      this.residents.set(resident.id, resident);
      const householdId = `${resident.regionId}:${resident.homeKey}`;
      const members = wanted.get(householdId) ?? [];
      members.push(resident.id);
      wanted.set(householdId, members);
    }
    for (const [id, members] of wanted) {
      const sample = this.residents.get(members[0] ?? "");
      if (!sample) continue;
      const prior = this.households.get(id);
      this.households.set(id, prior ?? {
        id, regionId: sample.regionId, members: [], wealth: 3 + sample.seed * 12, cohesion: 0.46 + sample.seed * 0.22, rememberedHardship: 0,
      });
      const household = this.households.get(id)!;
      household.members = members;
    }
    for (const id of this.households.keys()) if (!wanted.has(id)) this.households.delete(id);
  }
}
