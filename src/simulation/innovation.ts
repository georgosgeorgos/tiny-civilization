import type { CulturalState, Ecology, SimulationInputs } from "./types.ts";

export type Technique = "seed-selection" | "waterworks" | "sailcraft" | "ledger" | "metallurgy" | "public-archive" | "soil-restoration";
export type InnovationState = { techniques: Technique[]; provenance: Partial<Record<Technique, string>> };
export type InnovationEffects = { food: number; knowledge: number; trade: number; extraction: number; ecology: number };

const has = (state: InnovationState, technique: Technique) => state.techniques.includes(technique);

export function innovationEffects(state: InnovationState): InnovationEffects {
  return {
    food: 1 + (has(state, "seed-selection") ? 0.1 : 0) + (has(state, "waterworks") ? 0.14 : 0),
    knowledge: 1 + (has(state, "ledger") ? 0.12 : 0) + (has(state, "public-archive") ? 0.25 : 0),
    trade: 1 + (has(state, "sailcraft") ? 0.2 : 0) + (has(state, "ledger") ? 0.08 : 0),
    extraction: 1 + (has(state, "metallurgy") ? 0.18 : 0),
    ecology: 1 + (has(state, "soil-restoration") ? 0.18 : 0),
  };
}

/** A directed capability graph with deliberately redundant paths. Discoveries
 * are conditionally retained, attributable, and need no random unlock roll. */
export function evolveInnovations(current: InnovationState, context: { inputs: SimulationInputs; ecology: Ecology; culture: CulturalState; knowledge: number }): InnovationState {
  const next: InnovationState = { techniques: [...current.techniques], provenance: { ...current.provenance } };
  const discover = (technique: Technique, source: string, condition: boolean) => {
    if (!condition || has(next, technique)) return;
    next.techniques.push(technique);
    next.provenance[technique] = source;
  };
  const foodWorks = context.inputs.buildings.farm + context.inputs.buildings.fishery + context.inputs.buildings.orchard;
  const civicWorks = context.inputs.buildings.market + context.inputs.buildings.shrine + context.inputs.buildings.forge;
  discover("seed-selection", "farmers' trials", foodWorks >= 2 && context.knowledge >= 5);
  // Waterworks may derive from agrarian trials or a coastal navigation culture.
  discover("waterworks", has(next, "seed-selection") ? "seed-selection" : "coastal hydrology", (has(next, "seed-selection") && context.ecology.water < 0.68) || (context.inputs.infrastructure.ports > 0 && context.culture.traits.curiosity > 0.58));
  discover("sailcraft", "coastal exchange", context.inputs.infrastructure.ports > 0 && (context.inputs.infrastructure.tradeRoutes > 0 || context.culture.traits.mobility > 0.57));
  discover("ledger", "market accounting", context.inputs.buildings.market >= 1 && (context.inputs.infrastructure.tradeRoutes > 0 || civicWorks >= 2));
  discover("metallurgy", "workshop experimentation", context.inputs.buildings.mine + context.inputs.buildings.forge >= 2 && context.ecology.minerals > 0.22 && context.knowledge >= 28);
  discover("public-archive", has(next, "ledger") ? "ledger tradition" : "civic memory", context.culture.traits.curiosity > 0.62 && civicWorks >= 2 && (has(next, "ledger") || context.inputs.buildings.shrine >= 1));
  discover("soil-restoration", "land stewardship", context.culture.traits.stewardship > 0.58 && (context.ecology.soil < 0.68 || has(next, "waterworks")));
  next.techniques.sort();
  return next;
}
