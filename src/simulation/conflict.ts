export type ConflictOutcome = "none" | "sanctions" | "raid" | "reconciliation";
export type ConflictContext = { relation: number; scarcity: number; grievance: number; defense: number; diplomacy: number };

/** Abstract bargaining provides sanctions, deterrence, and reconciliation as
 * alternatives to destructive conflict. */
export function resolveConflict(context: ConflictContext): { outcome: ConflictOutcome; relationDelta: number; foodMultiplier: number; stabilityDelta: number } {
  const pressure = context.grievance * 0.48 + context.scarcity * 0.34 + Math.max(0, -context.relation) / 80;
  const bargaining = context.diplomacy * 0.55 + context.defense * 0.18;
  if (pressure < 0.32 && context.relation > 12) return { outcome: "reconciliation", relationDelta: 4, foodMultiplier: 1, stabilityDelta: 0.04 };
  if (pressure > 0.7 && bargaining < 0.36) return { outcome: "raid", relationDelta: -12, foodMultiplier: 0.72, stabilityDelta: -0.12 };
  if (pressure > 0.46) return { outcome: "sanctions", relationDelta: -5, foodMultiplier: 0.9, stabilityDelta: -0.035 };
  return { outcome: "none", relationDelta: 0, foodMultiplier: 1, stabilityDelta: 0 };
}
