export type WorldTemperament = "calm" | "balanced" | "wild";
export type SimulationGoal = "survive" | "prosper" | "explore";
export type TechnologyStart = "primitive" | "developing" | "advanced";
export type VisualStyle = "natural" | "austere" | "radiant";
export type Origin = "camp" | "farmers" | "city" | "spacecraft";
/** Geography changes the opportunities and pressures available to societies. */
export type WorldArchetype = "archipelago" | "continental" | "shattered" | "frontier";

export type SimulationConfig = {
  resources: "lean" | "standard" | "abundant";
  temperament: WorldTemperament;
  goal: SimulationGoal;
  auto: boolean;
  speed: number;
  technology: TechnologyStart;
  visualStyle: VisualStyle;
  origin: Origin;
  archetype: WorldArchetype;
  seed: number;
};

export const DEFAULT_CONFIG: SimulationConfig = {
  resources: "standard",
  temperament: "balanced",
  goal: "prosper",
  auto: true,
  speed: 4,
  technology: "primitive",
  visualStyle: "natural",
  origin: "camp",
  archetype: "continental",
  seed: 1337,
};

const freshSeed = (): number => Math.floor(Math.random() * 2_147_483_647);

export function configFromSearch(search: string): SimulationConfig {
  const params = new URLSearchParams(search);
  const resources = params.get("resources");
  const temperament = params.get("temperament");
  const goal = params.get("goal");
  const speedParam = params.get("speed");
  const speed = speedParam === null ? Number.NaN : Number(speedParam);
  const technology = params.get("technology");
  const visualStyle = params.get("style");
  const origin = params.get("origin");
  const archetype = params.get("archetype");
  return {
    resources: resources === "lean" || resources === "abundant" ? resources : "standard",
    temperament: temperament === "calm" || temperament === "wild" ? temperament : "balanced",
    goal: goal === "survive" || goal === "explore" ? goal : "prosper",
    // This is an observer simulation: policy is expressed in writing, never by manual building control.
    auto: true,
    speed: [0, 1, 2, 4, 8, 96].includes(speed) ? speed : DEFAULT_CONFIG.speed,
    technology: technology === "developing" || technology === "advanced" ? technology : "primitive",
    visualStyle: visualStyle === "austere" || visualStyle === "radiant" ? visualStyle : "natural",
    origin: origin === "farmers" || origin === "city" || origin === "spacecraft" ? origin : "camp",
    archetype: archetype === "archipelago" || archetype === "shattered" || archetype === "frontier" ? archetype : "continental",
    // A new unaddressed visit gets a fresh geography; copying the generated
    // URL keeps that exact world replayable.
    seed: params.has("seed") && Number.isFinite(Number(params.get("seed"))) ? Number(params.get("seed")) : freshSeed(),
  };
}

/** A deliberately small, transparent interpreter for the world-setup prompt. */
export function configFromPrompt(prompt: string, base: SimulationConfig): SimulationConfig {
  const text = prompt.toLowerCase();
  if (!text.trim()) return base;
  return {
    ...base,
    resources: /hard|scarce|lean|survival/.test(text) ? "lean" : /rich|abundant|plenty|sandbox/.test(text) ? "abundant" : base.resources,
    temperament: /wild|chaos|volatile|storm/.test(text) ? "wild" : /calm|peaceful|slow/.test(text) ? "calm" : base.temperament,
    technology: /advanced|industrial|modern|high.tech/.test(text) ? "advanced" : /developing|medieval|craft/.test(text) ? "developing" : base.technology,
    goal: /explore|frontier|island|discovery/.test(text) ? "explore" : /survive|survival|winter/.test(text) ? "survive" : /wealth|prosper|gold|trade/.test(text) ? "prosper" : base.goal,
    auto: true,
    visualStyle: /austere|muted|bleak|minimal/.test(text) ? "austere" : /radiant|neon|vivid|bright/.test(text) ? "radiant" : base.visualStyle,
    origin: /spacecraft|spaceship|starship|orbital|space station|deep space/.test(text)
      ? "spacecraft"
      : /city|urban|metropolis/.test(text)
        ? "city"
        : /farmer|agricultur|village|agrarian/.test(text)
          ? "farmers"
          : base.origin,
    archetype: /continent|mainland|vast land/.test(text)
      ? "continental"
      : /shatter|fragment|broken sea|scattered/.test(text)
        ? "shattered"
        : /frontier|wilderness|untamed/.test(text)
          ? "frontier"
          : base.archetype,
  };
}

export function goalCopy(goal: SimulationGoal): string {
  if (goal === "survive") return "Goal: sustain 20 people through a winter.";
  if (goal === "explore") return "Goal: found settlements on 3 different isles.";
  return "Goal: build a prosperous settlement with 250 gold.";
}
