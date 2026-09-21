import type { BasinCell, BasinWorld, Route, Settlement } from "./types.ts";

const WIDTH = 48;
const HEIGHT = 36;

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

/** A small integer hash gives us repeatable variation without global random state. */
function hash(seed: number, x: number, z: number, salt = 0): number {
  let value = (seed | 0) ^ Math.imul(x + 0x51ed270b, 0x45d9f3b);
  value ^= Math.imul(z + 0x2f6e2b1, 0x119de1f3);
  value ^= Math.imul(salt + 0x1b873593, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function noise(seed: number, x: number, z: number, salt = 0): number {
  return hash(seed, x, z, salt) / 0xffffffff;
}

function cellId(x: number, z: number): number {
  return z * WIDTH + x;
}

function riverCenters(seed: number): number[] {
  const centers: number[] = [];
  let center = 22 + Math.floor(noise(seed, 0, 0, 11) * 5);
  for (let z = 0; z < HEIGHT; z += 1) {
    // A bounded random walk makes a coherent, gently meandering channel.
    const target = 18 + Math.floor(noise(seed, Math.floor(z / 4), 73, 12) * 14);
    const step = center < target ? 1 : center > target ? -1 : (noise(seed, z, 19, 13) > 0.56 ? 1 : -1);
    if (z > 0 && noise(seed, z, 29, 14) < 0.42) center += step;
    center = Math.max(10, Math.min(WIDTH - 11, center));
    centers.push(center);
  }
  return centers;
}

function distanceToRiver(x: number, z: number, centers: number[]): number {
  let distance = WIDTH;
  // Looking over nearby rows follows the actual channel around bends better than
  // comparing with only the river cell in this row.
  for (let row = Math.max(0, z - 5); row <= Math.min(HEIGHT - 1, z + 5); row += 1) {
    distance = Math.min(distance, Math.abs(x - centers[row]) + Math.abs(z - row) * 0.35);
  }
  return distance;
}

function nearestSettlement(x: number, z: number, settlements: BasinWorld["settlements"]): string {
  let best = settlements[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const settlement of settlements) {
    const dx = x - settlement.x;
    const dz = z - settlement.z;
    // A little terrain affinity makes catchments feel physical while preserving
    // nearest-site ownership as the primary rule.
    const score = dx * dx + dz * dz;
    if (score < bestScore || (score === bestScore && settlement.id < best.id)) {
      best = settlement;
      bestScore = score;
    }
  }
  return best.id;
}

export function generateBasin(seed: number): BasinWorld {
  const centers = riverCenters(seed);
  const settlements: BasinWorld["settlements"] = [
    {
      id: "willowbank",
      name: "Willowbank",
      x: Math.max(2, centers[10] - 2),
      z: 10,
      specialty: "farmer",
    },
    { id: "pinewatch", name: "Pinewatch", x: 8, z: 15, specialty: "woodcutter" },
    { id: "stoneford", name: "Stoneford", x: 39, z: 24, specialty: "toolmaker" },
  ];

  const riverIds = new Set<number>();
  for (let z = 0; z < HEIGHT; z += 1) riverIds.add(cellId(centers[z], z));

  const cells: BasinCell[] = [];
  for (let z = 0; z < HEIGHT; z += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const id = cellId(x, z);
      const river = riverIds.has(id);
      const distance = distanceToRiver(x, z, centers);
      const riverInfluence = Math.exp(-distance / 5.2);
      const elevation =
        100 - z * 1.85 + (noise(seed, x, z, 21) - 0.5) * 0.72 + (noise(seed, Math.floor(x / 4), Math.floor(z / 4), 22) - 0.5) * 0.44;
      const elevationBand = clamp((elevation - 34) / 66);
      const moisture = clamp(0.1 + riverInfluence * 0.74 + (1 - elevationBand) * 0.1 + (noise(seed, x, z, 23) - 0.5) * 0.08);
      const floodplain = riverInfluence * (1 - elevationBand);
      const woodlandBand = x < centers[z] - 5 || x > centers[z] + 6 ? 0.22 : 0;
      const forest = clamp(0.08 + elevationBand * 0.22 + woodlandBand + (1 - floodplain) * 0.28 + (noise(seed, x, z, 24) - 0.5) * 0.14);
      const fertility = clamp(0.14 + moisture * 0.55 + riverInfluence * 0.24 - forest * 0.12 + (noise(seed, x, z, 25) - 0.5) * 0.08);
      cells.push({ id, x, z, elevation, moisture, fertility, forest, river, downstream: null, settlementId: nearestSettlement(x, z, settlements) });
    }
  }

  // Every downstream pointer is a strictly descending edge. Strict descent also
  // makes the drainage graph acyclic by construction.
  for (const cell of cells) {
    const candidates: BasinCell[] = [];
    if (cell.x > 0) candidates.push(cells[cell.id - 1]);
    if (cell.x < WIDTH - 1) candidates.push(cells[cell.id + 1]);
    if (cell.z > 0) candidates.push(cells[cell.id - WIDTH]);
    if (cell.z < HEIGHT - 1) candidates.push(cells[cell.id + WIDTH]);

    // Keep the named river channel flowing from one river cell into the next.
    if (cell.river && cell.z < HEIGHT - 1) {
      const nextRiver = cells[cellId(centers[cell.z + 1], cell.z + 1)];
      if (nextRiver.elevation < cell.elevation) cell.downstream = nextRiver.id;
    }
    if (cell.downstream === null) {
      const lower = candidates.filter((candidate) => candidate.elevation < cell.elevation);
      if (lower.length > 0) {
        lower.sort((a, b) => a.elevation - b.elevation || a.id - b.id);
        cell.downstream = lower[0].id;
      }
    }
  }

  return { seed, width: WIDTH, height: HEIGHT, cells, settlements };
}

type QueueEntry = { id: number; cost: number };

function routeCost(from: BasinCell, to: BasinCell, bridged: boolean): number {
  const slope = Math.max(0, to.elevation - from.elevation);
  const crossing = from.river !== to.river;
  // Bridges are a property of a settlement's crossing and make the crossing
  // itself cheaper; a route may use the crossing from either endpoint.
  return 1 + slope * 0.32 + (crossing ? (bridged ? 1.35 : 7.2) : 0) + to.forest * 0.08;
}

function shortestPath(world: BasinWorld, start: number, goal: number, bridged: boolean): { cells: number[]; cost: number } {
  const count = world.cells.length;
  const distances = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(count).fill(-1);
  const open: QueueEntry[] = [{ id: start, cost: 0 }];
  distances[start] = 0;

  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost || a.id - b.id);
    const current = open.shift() as QueueEntry;
    if (current.cost !== distances[current.id]) continue;
    if (current.id === goal) break;
    const x = current.id % world.width;
    const z = Math.floor(current.id / world.width);
    const neighborIds: number[] = [];
    if (x > 0) neighborIds.push(current.id - 1);
    if (x < world.width - 1) neighborIds.push(current.id + 1);
    if (z > 0) neighborIds.push(current.id - world.width);
    if (z < world.height - 1) neighborIds.push(current.id + world.width);
    for (const nextId of neighborIds) {
      const nextCost = current.cost + routeCost(world.cells[current.id], world.cells[nextId], bridged);
      if (nextCost < distances[nextId] - 1e-9) {
        distances[nextId] = nextCost;
        previous[nextId] = current.id;
        open.push({ id: nextId, cost: nextCost });
      }
    }
  }

  const path: number[] = [];
  for (let at = goal; at >= 0; at = previous[at]) {
    path.push(at);
    if (at === start) break;
  }
  path.reverse();
  return { cells: path, cost: distances[goal] };
}

