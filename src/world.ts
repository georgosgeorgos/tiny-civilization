import { hash2, hexDistance } from "./hex";

export const WORLD_CELL = 36;
export const VIEW_RADIUS = 64;
export const UNLOAD_RADIUS = 88;

export type LandKind =
  | "home"
  | "continent"
  | "volcano"
  | "jungle"
  | "desert"
  | "swamp"
  | "tundra"
  | "crystal"
  | "ruins"
  | "mesa"
  | "atoll"
  | "isles"
  | "metro"
  | "harbor";

export type ArchStyle = "rustic" | "adobe" | "ash" | "ice" | "harbor" | "metro" | "ancient";

export type Biome =
  | "grass"
  | "sand"
  | "rock"
  | "volcanic"
  | "crystal"
  | "ruin"
  | "snow"
  | "jungle"
  | "desert"
  | "swamp"
  | "urban"
  | "plaza";
export type Landmark = "none" | "vent" | "ruin" | "crystal" | "stone" | "mesa" | "oasis" | "tower" | "crane";

export type WorldSample = {
  land: true;
  kind: LandKind;
  biome: Biome;
  height: number;
  coast: boolean;
  buildable: boolean;
  landmark: Landmark;
  islandId: string;
};

export type Island = {
  q: number;
  r: number;
  radius: number;
  kind: LandKind;
};

const KINDS: LandKind[] = [
  "continent",
  "volcano",
  "jungle",
  "desert",
  "swamp",
  "tundra",
  "crystal",
  "ruins",
  "mesa",
  "atoll",
  "isles",
  "metro",
  "harbor",
];

const RING: Record<string, Island> = {
  "0,0": { q: 0, r: 0, radius: 11, kind: "home" },
  "1,0": { q: 33, r: 2, radius: 9, kind: "metro" },
  "-1,0": { q: -33, r: -2, radius: 8, kind: "harbor" },
  "0,1": { q: -8, r: 34, radius: 11, kind: "jungle" },
  "0,-1": { q: 5, r: -34, radius: 10, kind: "tundra" },
  "1,-1": { q: 30, r: -28, radius: 8, kind: "crystal" },
  "-1,1": { q: -30, r: 28, radius: 9, kind: "swamp" },
  "-1,-1": { q: -28, r: -30, radius: 9, kind: "desert" },
  "1,1": { q: 24, r: 32, radius: 7, kind: "isles" },
  "2,0": { q: 68, r: 3, radius: 8, kind: "mesa" },
  "0,2": { q: -5, r: 70, radius: 14, kind: "continent" },
  "-2,0": { q: -68, r: -4, radius: 8, kind: "ruins" },
  "0,-2": { q: 4, r: -70, radius: 8, kind: "atoll" },
  "2,1": { q: 62, r: 36, radius: 8, kind: "volcano" },
};

export function islandInCell(cq: number, cr: number): Island | null {
  const forced = RING[`${cq},${cr}`];
  if (forced) return forced;
  const spawn = hash2(cq * 31 + 7, cr * 17 + 3);
  if (spawn < 0.3) return null;
  const kind = KINDS[Math.floor(hash2(cq + 4, cr + 11) * KINDS.length) % KINDS.length] ?? "continent";
  const radius =
    kind === "continent"
      ? 12 + Math.floor(spawn * 7)
      : kind === "metro"
        ? 8 + Math.floor(spawn * 3)
        : kind === "isles"
          ? 6
          : kind === "jungle"
            ? 9 + Math.floor(spawn * 4)
            : 7 + Math.floor(spawn * 4);
  return {
    q: cq * WORLD_CELL + Math.floor((hash2(cq + 1, cr) - 0.5) * 8),
    r: cr * WORLD_CELL + Math.floor((hash2(cq, cr + 1) - 0.5) * 8),
    radius,
    kind,
  };
}

function covers(island: Island, q: number, r: number): { dist: number; warped: number } | null {
  const dist = hexDistance(q - island.q, r - island.r);
  const warp = (hash2(q + island.q, r + island.r) - 0.5) * 2.2;
  if (island.kind === "atoll") {
    const ring = Math.abs(dist - island.radius * 0.72);
    if (ring > 1.7 + warp * 0.3) return null;
    return { dist, warped: island.radius };
  }
  if (island.kind === "isles") {
    const blobs = [
      { q: 0, r: 0 },
      { q: 4, r: -2 },
      { q: -3, r: 3 },
    ];
    for (const blob of blobs) {
      const d = hexDistance(q - (island.q + blob.q), r - (island.r + blob.r));
      if (d < 2.6 + warp * 0.4) return { dist: d, warped: 2.6 };
    }
    return null;
  }
  if (dist > island.radius + warp) return null;
  return { dist, warped: island.radius + warp };
}

