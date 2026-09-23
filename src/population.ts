export type DeathRecord = {
  personIndex: number;
  name: string;
};

/** Annual births accumulate at a rate supported by adults, food, and household wellbeing.
 * Unmet capacity does not bank a future baby boom. */
export function annualBirths(context: {
  reproductiveAdults: number; population: number; housing: number;
  food: number; readiness: number; credit: number;
}): { births: number; credit: number } {
  const { reproductiveAdults, population, housing, food, readiness } = context;
  const room = Math.max(0, Math.floor(housing - population));
  if (reproductiveAdults < 2 || room === 0 || food < Math.max(4, population * 0.75) || readiness < 0.2) return { births: 0, credit: 0 };
  const security = Math.min(1, food / Math.max(4, population * 2.5));
  const expected = reproductiveAdults * 0.1 * security * Math.min(1, readiness);
  const total = Math.max(0, context.credit) + expected;
  const births = Math.min(room, Math.floor(total));
  return { births, credit: births === room ? 0 : total - births };
}

/** Hardship accumulates in person-years; a small village does not lose one
 * resident every few simulation days simply for crossing a risk threshold. */
export function hardshipLosses(context: { population: number; food: number; risk: number; years: number; credit: number }): { losses: number; credit: number } {
  if (context.population === 0 || context.food >= context.population * 0.5) return { losses: 0, credit: 0 };
  const expected = context.population * Math.max(0, Math.min(1, context.risk) - 0.25) * 0.18 * context.years;
  const total = context.credit + expected;
  const losses = Math.min(context.population, Math.floor(total));
  return { losses, credit: total - losses };
}

export function computeDeaths(
  people: readonly { age: number; seed: number; tribe: boolean; islandId: string; name: string }[],
  year: number,
  hash: (a: number, b: number) => number,
): DeathRecord[] {
  const deaths: DeathRecord[] = [];
  for (let i = 0; i < people.length; i++) {
    const person = people[i]!;
    if (person.age < 60) continue;
    const mortalityChance = Math.min(1, 0.015 * Math.exp((person.age - 60) / 9));
    if (hash(person.seed + year * 0.0037, year) < mortalityChance) {
      deaths.push({ personIndex: i, name: person.name });
    }
  }
  return deaths;
}
