export type RegionalStance = "none" | "parley" | "trade" | "hostile";

export type RegionalRelation = {
  trust: number;
  reliability: number;
  stance: RegionalStance;
  debt: number;
  lastYear: number;
};

export type RegionalRelationContext = {
  distance: number;
  languageAffinity: number;
  infrastructure: number;
  scarcityA: number;
  scarcityB: number;
  borderFriction: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A direct relationship between two autonomous regions. It has no player as
 * intermediary: shared access, shortage, and language determine its history. */
export function createRegionalRelation(year: number, context: Pick<RegionalRelationContext, "distance" | "languageAffinity">): RegionalRelation {
  const proximity = clamp(1 - context.distance / 120);
  return {
    // Nearby societies begin with a small but meaningful chance of being
    // legible to one another; this is still only a parley, not trade.
    trust: clamp(0.18 + proximity * 0.15 + context.languageAffinity * 0.14),
    reliability: clamp(0.14 + proximity * 0.3),
    stance: "none",
    debt: 0,
    lastYear: year,
  };
}

export function advanceRegionalRelation(current: RegionalRelation, year: number, context: RegionalRelationContext): RegionalRelation {
  const elapsed = Math.max(0, year - current.lastYear);
  if (elapsed === 0) return current;
  const proximity = clamp(1 - context.distance / 120);
  const mutualScarcity = (context.scarcityA + context.scarcityB) / 2;
  const imbalance = context.scarcityA - context.scarcityB;
  const connection = proximity * (0.2 + context.infrastructure * 0.8);
  const friction = context.borderFriction * 0.42 + mutualScarcity * 0.38 + Math.abs(imbalance) * 0.12;
  let reliability = clamp(current.reliability + elapsed * (connection * 0.06 + context.languageAffinity * 0.012 - friction * 0.032));
  let trust = clamp(current.trust + elapsed * (connection * (0.018 + context.languageAffinity * 0.035) - friction * 0.05 - Math.abs(current.debt) * 0.008));
  let debt = Math.max(-1, Math.min(1, current.debt + imbalance * connection * elapsed * 0.16));
  let stance: RegionalStance = current.stance;
  if (friction > 0.56 && trust < 0.34) stance = "hostile";
  else if (stance === "hostile" && trust > 0.5 && friction < 0.27) stance = "parley";
  else if (trust >= 0.64 && reliability >= 0.5 && Math.abs(debt) < 0.72) stance = "trade";
  else if (trust >= 0.34 && reliability >= 0.24) stance = "parley";
  else if (stance !== "hostile") stance = "none";
  // A functioning trade relation settles imbalance gradually rather than
  // treating debt as a permanent relation score.
  if (stance === "trade") debt *= Math.max(0, 1 - elapsed * 0.16);
  return { trust, reliability, stance, debt, lastYear: year };
}

export function regionalRelationMode(relation: RegionalRelation): "none" | "parley" | "trade" {
  if (relation.stance === "trade" && relation.trust >= 0.5 && relation.reliability >= 0.38) return "trade";
  if (relation.stance === "parley" && relation.reliability >= 0.22) return "parley";
  return "none";
}
