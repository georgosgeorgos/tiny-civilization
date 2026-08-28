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

/** Written observer controls stay intentionally small and explicit. */
export function speedFromText(text: string): 0 | 1 | 2 | 4 | 8 | 96 | null {
  if (/\b(?:pause|stop|halt)\s+(?:time|simulation)|\bpause\b/i.test(text)) return 0;
  if (/\b(?:years?|eras?)\s+(?:of\s+)?(?:pace|speed)|\b(?:speed|pace)\s+(?:of\s+)?(?:years?|eras?)\b/i.test(text)) return 96;
  const match = text.match(/\b(?:speed|pace|time)\s*(?:to|at|of|=)?\s*(96|0|1|2|4|8)\s*(?:x|×)?\b/i);
  if (!match) return null;
  const speed = Number(match[1]);
  return speed === 0 || speed === 1 || speed === 2 || speed === 4 || speed === 8 || speed === 96 ? speed : null;
}

export function yearsFromText(text: string): number | null {
  const match = text.match(/\b(?:show|advance|jump|after)\s+(\d+(?:\.\d+)?)\s*(million|thousand|k)?\s+years?\b/i);
  if (!match) return null;
  const number = Number(match[1]);
  const scale = match[2]?.toLowerCase();
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(1_000_000_000, Math.round(number * (scale === "million" ? 1_000_000 : scale === "thousand" || scale === "k" ? 1_000 : 1)));
}

export function priorityBuildings(directive: Directive): BuildingId[] {
  if (directive === "food") return ["fishery", "farm", "orchard", "lumber"];
  if (directive === "growth") return ["hut", "farm", "fishery", "lumber"];
  if (directive === "wealth") return ["market", "mine", "forge", "lumber"];
  if (directive === "culture") return ["shrine", "market", "orchard", "hut"];
  if (directive === "frontier") return ["hut", "lumber", "market", "fishery"];
  return [];
}
