export type WorldTemperament = "calm" | "balanced" | "wild";
export type SimulationGoal = "survive" | "prosper" | "explore";

export type SimulationConfig = {
  resources: "lean" | "standard" | "abundant";
  temperament: WorldTemperament;
  goal: SimulationGoal;
  auto: boolean;
  speed: number;
};

export const DEFAULT_CONFIG: SimulationConfig = {
  resources: "standard",
  temperament: "balanced",
  goal: "prosper",
  auto: true,
  speed: 4,
};

export function configFromSearch(search: string): SimulationConfig {
  const params = new URLSearchParams(search);
  const resources = params.get("resources");
  const temperament = params.get("temperament");
  const goal = params.get("goal");
  const speed = Number(params.get("speed"));
  return {
    resources: resources === "lean" || resources === "abundant" ? resources : "standard",
    temperament: temperament === "calm" || temperament === "wild" ? temperament : "balanced",
    goal: goal === "survive" || goal === "explore" ? goal : "prosper",
    auto: params.get("auto") !== "off",
    speed: [0, 1, 2, 4, 8].includes(speed) ? speed : DEFAULT_CONFIG.speed,
  };
}

export function goalCopy(goal: SimulationGoal): string {
  if (goal === "survive") return "Goal: sustain 20 people through a winter.";
  if (goal === "explore") return "Goal: found settlements on 3 different isles.";
  return "Goal: build a prosperous settlement with 250 gold.";
}
