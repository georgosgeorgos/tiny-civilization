import type { BuildingId } from "./buildings";

export type Directive = "balanced" | "food" | "growth" | "wealth" | "culture" | "frontier";

export const DIRECTIVE_COPY: Record<Directive, string> = {
  balanced: "Keep the settlement balanced.", food: "Secure food before pursuing growth.",
  growth: "Prioritize housing and population.", wealth: "Invest in trade and industry.",
  culture: "Build a happier, more resilient society.", frontier: "Prepare for new frontiers.",
};

/** Pull ordered, plain-language priorities from a single council instruction. */
export function directivesFromText(text: string): Directive[] {
  const words = text.toLowerCase();
  const matches: { directive: Directive; at: number }[] = [];
  const add = (directive: Directive, pattern: RegExp) => {
    const at = words.search(pattern);
    if (at >= 0) matches.push({ directive, at });
  };
  add("food", /food|farm|harvest|fish|hunger|feed/);
  add("growth", /grow|people|house|home|population|settle/);
  add("wealth", /gold|wealth|trade|market|industry|mine|commerce/);
  add("culture", /happy|culture|faith|shrine|festival|health|resilien/);
  add("frontier", /expand|frontier|island|explore|colon/);
  add("balanced", /balance|steady|mixed/);
  matches.sort((a, b) => a.at - b.at);
  return matches.filter((match, index) => matches.findIndex((other) => other.directive === match.directive) === index).map((match) => match.directive);
}

export function directiveFromText(text: string): Directive | null {
  return directivesFromText(text)[0] ?? null;
}

export function priorityBuildings(directive: Directive): BuildingId[] {
  if (directive === "food") return ["fishery", "farm", "orchard", "lumber"];
  if (directive === "growth") return ["hut", "farm", "fishery", "lumber"];
  if (directive === "wealth") return ["market", "mine", "forge", "lumber"];
  if (directive === "culture") return ["shrine", "market", "orchard", "hut"];
  if (directive === "frontier") return ["hut", "lumber", "market", "fishery"];
  return [];
}
