import type { Stores } from "./types.ts";

export type TradeGood = "food" | "wood";
export type MarketRegion = { stores: Stores; population: number };
export type Shipment = { good: TradeGood; amount: number; price: number; credit: number };

/** Chooses one physically constrained shipment from surplus to scarcity. */
export function settleShipment(source: MarketRegion, destination: MarketRegion, capacity: number, weatherRisk: number): { source: Stores; destination: Stores; shipment: Shipment | null } {
  const target = (region: MarketRegion, good: TradeGood) => good === "food" ? region.population * 2.6 : region.population * 0.85 + 3;
  const goods: TradeGood[] = ["food", "wood"];
  const good = [...goods].sort((a, b) => (source.stores[b] - target(source, b) - (destination.stores[b] - target(destination, b))) - (source.stores[a] - target(source, a) - (destination.stores[a] - target(destination, a))))[0] ?? "food";
  const surplus = Math.max(0, source.stores[good] - target(source, good));
  const shortage = Math.max(0, target(destination, good) - destination.stores[good]);
  const amount = Math.min(surplus, shortage, Math.max(0, capacity * (1 - weatherRisk)));
  if (amount < 0.08) return { source: { ...source.stores }, destination: { ...destination.stores }, shipment: null };
  const price = (good === "food" ? 1.15 : 1.45) * (1 + shortage / Math.max(1, target(destination, good)));
  const credit = amount * price;
  const sourceStores = { ...source.stores, [good]: source.stores[good] - amount, gold: source.stores.gold + credit };
  const destinationStores = { ...destination.stores, [good]: destination.stores[good] + amount, gold: Math.max(0, destination.stores.gold - credit) };
  return { source: sourceStores, destination: destinationStores, shipment: { good, amount, price, credit } };
}
