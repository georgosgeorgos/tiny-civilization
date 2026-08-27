export type WorldTemperament = "calm" | "balanced" | "wild";
export type SimulationGoal = "survive" | "prosper" | "explore";
export type TechnologyStart = "primitive" | "developing" | "advanced";
export type VisualStyle = "natural" | "austere" | "radiant";

export type SimulationConfig = {
  resources: "lean" | "standard" | "abundant";
  temperament: WorldTemperament;
  goal: SimulationGoal;
  auto: boolean;
  speed: number;
  technology: TechnologyStart;
  visualStyle: VisualStyle;
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
  seed: 1337,
};

export function configFromSearch(search: string): SimulationConfig {
  const params = new URLSearchParams(search);
  const resources = params.get("resources");
  const temperament = params.get("temperament");
  const goal = params.get("goal");
  const speed = Number(params.get("speed"));
  const technology = params.get("technology");
  const visualStyle = params.get("style");
  return {
    resources: resources === "lean" || resources === "abundant" ? resources : "standard",
    temperament: temperament === "calm" || temperament === "wild" ? temperament : "balanced",
    goal: goal === "survive" || goal === "explore" ? goal : "prosper",
    auto: params.get("auto") !== "off",
    speed: [0, 1, 2, 4, 8].includes(speed) ? speed : DEFAULT_CONFIG.speed,
    technology: technology === "developing" || technology === "advanced" ? technology : "primitive",
    visualStyle: visualStyle === "austere" || visualStyle === "radiant" ? visualStyle : "natural",
    seed: Number.isFinite(Number(params.get("seed"))) ? Number(params.get("seed")) : DEFAULT_CONFIG.seed,
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
    auto: /manual|myself|no auto/.test(text) ? false : /auto|autonomous|hands.off/.test(text) ? true : base.auto,
    visualStyle: /austere|muted|bleak|minimal/.test(text) ? "austere" : /radiant|neon|vivid|bright/.test(text) ? "radiant" : base.visualStyle,
  };
}

export function goalCopy(goal: SimulationGoal): string {
  if (goal === "survive") return "Goal: sustain 20 people through a winter.";
  if (goal === "explore") return "Goal: found settlements on 3 different isles.";
  return "Goal: build a prosperous settlement with 250 gold.";
}
