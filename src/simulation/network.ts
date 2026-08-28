import { hexDistance } from "../hex.ts";
import type { CultureTraits, LanguageState } from "./types.ts";

export type NetworkRegion = {
  id: string;
  q: number;
  r: number;
  population: number;
  capacity: number;
  food: number;
  wood: number;
  gold: number;
  knowledge: number;
  stability: number;
  migrationPressure: number;
  markets: number;
  ports: number;
  institutions: number;
  /** Mean household willingness to seek outside exchange. */
  openness?: number;
  /** Mean cost of reaching this regional hub through its surrounding terrain. */
  terrainCost?: number;
  culture?: CultureTraits;
  language?: LanguageState;
};

export type NetworkEffect = { food: number; wood: number; gold: number; knowledge: number; stability: number; migrants: number; culture: CultureTraits };
export type NetworkConnection = "none" | "parley" | "trade";

const blank = (): NetworkEffect => ({ food: 0, wood: 0, gold: 0, knowledge: 0, stability: 0, migrants: 0, culture: { cooperation: 0, curiosity: 0, mobility: 0, stewardship: 0, resilience: 0 } });

/**
 * Resource exchange, cultural diffusion and migration emerge from proximity
 * and local readiness. It has no central controller: every pair can become a
 * weak route once both places develop institutions or coastal access.
 */
