import type { Stores } from "./types.ts";

export const zeroStores = (): Stores => ({ food: 0, wood: 0, gold: 0 });

export function storeDifference(next: Stores, previous: Stores): Stores {
  return { food: next.food - previous.food, wood: next.wood - previous.wood, gold: next.gold - previous.gold };
}

export function addStores(stores: Stores, change: Stores): Stores {
  return { food: stores.food + change.food, wood: stores.wood + change.wood, gold: stores.gold + change.gold };
}
