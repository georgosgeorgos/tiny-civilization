import type { CellularMetrics } from "./cellular.ts";
import { SeededRandom } from "./random.ts";
import type { CulturalState, CultureTraits, Ecology, GenerativePractice, PracticeEffects, SimulationInputs, Stores } from "./types.ts";

const traitNames: (keyof CultureTraits)[] = ["cooperation", "curiosity", "mobility", "stewardship", "resilience"];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const clampEffect = (v: number) => Math.max(-0.05, Math.min(0.05, v));

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

const EFFECT_KEYS: (keyof PracticeEffects)[] = ["soil", "forest", "food", "water", "knowledge", "stability"];

const NAME_PREFIXES: Record<keyof PracticeEffects, string[]> = {
  soil: ["soil-tending", "earth", "ground", "loam"],
  forest: ["forest", "grove", "canopy", "timber"],
  food: ["harvest", "granary", "provision", "feast"],
  water: ["water", "rain", "spring", "tide"],
  knowledge: ["learning", "memory", "lore", "inquiry"],
  stability: ["peace", "order", "accord", "shelter"],
};

const NAME_SUFFIXES = ["covenant", "custom", "rite", "method", "compact", "ledger", "way", "art"];

export function generatePracticeName(effects: PracticeEffects, random: SeededRandom): string {
  let dominant: keyof PracticeEffects = "soil";
  let dominantVal = -Infinity;
  for (const key of EFFECT_KEYS) {
    if (effects[key] > dominantVal) { dominant = key; dominantVal = effects[key]; }
  }
  const prefixes = NAME_PREFIXES[dominant];
  const prefix = prefixes[Math.floor(random.next() * prefixes.length)]!;
  const suffix = NAME_SUFFIXES[Math.floor(random.next() * NAME_SUFFIXES.length)]!;
  return `${prefix} ${suffix}`;
}

function practiceId(random: SeededRandom, elapsedDays: number): string {
  return `p-${Math.floor(random.next() * 2 ** 32).toString(36)}-${Math.floor(random.next() * 2 ** 32).toString(36)}-${Math.floor(elapsedDays)}`;
}

function generatePractice(
  bias: Partial<PracticeEffects>,
  traits: CultureTraits,
  random: SeededRandom,
  elapsedDays: number,
  parentId: string | null = null,
): GenerativePractice {
  const effects: PracticeEffects = { soil: 0, forest: 0, food: 0, water: 0, knowledge: 0, stability: 0 };
  for (const key of EFFECT_KEYS) {
    const b = bias[key] ?? 0;
    const traitInfluence = (traits.stewardship * 0.4 + traits.cooperation * 0.3 + traits.curiosity * 0.3) * 0.015;
    effects[key] = clampEffect(b + traitInfluence * (random.next() - 0.3) + (random.next() - 0.5) * 0.008);
  }
  const id = practiceId(random, elapsedDays);
  const name = generatePracticeName(effects, random);
  return { id, effects, name, parentId, discoveredDay: elapsedDays };
}

function practiceStrength(p: GenerativePractice): number {
  return EFFECT_KEYS.reduce((sum, k) => sum + Math.abs(p.effects[k]), 0);
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

type DiscoverySlot = {
  eligible: boolean;
  bias: Partial<PracticeEffects>;
  probability: number;
};

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

  const practices = [...current.practices];
  const institutionCount = context.inputs.buildings.market + context.inputs.buildings.shrine + context.inputs.buildings.forge;
  const ecologyGating = context.inputs.ecologyToCulture !== false;

  const slots: DiscoverySlot[] = [
    // Everyday work can produce modest improvements even when no personality
    // trait crosses a specialist threshold and the society is not in crisis.
    { eligible: context.inputs.population >= 2 && context.inputs.annualProduction.food + context.inputs.annualProduction.wood > 0, bias: { food: 0.01, knowledge: 0.008 }, probability: 0.04 * (0.5 + traits.curiosity) },
    { eligible: traits.stewardship > 0.54 && (!ecologyGating || context.ecology.soil < 0.7), bias: { soil: 0.032, forest: 0.008 }, probability: 0.20 },
    { eligible: traits.cooperation > 0.56 && (!ecologyGating || scarcity > 0.25), bias: { food: 0.025, stability: 0.012 }, probability: 0.22 },
    { eligible: traits.mobility > 0.58 && context.inputs.infrastructure.ports + context.inputs.infrastructure.tradeRoutes > 0, bias: { water: 0.018, knowledge: 0.01 }, probability: 0.18 },
    { eligible: traits.curiosity > 0.6 && institutionCount >= 2, bias: { knowledge: 0.028, stability: 0.008 }, probability: 0.15 },
    { eligible: traits.resilience > 0.62 && (!ecologyGating || disruption > 0.2), bias: { water: 0.015, stability: 0.018 }, probability: 0.20 },
    { eligible: traits.cooperation > 0.62 && traits.curiosity > 0.58 && (!ecologyGating || context.landscape.habitatDiversity > 0.48), bias: { soil: 0.018, forest: 0.022, knowledge: 0.012 }, probability: 0.12 },
  ];

  const maxPractices = Math.max(0, 6 - blockedSlots);
  for (const slot of slots) {
    if (!slot.eligible || practices.length >= maxPractices) continue;
    if (random.next() >= slot.probability * span) continue;
    const practice = generatePractice(slot.bias, traits, random, context.elapsedDays);
    practices.push(practice);
  }

  if (practices.length > maxPractices) {
    practices.sort((a, b) => practiceStrength(b) - practiceStrength(a));
    practices.length = maxPractices;
  }

  const language = structuredClone(current.language);
  language.boundary = clamp(language.boundary + (disruption * 0.18 + scarcity * 0.08 - context.inputs.infrastructure.tradeRoutes * 0.06) * adaptation);
  if (mutationCycles > 0) {
    const fragments = ["ka", "mi", "ru", "sa", "tel", "vo", "ya", "zen"];
    const fragment = fragments[Math.floor(random.next() * fragments.length)] ?? "ka";
    language.dialect = `${language.family}-${fragment}${generation}`;
    language.lexicon = [...new Set([...language.lexicon, `memory-${fragment}`])].slice(-8);
  }
  const novelty = practices.length * 0.12 + traitNames.reduce((sum, trait) => sum + Math.abs(traits[trait] - 0.5), 0) * 0.08;
  return { lineage: current.lineage, generation, traits, practices, novelty, language };
}

export function mutatePractice(parent: GenerativePractice, random: SeededRandom, elapsedDays: number): GenerativePractice {
  const effects: PracticeEffects = { ...parent.effects };
  for (const key of EFFECT_KEYS) {
    effects[key] = clampEffect(effects[key] + (random.next() - 0.5) * 0.01);
  }
  const id = practiceId(random, elapsedDays);
  const name = generatePracticeName(effects, random);
  return { id, effects, name, parentId: parent.id, discoveredDay: elapsedDays };
}

/** @deprecated Use evolvePracticesAndLanguage instead. Kept for backward compat with deep-time paths. */
export const evolveCulture = evolvePracticesAndLanguage;
