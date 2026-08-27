export type CivHudState = {
  year: number;
  season: string;
  era: string;
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
  housing: number;
};

/** Keeps presentation concerns out of the simulation loop. */
export class Hud {
  private readonly hint = document.querySelector<HTMLElement>("#hint");
  private readonly turn = document.querySelector<HTMLElement>("#stat-turn");
  private readonly clock = document.querySelector<HTMLElement>("#stat-clock");
  private readonly gold = document.querySelector<HTMLElement>("#stat-gold");
  private readonly food = document.querySelector<HTMLElement>("#stat-food");
  private readonly wood = document.querySelector<HTMLElement>("#stat-wood");
  private readonly mood = document.querySelector<HTMLElement>("#stat-mood");
  private readonly people = document.querySelector<HTMLElement>("#stat-people");
  private readonly towns = document.querySelector<HTMLElement>("#stat-isles");

  setHint(text: string): void {
    if (this.hint) this.hint.textContent = text;
  }

  refresh(state: CivHudState): void {
    if (this.turn) this.turn.textContent = `Year ${state.year} · ${state.season} · ${state.era}`;
    if (this.clock) this.clock.textContent = `${state.clock} · ${state.sky} · Day ${state.day}`;
    this.setResource(this.gold, "Gold", state.gold, Math.min(100, state.gold / 1.4));
    this.setResource(this.food, "Food", state.food, Math.min(100, state.food / Math.max(1, state.people * 3) * 100));
    this.setResource(this.wood, "Wood", state.wood, Math.min(100, state.wood / 0.9));
    this.setResource(this.mood, "Mood", state.mood, state.mood);
    if (this.people) {
      const residents = state.others > 0 ? `${state.people} · ${state.others} abroad` : String(state.people);
      this.people.textContent = `People ${residents} / ${state.housing}`;
      this.people.classList.toggle("warning", state.people > state.housing);
    }
    if (this.towns) this.towns.textContent = `Towns ${state.towns}`;
  }

  private setResource(element: HTMLElement | null, label: string, value: number, level: number): void {
    if (!element) return;
    element.textContent = `${label} ${Math.floor(value)}`;
    element.style.setProperty("--level", `${Math.max(0, Math.min(100, level))}%`);
    element.classList.toggle("warning", level < 25);
  }
}
