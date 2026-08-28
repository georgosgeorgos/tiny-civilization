import { SeededRandom } from "./random.ts";
import type { CulturalState, CultureTraits } from "./types.ts";

export type SocietyVitality = {
  population: number;
  capacity: number;
  food: number;
  mood: number;
  migrationPressure: number;
  culture: CulturalState;
};

const traits: (keyof CultureTraits)[] = ["cooperation", "curiosity", "mobility", "stewardship", "resilience"];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A society may vanish when its last households cannot provision themselves.
 * Collapse is intentionally a state transition, not a random deletion. */
export function shouldSocietyCollapse(state: SocietyVitality): boolean {
  const exhausted = state.food < 0.4 && state.mood < 28;
  const displaced = state.population <= 1 && state.migrationPressure > 0.58;
  return state.population === 0 || exhausted || displaced;
}

/** Overcrowding plus a mobile, cooperative culture produces an offshoot. */
export function shouldSocietyFragment(state: SocietyVitality): boolean {
  const crowded = state.population >= 7 && state.population >= Math.max(3, Math.floor(state.capacity * 0.88));
  const ready = state.food > state.population * 2.2 && state.mood >= 44;
  const disposition = state.culture.traits.mobility * 0.62 + state.culture.traits.cooperation * 0.38;
  return crowded && ready && disposition > 0.53;
}

/** Creates a recognizably related culture with a bounded generational drift. */
export function forkCulture(parent: CulturalState, seed: number, purpose: "diaspora" | "renewal"): CulturalState {
  const random = new SeededRandom(seed ^ (purpose === "renewal" ? 0x6e6577 : 0x646961));
  const nextTraits = { ...parent.traits };
  for (const trait of traits) {
    const pressure = purpose === "renewal" && trait === "resilience" ? 0.035 : 0;
    nextTraits[trait] = clamp(nextTraits[trait] + (random.next() - 0.5) * 0.11 + pressure);
  }
  const syllable = ["a", "e", "i", "o", "u", "r", "s", "v"][Math.floor(random.next() * 8)] ?? "r";
  const practice = purpose === "renewal" ? "ruin-keepers' memory" : "diaspora charter";
  return {
    lineage: `${parent.lineage}-${syllable.toUpperCase()}${parent.generation + 1}`,
    generation: parent.generation + 1,
    traits: nextTraits,
    practices: [...new Set([...parent.practices, practice])].sort().slice(-6),
    novelty: parent.novelty + 0.06,
    language: {
      ...parent.language,
      dialect: `${parent.language.family}-${syllable}${parent.generation + 1}`,
      lexicon: [...new Set([...parent.language.lexicon, purpose === "renewal" ? "ruin-memory" : "far-road"])].slice(-8),
      boundary: clamp(parent.language.boundary + (purpose === "renewal" ? 0.08 : -0.03)),
    },
  };
}
