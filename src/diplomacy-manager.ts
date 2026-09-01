import { advanceWar, computeStrength, createWar, type WarState } from "./simulation/warfare.ts";
import { resolveConflict } from "./simulation/conflict.ts";
import type { SimulationInputs, SimulationSnapshot } from "./simulation/types.ts";

export type WarAction =
  | { type: "escalation"; pairKey: string; war: WarState; aggressorName: string; defenderName: string }
  | { type: "active"; pairKey: string; war: WarState; aggressorName: string; defenderName: string }
  | { type: "resolved"; pairKey: string; war: WarState; aggressorName: string; defenderName: string }
  | { type: "removed"; pairKey: string };

export type ConflictResult = {
  societyId: string;
  societyName: string;
  outcome: string;
  relationDelta: number;
  foodMultiplier: number;
  stabilityDelta: number;
};

export type EscalationCandidate = {
  pairKey: string;
  aggressorId: string;
  defenderId: string;
  war: WarState;
  hintMessage: string;
};

export function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export class DiplomacyManager {
  readonly activeWars = new Map<string, WarState>();
  readonly warCooldown = new Map<string, number>();
  readonly conflictCooldown = new Map<string, number>();

  isAtWar(regionId: string): boolean {
    for (const war of this.activeWars.values()) {
      if (war.phase !== "active") continue;
      if (war.aggressorId === regionId || war.defenderId === regionId) return true;
    }
    return false;
  }

  hasActiveWars(): boolean {
    return this.activeWars.size > 0;
  }

  evaluateConflict(
    societyId: string,
    societyName: string,
    relation: number,
    food: number,
    population: number,
    defense: number,
    diplomacyScore: number,
    contested: number,
    hasPact: boolean,
    year: number,
    hash: (a: number, b: number) => number,
  ): ConflictResult | "split" | null {
    const key = pairKey("player", societyId);
    const cooldownUntil = this.conflictCooldown.get(key) ?? 0;
    if (year < cooldownUntil) return null;

    if (contested > 5) {
      const roll = hash(societyId.length, year);
      const negotiationChance = hasPact ? 0.25 : 0.4;
      if (roll > negotiationChance) {
        this.conflictCooldown.set(key, year + 5);
        return "split";
      }
    }

    const escalationFactor = hasPact ? 0.7 : 1;
    const result = resolveConflict({
      relation,
      scarcity: Math.max(0, 1 - food / Math.max(3, population * 2.5)),
      grievance: Math.max(0, -relation / 45) * escalationFactor + contested * 0.04,
      defense,
      diplomacy: diplomacyScore,
    });
    if (result.outcome === "none") return null;

    return {
      societyId,
      societyName,
      outcome: result.outcome,
      relationDelta: result.relationDelta,
      foodMultiplier: result.foodMultiplier,
      stabilityDelta: result.stabilityDelta,
    };
  }

  checkPlayerWarEscalation(
    societies: ReadonlyMap<string, { islandId: string; name: string; relation: number; diplomacy: { treaty: string | null }; culture: { traits: { cooperation: number } } }>,
    year: number,
  ): EscalationCandidate[] {
    const candidates: EscalationCandidate[] = [];
    for (const society of societies.values()) {
      const key = pairKey("player", society.islandId);
      if (this.activeWars.has(key)) continue;
      const cooldownEnd = this.warCooldown.get(key) ?? 0;
      if (year < cooldownEnd + 30) continue;
      if (society.relation >= -30) continue;
      if (society.diplomacy.treaty === "trade-pact" || society.diplomacy.treaty === "parley") continue;
      if (society.culture.traits.cooperation >= 0.7) continue;
      const war = createWar(society.islandId, "player", year);
      candidates.push({
        pairKey: key,
        aggressorId: society.islandId,
        defenderId: "player",
        war,
        hintMessage: `${society.name} enters a period of escalation; grievances are mounting toward conflict.`,
      });
    }
    return candidates;
  }

  applyEscalation(candidate: EscalationCandidate): void {
    this.activeWars.set(candidate.pairKey, candidate.war);
  }

  advanceAllWars(
    year: number,
    getInputs: () => SimulationInputs,
    getSnapshot: (id: string) => SimulationSnapshot | undefined,
    getSociety: (id: string) => { islandId: string; name: string } | undefined,
    getPopulation: (id: string) => number,
    playerFood: number,
    playerPopulation: number,
    hash: (a: number, b: number) => number,
  ): WarAction[] {
    const actions: WarAction[] = [];
    for (const [key, war] of this.activeWars) {
      const aggSociety = war.aggressorId === "player" ? null : getSociety(war.aggressorId);
      const defSociety = war.defenderId === "player" ? null : getSociety(war.defenderId);
      if (!aggSociety && war.aggressorId !== "player") { this.activeWars.delete(key); actions.push({ type: "removed", pairKey: key }); continue; }
      if (!defSociety && war.defenderId !== "player") { this.activeWars.delete(key); actions.push({ type: "removed", pairKey: key }); continue; }

      const inputs = getInputs();
      const aggSnap = aggSociety ? getSnapshot(aggSociety.islandId) : getSnapshot("player");
      const defSnap = defSociety ? getSnapshot(defSociety.islandId) : getSnapshot("player");
      if (!aggSnap || !defSnap) continue;

      const aggStr = computeStrength(inputs, aggSnap);
      const defStr = computeStrength(inputs, defSnap);
      const pop = aggSociety ? getPopulation(aggSociety.islandId) : playerPopulation;
      const food = aggSociety ? (aggSociety as unknown as { food: number }).food ?? playerFood : playerFood;
      const scarcity = Math.max(0, 1 - food / Math.max(3, pop * 2.5));
      const grievance = aggSociety ? 0.5 : 0.5;
      const warRisk = grievance * 0.48 + scarcity * 0.34;
      const negotiationRoll = hash(key.length + year, year * 7);
      const next = advanceWar(war, year, aggStr, defStr, negotiationRoll, warRisk);

      const aggName = aggSociety?.name ?? "Your settlement";
      const defName = defSociety?.name ?? "your settlement";

      if (next.phase === "active" && war.phase !== "active") {
        actions.push({ type: "active", pairKey: key, war: next, aggressorName: aggName, defenderName: defName });
      }
      if (next.resolved) {
        this.warCooldown.set(key, year);
        this.activeWars.delete(key);
        actions.push({ type: "resolved", pairKey: key, war: next, aggressorName: aggName, defenderName: defName });
      } else {
        this.activeWars.set(key, next);
      }
    }
    return actions;
  }
}
