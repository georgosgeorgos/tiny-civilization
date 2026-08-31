import type { SimulationInputs, SimulationSnapshot } from "./types.ts";

export type WarPhase = "escalation" | "active" | "resolution";
export type WarOutcome = "victory" | "defeat" | "negotiated-peace" | "exhaustion";

export type WarState = {
  aggressorId: string;
  defenderId: string;
  phase: WarPhase;
  startYear: number;
  aggressorStrength: number;
  defenderStrength: number;
  attritionAccumulated: number;
  resolved: boolean;
  outcome: WarOutcome | null;
};

export function createWar(aggressorId: string, defenderId: string, year: number): WarState {
  return {
    aggressorId,
    defenderId,
    phase: "escalation",
    startYear: year,
    aggressorStrength: 0,
    defenderStrength: 0,
    attritionAccumulated: 0,
    resolved: false,
    outcome: null,
  };
}

export function computeStrength(inputs: SimulationInputs, snapshot: SimulationSnapshot): number {
  return (
    inputs.population * 0.3 +
    inputs.buildings.forge * 3 +
    inputs.buildings.mine * 1.5 +
    inputs.infrastructure.roads * 0.5 +
    snapshot.institutionalStrength * 5 +
    snapshot.stability * 10
  );
}

export function advanceWar(
  war: WarState,
  year: number,
  aggStrength: number,
  defStrength: number,
  negotiationRoll: number,
  warRisk: number,
): WarState {
  const next = { ...war, aggressorStrength: aggStrength, defenderStrength: defStrength };
  const elapsed = year - war.startYear;

  if (next.phase === "escalation") {
    if (warRisk > 0.7 && elapsed >= 1) {
      next.phase = "active";
    }
    return next;
  }

  if (next.phase === "active") {
    next.attritionAccumulated += 3;
    const ratio = aggStrength / Math.max(0.1, defStrength);
    if (ratio > 2) {
      next.phase = "resolution";
      next.outcome = "victory";
    } else if (1 / ratio > 2) {
      next.phase = "resolution";
      next.outcome = "defeat";
    } else if (next.attritionAccumulated > 25) {
      next.phase = "resolution";
      next.outcome = "exhaustion";
    } else if (negotiationRoll < 0.3) {
      next.phase = "resolution";
      next.outcome = "negotiated-peace";
    }
    return next;
  }

  next.resolved = true;
  return next;
}
