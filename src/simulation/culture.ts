import type { CellularMetrics } from "./cellular.ts";
import { SeededRandom } from "./random.ts";
import type { CulturalState, CultureTraits, Ecology, SimulationInputs, Stores } from "./types.ts";

const traitNames: (keyof CultureTraits)[] = ["cooperation", "curiosity", "mobility", "stewardship", "resilience"];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type CultureContext = {
  elapsedDays: number;
  ecology: Ecology;
  landscape: CellularMetrics;
  stores: Stores;
  health: number;
  stability: number;
  inputs: SimulationInputs;
};

const GIVEN_NAMES = ["Aru", "Bel", "Cai", "Dara", "Esh", "Ilo", "Keth", "Mara", "Nai", "Oru", "Seli", "Tavi"];
const SUFFIXES = ["an", "en", "esh", "in", "or", "ra", "un", "yth", "a", "i", "o"];

export function generatePersonName(lineage: string, seed: number): string {
  const given = GIVEN_NAMES[Math.floor(((seed * 7919) % 1) * GIVEN_NAMES.length) % GIVEN_NAMES.length]!;
  const suffix = SUFFIXES[Math.floor(((seed * 6271) % 1) * SUFFIXES.length) % SUFFIXES.length]!;
  return `${given}${suffix} ${lineage}`;
}

export function createCulture(seed: number): CulturalState {
  const random = new SeededRandom(seed ^ 0x1f123bb5);
  const first = ["Aru", "Bel", "Cai", "Dara", "Esh", "Ilo", "Keth", "Mara", "Nai", "Oru", "Seli", "Tavi"];
  const second = ["an", "en", "esh", "in", "or", "ra", "un", "yth"];
  const family = `${first[Math.floor(random.next() * first.length)]}${second[Math.floor(random.next() * second.length)]}`;
  const syllables = ["ka", "mi", "ru", "sa", "tel", "vo", "ya", "zen"];
  return {
    lineage: family,
    generation: 0,
    traits: {
      cooperation: 0.34 + random.next() * 0.34,
      curiosity: 0.28 + random.next() * 0.4,
      mobility: 0.24 + random.next() * 0.42,
      stewardship: 0.3 + random.next() * 0.38,
      resilience: 0.35 + random.next() * 0.36,
    },
    practices: [],
    novelty: 0,
    language: {
      family,
      dialect: `${family}-${syllables[Math.floor(random.next() * syllables.length)]}`,
      lexicon: ["home", "water", "kin"].map((word, index) => `${word}-${syllables[(index + Math.floor(random.next() * syllables.length)) % syllables.length]}`),
      boundary: 0.28 + random.next() * 0.35,
    },
  };
}

/**
 * Evolve practices and language based on the society's aggregate cultural
 * traits. Trait values are read-only inputs (driven by individual
 * transmission in the render layer); this function only discovers practices,
 * evolves language, and applies generational mutation to trait noise.
 */
export function evolvePracticesAndLanguage(current: CulturalState, context: CultureContext, random: SeededRandom, elapsedYears: number, blockedSlots = 0): CulturalState {
  const traits = { ...current.traits };
  const span = Math.max(1 / 96, Math.min(80, elapsedYears));
  const adaptation = 1 - Math.exp(-span * 0.22);
  const foodSecurity = clamp(context.stores.food / Math.max(2, context.inputs.population * 2.5));
  const scarcity = 1 - foodSecurity;
  const disruption = context.inputs.disruption === "none" ? 0 : context.inputs.disruption === "storm" ? 0.28 : 0.6;

  const generation = Math.floor(context.elapsedDays / 12);
  const mutationCycles = Math.min(32, Math.max(0, generation - current.generation));
  for (let cycle = 0; cycle < mutationCycles; cycle += 1) {
    const trait = traitNames[Math.floor(random.next() * traitNames.length)] ?? "cooperation";
    traits[trait] = clamp(traits[trait] + (random.next() - 0.5) * 0.075);
  }

  const practices = new Set(current.practices);
  const institutionCount = context.inputs.buildings.market + context.inputs.buildings.shrine + context.inputs.buildings.forge;
  const tryDiscover = (name: string, eligible: boolean, probability = 0.18) => {
    if (practices.has(name) || !eligible) return;
    if (random.next() < probability * span) practices.add(name);
  };
  tryDiscover("soil-rest covenant", traits.stewardship > 0.54 && context.ecology.soil < 0.7, 0.20);
  tryDiscover("common granary", traits.cooperation > 0.56 && scarcity > 0.25, 0.22);
  tryDiscover("wayfinding compact", traits.mobility > 0.58 && context.inputs.infrastructure.ports + context.inputs.infrastructure.tradeRoutes > 0, 0.18);
  tryDiscover("open archive", traits.curiosity > 0.6 && institutionCount >= 2, 0.15);
  tryDiscover("storm ledger", traits.resilience > 0.62 && disruption > 0.2, 0.20);
  tryDiscover("living commons", traits.cooperation > 0.62 && traits.curiosity > 0.58 && context.landscape.habitatDiversity > 0.48, 0.12);
  const maxPractices = Math.max(0, 6 - blockedSlots);
  const retained = [...practices].sort().slice(-maxPractices);
  const language = structuredClone(current.language);
  language.boundary = clamp(language.boundary + (disruption * 0.18 + scarcity * 0.08 - context.inputs.infrastructure.tradeRoutes * 0.06) * adaptation);
  if (mutationCycles > 0) {
    const fragments = ["ka", "mi", "ru", "sa", "tel", "vo", "ya", "zen"];
    const fragment = fragments[Math.floor(random.next() * fragments.length)] ?? "ka";
    language.dialect = `${language.family}-${fragment}${generation}`;
    language.lexicon = [...new Set([...language.lexicon, `memory-${fragment}`])].slice(-8);
  }
  const novelty = retained.length * 0.12 + traitNames.reduce((sum, trait) => sum + Math.abs(traits[trait] - 0.5), 0) * 0.08;
  return { lineage: current.lineage, generation, traits, practices: retained, novelty, language };
}

/** @deprecated Use evolvePracticesAndLanguage instead. Kept for backward compat with deep-time paths. */
export const evolveCulture = evolvePracticesAndLanguage;
