export type BehavioralStrategy = {
  mobility: number;
  reserve: number;
  tradeOpenness: number;
  cooperation: number;
  curiosity: number;
  culturalMobility: number;
  stewardship: number;
  resilience: number;
};

export type HouseholdResident = {
  id: string;
  regionId: string;
  homeKey: string;
  age: number;
  role: string;
  seed: number;
  strategy: BehavioralStrategy;
};

export type HouseholdContext = {
  id: string;
  food: number;
  housing: number;
  mood: number;
  environmentalStress?: number;
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
  strategy: BehavioralStrategy;
  vulnerableResidentId: string | null;
};

type Household = {
  id: string;
  regionId: string;
  members: string[];
  wealth: number;
  cohesion: number;
  rememberedHardship: number;
  strategy: BehavioralStrategy;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const noise = (seed: number, salt: number) => ((Math.sin((seed + salt * 0.137) * 17831.31) * 43758.5453) % 1 + 1) % 1;

export function initialBehavioralStrategy(seed: number): BehavioralStrategy {
  return {
    mobility: 0.25 + noise(seed, 1) * 0.5,
    reserve: 0.25 + noise(seed, 2) * 0.5,
    tradeOpenness: 0.25 + noise(seed, 3) * 0.5,
    cooperation: 0.35 + noise(seed, 4) * 0.3,
    curiosity: 0.3 + noise(seed, 5) * 0.35,
    culturalMobility: 0.28 + noise(seed, 6) * 0.38,
    stewardship: 0.32 + noise(seed, 7) * 0.34,
    resilience: 0.35 + noise(seed, 8) * 0.32,
  };
}

/** Children retain a recognisable family disposition, with small bounded
 * variation. Selection happens later through household outcomes. */
export function inheritBehavioralStrategy(parent: BehavioralStrategy, seed: number): BehavioralStrategy {
  return {
    mobility: clamp(parent.mobility + (noise(seed, 11) - 0.5) * 0.14),
    reserve: clamp(parent.reserve + (noise(seed, 12) - 0.5) * 0.14),
    tradeOpenness: clamp(parent.tradeOpenness + (noise(seed, 13) - 0.5) * 0.14),
    cooperation: clamp(parent.cooperation + (noise(seed, 14) - 0.5) * 0.06),
    curiosity: clamp(parent.curiosity + (noise(seed, 15) - 0.5) * 0.06),
    culturalMobility: clamp(parent.culturalMobility + (noise(seed, 16) - 0.5) * 0.06),
    stewardship: clamp(parent.stewardship + (noise(seed, 17) - 0.5) * 0.06),
    resilience: clamp(parent.resilience + (noise(seed, 18) - 0.5) * 0.06),
  };
}

const blendStrategy = (current: BehavioralStrategy, exemplar: BehavioralStrategy, amount: number): BehavioralStrategy => ({
  mobility: current.mobility + (exemplar.mobility - current.mobility) * amount,
  reserve: current.reserve + (exemplar.reserve - current.reserve) * amount,
  tradeOpenness: current.tradeOpenness + (exemplar.tradeOpenness - current.tradeOpenness) * amount,
  cooperation: current.cooperation + (exemplar.cooperation - current.cooperation) * amount,
  curiosity: current.curiosity + (exemplar.curiosity - current.curiosity) * amount,
  culturalMobility: current.culturalMobility + (exemplar.culturalMobility - current.culturalMobility) * amount,
  stewardship: current.stewardship + (exemplar.stewardship - current.stewardship) * amount,
  resilience: current.resilience + (exemplar.resilience - current.resilience) * amount,
});

const emptyStrategy: BehavioralStrategy = { mobility: 0, reserve: 0, tradeOpenness: 0, cooperation: 0, curiosity: 0, culturalMobility: 0, stewardship: 0, resilience: 0 };

const meanStrategy = (strategies: readonly BehavioralStrategy[]): BehavioralStrategy => {
  const count = Math.max(1, strategies.length);
  return strategies.reduce((mean, strategy) => ({
    mobility: mean.mobility + strategy.mobility / count,
    reserve: mean.reserve + strategy.reserve / count,
    tradeOpenness: mean.tradeOpenness + strategy.tradeOpenness / count,
    cooperation: mean.cooperation + strategy.cooperation / count,
    curiosity: mean.curiosity + strategy.curiosity / count,
    culturalMobility: mean.culturalMobility + strategy.culturalMobility / count,
    stewardship: mean.stewardship + strategy.stewardship / count,
    resilience: mean.resilience + strategy.resilience / count,
  }), { ...emptyStrategy });
};

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
      const environmentalStress = clamp(context.environmentalStress ?? 1 - foodSecurity);
      for (const household of group) {
        const householdMembers = household.members.map((id) => this.residents.get(id)).filter((resident): resident is HouseholdResident => Boolean(resident));
        const householdWorkers = householdMembers.filter((resident) => resident.age >= 16 && resident.age < 64).length;
        const burden = householdMembers.length - householdWorkers;
        const strategy = household.strategy;
        const adaptiveSecurity = clamp(
          foodSecurity * 0.5 + housingSecurity * 0.2 + socialSecurity * 0.3 +
          strategy.reserve * (1 - foodSecurity) * 0.14 +
          strategy.mobility * environmentalStress * 0.12 + strategy.tradeOpenness * socialSecurity * 0.05,
        );
        household.wealth = Math.max(0, household.wealth + years * (householdWorkers * (0.5 + adaptiveSecurity + strategy.tradeOpenness * 0.12) - burden * 0.32 - (1 - foodSecurity) * householdMembers.length * (0.48 - strategy.reserve * 0.1)));
        household.rememberedHardship = clamp(household.rememberedHardship + years * ((1 - adaptiveSecurity) * (0.4 - strategy.reserve * 0.07 - strategy.mobility * environmentalStress * 0.04) - household.rememberedHardship * 0.08));
        household.cohesion = clamp(household.cohesion + years * (adaptiveSecurity * 0.12 - household.rememberedHardship * 0.1 - strategy.mobility * 0.025 + strategy.tradeOpenness * 0.015));
      }
      // Households copy a modest share of the practices that are visibly
      // succeeding locally. There is no global exemplar, so regions can
      // diverge under different ecological and material conditions.
      const exemplar = [...group].sort((left, right) => (right.wealth + right.cohesion * 6) - (left.wealth + left.cohesion * 6))[0];
      if (exemplar) {
        for (const household of group) {
          if (household === exemplar) continue;
          const disadvantage = clamp((exemplar.wealth - household.wealth) / Math.max(4, exemplar.wealth + 4));
          household.strategy = blendStrategy(household.strategy, exemplar.strategy, years * (0.018 + disadvantage * 0.08));
        }
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
        migrationPressure: clamp(hardship * 0.48 + (1 - housingSecurity) * 0.2 + (1 - foodSecurity) * 0.25 + spread * 0.15) * (0.72 + meanStrategy(group.map((household) => household.strategy)).mobility * 0.56),
        strategy: meanStrategy(group.map((household) => household.strategy)),
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
        id, regionId: sample.regionId, members: [], wealth: 3 + sample.seed * 12, cohesion: 0.46 + sample.seed * 0.22, rememberedHardship: 0, strategy: sample.strategy,
      });
      const household = this.households.get(id)!;
      household.members = members;
      household.regionId = sample.regionId;
      // A newcomer retains their family tendency, while a durable household
      // does not instantly discard its accumulated local practice.
      household.strategy = blendStrategy(household.strategy, meanStrategy(members.map((member) => this.residents.get(member)?.strategy).filter((strategy): strategy is BehavioralStrategy => Boolean(strategy))), 0.06);
    }
    for (const id of this.households.keys()) if (!wanted.has(id)) this.households.delete(id);
  }

  strategyFor(residentId: string): BehavioralStrategy | null {
    const resident = this.residents.get(residentId);
    if (!resident) return null;
    const household = this.households.get(`${resident.regionId}:${resident.homeKey}`);
    return household ? { ...household.strategy } : null;
  }

  hardshipFor(residentId: string): number {
    const resident = this.residents.get(residentId);
    if (!resident) return 0;
    const household = this.households.get(`${resident.regionId}:${resident.homeKey}`);
    if (!household) return 0;
    return household.rememberedHardship + (1 - household.cohesion) * 0.24 - household.strategy.reserve * 0.08;
  }
}