function findIsland(q: number, r: number): { island: Island; dist: number; radius: number } | null {
  const cq = Math.floor(q / WORLD_CELL);
  const cr = Math.floor(r / WORLD_CELL);
  let best: { island: Island; dist: number; radius: number } | null = null;
  for (let dq = -1; dq <= 1; dq += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const island = islandInCell(cq + dq, cr + dr);
      if (!island) continue;
      const hit = covers(island, q, r);
      if (!hit) continue;
      if (!best || hit.dist < best.dist) best = { island, dist: hit.dist, radius: hit.warped };
    }
  }
  return best;
}

export function sampleWorld(q: number, r: number): WorldSample | null {
  const hit = findIsland(q, r);
  if (!hit) return null;
  const { island, dist, radius } = hit;
  const n = hash2(q, r);
  const coast = dist >= radius - 1.05;
  let biome: Biome = "grass";
  let height = 0.35 + n * 0.2 + (1 - dist / Math.max(radius, 1)) * 0.45;
  let buildable = true;
  let landmark: Landmark = "none";

  if (island.kind === "home") {
    biome = coast ? "sand" : "grass";
  } else if (island.kind === "continent") {
    biome = coast ? "sand" : "grass";
    height += (1 - dist / Math.max(radius, 1)) * 0.55;
    if (!coast && height > 1.2 && n > 0.62) biome = "snow";
    if (!coast && n > 0.92) landmark = "stone";
  } else if (island.kind === "jungle") {
    biome = coast ? "sand" : "jungle";
    height = 0.45 + n * 0.18 + (1 - dist / Math.max(radius, 1)) * 0.5;
  } else if (island.kind === "desert") {
    biome = "desert";
    height = 0.4 + n * 0.28 + (coast ? 0 : 0.15);
    if (!coast && n > 0.78) landmark = "oasis";
  } else if (island.kind === "swamp") {
    biome = coast ? "sand" : "swamp";
    height = 0.28 + n * 0.12;
    buildable = !coast || n > 0.35;
  } else if (island.kind === "tundra") {
    biome = coast ? "sand" : "snow";
    height = 0.5 + n * 0.22 + (1 - dist / Math.max(radius, 1)) * 0.7;
  } else if (island.kind === "volcano") {
    biome = dist < 2.2 ? "volcanic" : coast ? "sand" : "rock";
    height = 0.8 + (1 - dist / Math.max(radius, 1)) * 2.6;
    if (dist < 1.6) {
      biome = "volcanic";
      buildable = false;
      landmark = "vent";
      height += 0.4;
    }
  } else if (island.kind === "crystal") {
    biome = coast ? "sand" : "crystal";
    height = 0.55 + n * 0.35;
    if (!coast && n > 0.48) landmark = "crystal";
    if (dist < 1.2) landmark = "crystal";
  } else if (island.kind === "ruins") {
    biome = coast ? "sand" : n > 0.42 ? "ruin" : "grass";
    if (!coast && n > 0.4) landmark = "ruin";
  } else if (island.kind === "mesa") {
    biome = coast ? "sand" : "rock";
    height = coast ? 0.7 : 2.2 + n * 0.14;
    if (!coast && n > 0.7) landmark = "mesa";
  } else if (island.kind === "atoll") {
    biome = "sand";
    height = 0.42 + n * 0.12;
  } else if (island.kind === "isles") {
    biome = coast ? "sand" : n > 0.55 ? "rock" : "grass";
  } else if (island.kind === "metro") {
    biome = coast ? "sand" : n > 0.78 ? "plaza" : "urban";
    height = 0.4 + n * 0.08;
    if (!coast && n > 0.9) landmark = "tower";
  } else if (island.kind === "harbor") {
    biome = coast ? "sand" : n > 0.55 ? "urban" : "grass";
    height = 0.42 + n * 0.1;
    if (coast && n > 0.72) landmark = "crane";
  }

  return {
    land: true,
    kind: island.kind,
    biome,
    height,
    coast,
    buildable,
    landmark,
    islandId: `${island.q},${island.r}`,
  };
}

export function styleForKind(kind: LandKind): ArchStyle {
  if (kind === "metro") return "metro";
  if (kind === "harbor") return "harbor";
  if (kind === "desert" || kind === "mesa") return "adobe";
  if (kind === "tundra") return "ice";
  if (kind === "volcano") return "ash";
  if (kind === "ruins") return "ancient";
  return "rustic";
}

export const DISCOVER_COPY: Record<LandKind, string> = {
  home: "This is your starting isle. Green and gentle.",
  continent: "A broad continent. Hills climb toward snow.",
  volcano: "A volcanic isle. The crater still glows.",
  jungle: "A dripping jungle. Palms crowd the ridges.",
  desert: "An ochre desert. Dunes and a rare oasis.",
  swamp: "A low swamp. Reeds and dark water.",
  tundra: "A frozen isle. Ice takes the high ground.",
  crystal: "A crystal shore. The rocks hum faintly.",
  ruins: "Sunken ruins. Someone was here before.",
  mesa: "Red mesas, flat as tabletops.",
  atoll: "A ring of sand around a quiet lagoon.",
  isles: "A scatter of tiny isles.",
  metro: "A modern city. Glass, steel, and night lights.",
  harbor: "A brick harbor town. Cranes lean over the docks.",
};
