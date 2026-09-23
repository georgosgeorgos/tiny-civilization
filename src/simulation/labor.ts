import type { BuildingId } from '../buildings.ts';

/** Allocate actual working-age residents before computing output. Food shortages
 * move labor back to subsistence; a surplus leaves room for specialist work. */
export function allocateLabor(
  residents: readonly { id: string; age: number }[],
  workplaces: readonly { id: string; kind: BuildingId; workers: number }[],
  stores: { food: number; wood: number },
): Map<string, string> {
  const adults = residents.filter((person) => person.age >= 16 && person.age < 65);
  const foodKinds = ['fishery', 'orchard', 'farm'];
  const fields = workplaces.filter((work) => foodKinds.includes(work.kind)).sort((a, b) => foodKinds.indexOf(a.kind) - foodKinds.indexOf(b.kind));
  const specialties = workplaces.filter((work) => !foodKinds.includes(work.kind) && work.kind !== 'hut');
  const priority = stores.wood < 8 ? ['lumber', 'market', 'shrine', 'mine', 'forge'] : ['market', 'lumber', 'shrine', 'forge', 'mine'];
  specialties.sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind));
  const assignments = new Map<string, string>();
  const occupied = new Map<string, number>();
  let cursor = 0;
  function fill(works: typeof workplaces, limit: number): void {
    for (const work of works) {
      while ((occupied.get(work.id) ?? 0) < work.workers && cursor < adults.length && limit > 0) {
        assignments.set(adults[cursor++].id, work.id);
        occupied.set(work.id, (occupied.get(work.id) ?? 0) + 1);
        limit--;
      }
    }
  }
  const foodTarget = Math.ceil(residents.length * (stores.food < residents.length * 2.5 ? 0.8 : 0.5));
  fill(fields, foodTarget);
  fill(specialties, adults.length - cursor);
  fill(fields, adults.length - cursor);
  return assignments;
}
