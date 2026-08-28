import type { CulturalState, SimulationInputs, Stores } from "./types.ts";

export type InstitutionKind = "council" | "commons" | "guild" | "sanctuary" | "archive" | "watch" | "elders" | "faction" | "maintenance" | "sections";
export type InstitutionState = { forms: InstitutionKind[]; legitimacy: number; commonReserve: number; inequality: number };
export type InstitutionEffects = { foodSecurity: number; spoilageProtection: number; knowledgeMultiplier: number; stability: number; labor: number; inequalityPressure: number };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function institutionEffects(state: InstitutionState): InstitutionEffects {
  const forms = new Set(state.forms);
  return {
    foodSecurity: (forms.has("commons") ? 0.1 : 0) + (forms.has("sanctuary") ? 0.04 : 0) + (forms.has("elders") ? 0.045 : 0),
    spoilageProtection: (forms.has("commons") ? 0.24 : 0) + (forms.has("guild") ? 0.08 : 0) + (forms.has("maintenance") ? 0.06 : 0),
    knowledgeMultiplier: 1 + (forms.has("archive") ? 0.28 : 0) + (forms.has("guild") ? 0.1 : 0) + (forms.has("elders") ? 0.06 : 0) + (forms.has("maintenance") ? 0.14 : 0),
    stability: (forms.has("council") ? 0.1 : 0) + (forms.has("sanctuary") ? 0.08 : 0) + (forms.has("watch") ? 0.04 : 0) + (forms.has("elders") ? 0.06 : 0) + (forms.has("maintenance") ? 0.1 : 0) - (forms.has("faction") ? 0.035 : 0),
    labor: 1 + (forms.has("guild") ? 0.08 : 0) + (forms.has("commons") ? 0.04 : 0) + (forms.has("faction") ? 0.05 : 0),
    inequalityPressure: (forms.has("guild") ? 0.1 : 0) + (forms.has("faction") ? 0.13 : 0) + (forms.has("sections") ? 0.05 : 0) - (forms.has("commons") ? 0.13 : 0) - (forms.has("council") ? 0.04 : 0),
  };
}

/** Institutions are selected by material conditions and culture, then retain
 * legitimacy only while they solve the problems that created them. */
export function evolveInstitutions(current: InstitutionState, context: { inputs: SimulationInputs; culture: CulturalState; stores: Stores; health: number; stability: number }, years: number): InstitutionState {
  const { inputs, culture, stores, health, stability } = context;
  const forms = new Set<InstitutionKind>();
  const foodWorks = inputs.buildings.farm + inputs.buildings.fishery + inputs.buildings.orchard;
  const civicWorks = inputs.buildings.market + inputs.buildings.shrine + inputs.buildings.forge;
  const practices = new Set(culture.practices);
  const origin = inputs.origin ?? "camp";
  if (culture.traits.cooperation > 0.5 && civicWorks >= 1) forms.add("council");
  if (culture.traits.cooperation + culture.traits.stewardship > 1.1 && foodWorks >= 2) forms.add("commons");
  if (inputs.buildings.market >= 1 && inputs.buildings.mine + inputs.buildings.forge >= 1) forms.add("guild");
  if (inputs.buildings.shrine >= 1 && culture.traits.resilience > 0.5) forms.add("sanctuary");
  if (culture.traits.curiosity > 0.58 && civicWorks >= 2) forms.add("archive");
  if (culture.traits.resilience > 0.62 && (inputs.disruption !== "none" || inputs.infrastructure.tradeRoutes >= 1)) forms.add("watch");
  if (origin === "farmers" && foodWorks >= 2) forms.add("elders");
  if (origin === "city" && inputs.buildings.market + inputs.buildings.forge >= 2) forms.add("faction");
  if (origin === "spacecraft" && inputs.buildings.mine + inputs.buildings.forge >= 1) forms.add("maintenance");
  if (origin === "spacecraft" && (health < 0.65 || inputs.disruption !== "none")) forms.add("sections");
  if (practices.has("civic reform")) forms.add("council");
  if (practices.has("fortified quarters")) forms.add("watch");
  if (practices.has("soil covenant")) forms.add("commons");
  if (practices.has("redundant loop")) forms.add("maintenance");
  const span = Math.max(0, Math.min(12, years));
  const foodSecurity = clamp(stores.food / Math.max(2, inputs.population * 2.5));
  const fit = clamp((foodSecurity + health + stability + forms.size * 0.08) / 1.32);
  const legitimacy = clamp(current.legitimacy + (fit - current.legitimacy) * (1 - Math.exp(-span * 0.35)));
  const effects = institutionEffects({ ...current, forms: [...forms] });
  const reserveTarget = forms.has("commons") ? Math.max(0, stores.food - inputs.population * 2.8) * 0.32 : 0;
  const commonReserve = Math.max(0, current.commonReserve + (reserveTarget - current.commonReserve) * (1 - Math.exp(-span * 0.5)));
  const inequality = clamp(current.inequality + effects.inequalityPressure * span * 0.06 + (1 - legitimacy) * span * 0.035 - culture.traits.cooperation * span * 0.018);
  return { forms: [...forms].sort(), legitimacy, commonReserve, inequality };
}
