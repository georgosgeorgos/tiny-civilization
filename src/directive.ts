import type { BuildingId } from "./buildings";

export type Directive = "balanced" | "food" | "growth" | "wealth" | "culture" | "frontier";

export const DIRECTIVE_COPY: Record<Directive, string> = {
  balanced: "Keep the settlement balanced.", food: "Secure food before pursuing growth.",
  growth: "Prioritize housing and population.", wealth: "Invest in trade and industry.",
  culture: "Build a happier, more resilient society.", frontier: "Prepare for new frontiers.",
};

export function directiveFromText(text: string): Directive | null {
  const words = text.toLowerCase();
  if (/food|farm|harvest|fish|hunger/.test(words)) return "food";
  if (/grow|people|house|home|population/.test(words)) return "growth";
  if (/gold|wealth|trade|market|industry|mine/.test(words)) return "wealth";
  if (/happy|culture|faith|shrine|festival/.test(words)) return "culture";
  if (/expand|frontier|island|explore|settle/.test(words)) return "frontier";
  if (/balance|steady|mixed/.test(words)) return "balanced";
  return null;
}

export function priorityBuildings(directive: Directive): BuildingId[] {
  if (directive === "food") return ["fishery", "farm", "orchard", "lumber"];
  if (directive === "growth") return ["hut", "farm", "fishery", "lumber"];
  if (directive === "wealth") return ["market", "mine", "forge", "lumber"];
  if (directive === "culture") return ["shrine", "market", "orchard", "hut"];
  if (directive === "frontier") return ["hut", "lumber", "market", "fishery"];
  return [];
}
