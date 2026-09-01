import type { SeededRandom } from "./random.ts";
import type { CulturalState, Ecology, SimulationInputs } from "./types.ts";

export type Technique =
  | "seed-selection" | "crop-rotation" | "irrigation" | "terracing"
  | "coastal-navigation" | "sailcraft" | "harbor-engineering"
  | "metallurgy" | "masonry"
  | "ledger" | "codified-law" | "public-archive"
  | "waterworks" | "soil-restoration" | "forestry-management";
export type InnovationState = { techniques: Technique[]; provenance: Partial<Record<Technique, string>> };
export type InnovationEffects = { food: number; knowledge: number; trade: number; extraction: number; ecology: number; healthProtection: number };

const has = (state: InnovationState, technique: Technique) => state.techniques.includes(technique);

export function innovationEffects(state: InnovationState): InnovationEffects {
  return {
    food: 1 + (has(state, "seed-selection") ? 0.1 : 0) + (has(state, "waterworks") ? 0.14 : 0) + (has(state, "crop-rotation") ? 0.08 : 0) + (has(state, "irrigation") ? 0.12 : 0) + (has(state, "terracing") ? 0.06 : 0),
    knowledge: 1 + (has(state, "ledger") ? 0.12 : 0) + (has(state, "public-archive") ? 0.25 : 0) + (has(state, "codified-law") ? 0.08 : 0),
    trade: 1 + (has(state, "sailcraft") ? 0.2 : 0) + (has(state, "ledger") ? 0.08 : 0) + (has(state, "coastal-navigation") ? 0.12 : 0) + (has(state, "harbor-engineering") ? 0.1 : 0),
    extraction: 1 + (has(state, "metallurgy") ? 0.18 : 0) + (has(state, "masonry") ? 0.1 : 0),
    ecology: 1 + (has(state, "soil-restoration") ? 0.18 : 0) + (has(state, "irrigation") ? 0.06 : 0) + (has(state, "forestry-management") ? 0.12 : 0),
    healthProtection: (has(state, "waterworks") ? 0.14 : 0) + (has(state, "public-archive") ? 0.04 : 0),
  };
}

/** A directed capability graph with deliberately redundant paths. Discoveries
 * are conditionally retained, attributable, and need no random unlock roll. */
export function evolveInnovations(current: InnovationState, context: { inputs: SimulationInputs; ecology: Ecology; culture: CulturalState; knowledge: number }, random?: SeededRandom): InnovationState {
  const next: InnovationState = { techniques: [...current.techniques], provenance: { ...current.provenance } };
  const discover = (technique: Technique, source: string, condition: boolean) => {
    if (!condition || has(next, technique)) return;
    if (random && random.next() > 0.25) return;
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
  discover("crop-rotation", has(next, "seed-selection") ? "seed-selection trials" : "intensive farming", (has(next, "seed-selection") && context.ecology.soil < 0.6) || (foodWorks >= 3 && context.knowledge >= 15));
  discover("irrigation", has(next, "waterworks") ? "waterworks extension" : "drought adaptation", has(next, "waterworks") || (has(next, "seed-selection") && context.ecology.water < 0.55));
  discover("terracing", has(next, "crop-rotation") ? "crop-rotation engineering" : "highland farming", (has(next, "crop-rotation") && context.inputs.buildings.mine + context.inputs.buildings.forge >= 1) || (context.knowledge >= 35 && foodWorks >= 2));
  discover("coastal-navigation", has(next, "sailcraft") ? "sailcraft extension" : "coastal piloting", (context.inputs.infrastructure.ports > 0 && context.culture.traits.mobility > 0.5) || has(next, "sailcraft"));
  discover("harbor-engineering", has(next, "sailcraft") ? "sailcraft harbors" : "masonry docks", (has(next, "sailcraft") && context.inputs.infrastructure.ports > 1) || (has(next, "masonry") && context.inputs.infrastructure.ports > 0));
  discover("masonry", has(next, "metallurgy") ? "metallurgical construction" : "quarry craft", (context.inputs.buildings.mine + context.inputs.buildings.forge >= 2 && context.knowledge >= 20) || has(next, "metallurgy"));
  discover("codified-law", has(next, "ledger") ? "ledger jurisprudence" : "civic convention", (has(next, "ledger") && civicWorks >= 2) || (context.culture.traits.cooperation > 0.65 && context.knowledge >= 30));
  discover("forestry-management", has(next, "soil-restoration") ? "soil-restoration forestry" : "woodland stewardship", (context.culture.traits.stewardship > 0.55 && context.ecology.forest < 0.6) || has(next, "soil-restoration"));
  next.techniques.sort();
  return next;
}