export function exchangeRegions(
  regions: readonly NetworkRegion[],
  years: number,
  connection: (from: NetworkRegion, to: NetworkRegion) => NetworkConnection = () => "trade",
): ReadonlyMap<string, NetworkEffect> {
  const effects = new Map<string, NetworkEffect>(regions.map((region) => [region.id, blank()]));
  const tradePeers = new Map<string, NetworkRegion[]>(regions.map((region) => [region.id, []]));
  const span = Math.max(0, Math.min(1, years * 4));
  for (let a = 0; a < regions.length; a += 1) {
    const from = regions[a];
    if (!from) continue;
    for (let b = a + 1; b < regions.length; b += 1) {
      const to = regions[b];
      if (!to) continue;
      const mode = connection(from, to);
      if (mode === "none") continue;
      const distance = hexDistance(from.q - to.q, from.r - to.r);
      if (distance > 110) continue;
      const readiness = Math.min(
        1,
        (from.markets + to.markets) * 0.18 + (from.ports + to.ports) * 0.16 + (from.institutions + to.institutions) * 0.045,
      );
      if (readiness < 0.08) continue;
      if (mode === "trade") {
        tradePeers.get(from.id)?.push(to);
        tradePeers.get(to.id)?.push(from);
      }
      const fromLanguage = from.language;
      const toLanguage = to.language;
      const linguisticAffinity = !fromLanguage || !toLanguage
        ? 0.72
        : fromLanguage.dialect === toLanguage.dialect
          ? 1
          : fromLanguage.family === toLanguage.family
            ? 0.78 - Math.abs(fromLanguage.boundary - toLanguage.boundary) * 0.16
            : 0.42 - (fromLanguage.boundary + toLanguage.boundary) * 0.18;
      const socialOpenness = ((from.openness ?? 0.5) + (to.openness ?? 0.5)) / 2;
      const terrainFriction = Math.max(0.7, ((from.terrainCost ?? 1) + (to.terrainCost ?? 1)) / 2);
      const strength = readiness * (0.65 + socialOpenness * 0.5) * (1 - distance / 132) * span * Math.max(0.18, linguisticAffinity) * (mode === "trade" ? 1 : 0.58) / terrainFriction;
      const fromEffect = effects.get(from.id) as NetworkEffect;
      const toEffect = effects.get(to.id) as NetworkEffect;
      if (mode === "trade") {
        const fromSurplus = Math.max(0, from.food - from.population * 3.4);
        const toSurplus = Math.max(0, to.food - to.population * 3.4);
        const foodTransfer = Math.min(Math.max(0, fromSurplus - toSurplus) * strength * 0.28, Math.max(0, to.population * 2.3 - to.food));
        const reverseFood = Math.min(Math.max(0, toSurplus - fromSurplus) * strength * 0.28, Math.max(0, from.population * 2.3 - from.food));
        fromEffect.food -= foodTransfer;
        toEffect.food += foodTransfer;
        toEffect.food -= reverseFood;
        fromEffect.food += reverseFood;
      }

      const knowledgeFlow = (from.knowledge - to.knowledge) * strength * 0.018;
      fromEffect.knowledge -= knowledgeFlow;
      toEffect.knowledge += knowledgeFlow;
      const sharedStability = (from.stability + to.stability - 1) * strength * 0.012;
      fromEffect.stability += sharedStability;
      toEffect.stability += sharedStability;

      const fromCulture = from.culture ?? { cooperation: 0.5, curiosity: 0.5, mobility: 0.5, stewardship: 0.5, resilience: 0.5 };
      const toCulture = to.culture ?? { cooperation: 0.5, curiosity: 0.5, mobility: 0.5, stewardship: 0.5, resilience: 0.5 };
      for (const trait of Object.keys(fromCulture) as (keyof CultureTraits)[]) {
        const diffusion = (fromCulture[trait] - toCulture[trait]) * strength * 0.12;
        fromEffect.culture[trait] -= diffusion;
        toEffect.culture[trait] += diffusion;
      }

      if (mode === "trade") {
        const origin = from.migrationPressure > to.migrationPressure ? from : to;
        const destination = origin === from ? to : from;
        const originEffect = effects.get(origin.id) as NetworkEffect;
        const destinationEffect = effects.get(destination.id) as NetworkEffect;
        const room = Math.max(0, destination.capacity - destination.population);
        const migrationPotential = origin.population * origin.migrationPressure * strength * 0.35;
        const migrants = Math.min(room, migrationPotential >= 0.35 ? Math.max(1, Math.floor(migrationPotential)) : 0);
        originEffect.migrants -= migrants;
        destinationEffect.migrants += migrants;
        originEffect.gold += migrants * 0.08;
        destinationEffect.gold -= migrants * 0.08;
      }
    }
  }
  // A trade graph should have consequences beyond isolated pairs. A single,
  // non-recursive relay pass lets a crossroads forward part of what it just
  // received. Reading from the frozen direct receipts keeps this bounded to
  // two hops: it is neither instant global diffusion nor update-order magic.
  const directReceipts = new Map([...effects].map(([id, effect]) => [id, { food: effect.food, knowledge: effect.knowledge }]));
  for (const intermediary of regions) {
    const peers = tradePeers.get(intermediary.id) ?? [];
    if (peers.length < 2) continue;
    const received = directReceipts.get(intermediary.id);
    const intermediaryEffect = effects.get(intermediary.id);
    if (!received || !intermediaryEffect) continue;
    const hungryPeers = peers.filter((peer) => peer.food < peer.population * 2.3);
    const foodToRelay = Math.min(Math.max(0, received.food) * 0.3, Math.max(0, intermediaryEffect.food));
    if (foodToRelay > 0 && hungryPeers.length > 0) {
      const share = foodToRelay / hungryPeers.length;
      intermediaryEffect.food -= foodToRelay;
      for (const peer of hungryPeers) (effects.get(peer.id) as NetworkEffect).food += share;
    }
    const lessLearnedPeers = peers.filter((peer) => peer.knowledge < intermediary.knowledge);
    const knowledgeToRelay = Math.min(Math.max(0, received.knowledge) * 0.3, Math.max(0, intermediaryEffect.knowledge));
    if (knowledgeToRelay > 0 && lessLearnedPeers.length > 0) {
      const share = knowledgeToRelay / lessLearnedPeers.length;
      intermediaryEffect.knowledge -= knowledgeToRelay;
      for (const peer of lessLearnedPeers) (effects.get(peer.id) as NetworkEffect).knowledge += share;
    }
  }
  return effects;
}