export function buildRoutes(world: BasinWorld, settlements: Pick<Settlement, "id" | "x" | "z" | "bridge">[]): Route[] {
  const routes: Route[] = [];
  for (let i = 0; i < settlements.length; i += 1) {
    for (let j = i + 1; j < settlements.length; j += 1) {
      const from = settlements[i];
      const to = settlements[j];
      const fromX = Math.max(0, Math.min(world.width - 1, Math.round(from.x)));
      const fromZ = Math.max(0, Math.min(world.height - 1, Math.round(from.z)));
      const toX = Math.max(0, Math.min(world.width - 1, Math.round(to.x)));
      const toZ = Math.max(0, Math.min(world.height - 1, Math.round(to.z)));
      const bridged = Boolean(from.bridge || to.bridge);
      const path = shortestPath(world, cellId(fromX, fromZ), cellId(toX, toZ), bridged);
      const distance = Math.max(0, path.cells.length - 1);
      const travelSeasons = Math.max(1, Math.min(3, Math.ceil(path.cost / 18)));
      routes.push({
        id: `route-${from.id}-${to.id}`,
        from: from.id,
        to: to.id,
        cells: path.cells,
        distance,
        travelSeasons,
        capacity: bridged ? 48 : 24,
        bridge: bridged,
        traded: 0,
      });
    }
  }
  return routes;
}
