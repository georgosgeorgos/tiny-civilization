export type CivHudState = {
  year: number;
  season: string;
  era: string;
  goal: string;
  clock: string;
  sky: string;
  day: number;
  gold: number;
  food: number;
  wood: number;
  mood: number;
  people: number;
  others: number;
  towns: number;
  tradeRoutes: number;
  housing: number;
  technology: number;
  evolution: string;
  capacity: number;
  health: number;
  land: number;
  culture: string;
  scenario?: "planet" | "spacecraft";
};

/** Keeps presentation concerns out of the simulation loop. */
export class Hud {
  private readonly hint = document.querySelector<HTMLElement>("#hint");
  private readonly turn = document.querySelector<HTMLElement>("#stat-turn");
  private readonly goal = document.querySelector<HTMLElement>("#stat-goal");
  private readonly clock = document.querySelector<HTMLElement>("#stat-clock");
  private readonly gold = document.querySelector<HTMLElement>("#stat-gold");
  private readonly food = document.querySelector<HTMLElement>("#stat-food");
  private readonly wood = document.querySelector<HTMLElement>("#stat-wood");
  private readonly mood = document.querySelector<HTMLElement>("#stat-mood");
  private readonly people = document.querySelector<HTMLElement>("#stat-people");
  private readonly towns = document.querySelector<HTMLElement>("#stat-isles");
  private readonly trade = document.querySelector<HTMLElement>("#stat-trade");
  private readonly technology = document.querySelector<HTMLElement>("#stat-tech");
  private readonly evolution = document.querySelector<HTMLElement>("#stat-evolution");
  private readonly health = document.querySelector<HTMLElement>("#stat-health");
  private readonly land = document.querySelector<HTMLElement>("#stat-land");
  private readonly culture = document.querySelector<HTMLElement>("#stat-culture");

  setHint(text: string): void {
    if (this.hint) this.hint.textContent = text;
  }

  refresh(state: CivHudState): void {
    if (this.turn) this.turn.textContent = `Year ${state.year} · ${state.season} · ${state.era}`;
    if (this.goal) this.goal.textContent = state.goal;
    if (this.clock) this.clock.textContent = `${state.clock} · ${state.sky} · Day ${state.day}`;
    const spacecraft = state.scenario === "spacecraft";
    this.setResource(this.gold, spacecraft ? "Research" : "Gold", state.gold, Math.min(100, state.gold / 1.4));
    this.setResource(this.food, spacecraft ? "Nutrients" : "Food", state.food, Math.min(100, state.food / Math.max(1, state.people * 3) * 100));
    this.setResource(this.wood, spacecraft ? "Materials" : "Wood", state.wood, Math.min(100, state.wood / 0.9));
    this.setResource(this.mood, "Mood", state.mood, state.mood);
    if (this.people) {
      const residents = state.others > 0 ? `${state.people} · ${state.others} abroad` : String(state.people);
      this.people.textContent = `People ${residents} / ${state.housing}`;
      this.people.classList.toggle("warning", state.people > state.housing);
    }
    if (this.towns) this.towns.textContent = `Towns ${state.towns}`;
    if (this.trade) this.trade.textContent = `Routes ${state.tradeRoutes}`;
    if (this.technology) this.technology.textContent = `Tech ${state.technology}`;
    if (this.evolution) this.evolution.textContent = `${state.evolution} · cap ${state.capacity}`;
    if (this.culture) this.culture.textContent = state.culture;
    this.setResource(this.health, "Health", state.health, state.health);
    this.setResource(this.land, spacecraft ? "Hull" : "Land", state.land, state.land);
  }

  private setResource(element: HTMLElement | null, label: string, value: number, level: number): void {
    if (!element) return;
    element.textContent = `${label} ${Math.floor(value)}`;
    element.style.setProperty("--level", `${Math.max(0, Math.min(100, level))}%`);
    element.classList.toggle("warning", level < 25);
  }
}
