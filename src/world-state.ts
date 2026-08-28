import type { BuildingId } from "./buildings";
import { hexKey } from "./hex";
import { sampleWorld, type WorldSample } from "./world";
import type { WorldArchetype } from "./config";

/** Logical storage is deliberately coarser than rendering. A chunk can remain
 * simulated while none of its terrain meshes are resident on the GPU. */
export const WORLD_CHUNK_SIZE = 24;

/** Political control is deliberately separate from physical ownership. A tile can
 * be economically used, remembered after a collapse, or actively contested. */
export type TerritorialClaim = "none" | "habitation" | "economic" | "sovereignty" | "memory" | "contested";

export type StoredTile = {
  building: BuildingId | null;
  owner: "player" | "tribe" | null;
  territory: TerritorialClaim;
  /** `player` or the regional society id. The second claimant is retained for a frontier dispute. */
  claimant: string | null;
  contestedWith: string | null;
  buildLeft: number;
  buildTotal: number;
  ready: boolean;
};

export type WorldChunk = {
  key: string;
  q: number;
  r: number;
  tiles: Map<string, StoredTile>;
  lastTouched: number;
};

const EMPTY_TILE: StoredTile = {
  building: null,
  owner: null,
  territory: "none",
  claimant: null,
  contestedWith: null,
  buildLeft: 0,
  buildTotal: 0,
  ready: false,
};

export function chunkCoordinates(q: number, r: number): { q: number; r: number } {
  return { q: Math.floor(q / WORLD_CHUNK_SIZE), r: Math.floor(r / WORLD_CHUNK_SIZE) };
}

export function chunkKey(q: number, r: number): string {
  return `${q},${r}`;
}

/**
 * Source of truth for mutable map state. Terrain remains procedural, while
 * construction and ownership are retained even after their render chunk unloads.
 */
export class WorldState {
  private readonly chunks = new Map<string, WorldChunk>();
  private tick = 0;
  private readonly seed: number;
  private readonly archetype: WorldArchetype;

  constructor(seed = 1337, archetype: WorldArchetype = "continental") {
    this.seed = seed;
    this.archetype = archetype;
  }

  sample(q: number, r: number): WorldSample | null {
    return sampleWorld(q, r, this.seed, this.archetype);
  }

  tile(q: number, r: number): StoredTile {
    const chunk = this.chunkFor(q, r);
    chunk.lastTouched = ++this.tick;
    return chunk.tiles.get(hexKey(q, r)) ?? EMPTY_TILE;
  }

  save(q: number, r: number, state: StoredTile): void {
    const chunk = this.chunkFor(q, r);
    chunk.lastTouched = ++this.tick;
    const key = hexKey(q, r);
    if (!state.building && !state.owner && state.territory === "none") {
      chunk.tiles.delete(key);
      return;
    }
    chunk.tiles.set(key, { ...state });
  }

  hasBuilding(q: number, r: number): boolean {
    const coords = chunkCoordinates(q, r);
    return Boolean(this.chunks.get(chunkKey(coords.q, coords.r))?.tiles.get(hexKey(q, r))?.building);
  }

  activeChunks(): readonly WorldChunk[] {
    return [...this.chunks.values()];
  }

  private chunkFor(q: number, r: number): WorldChunk {
    const coords = chunkCoordinates(q, r);
    const key = chunkKey(coords.q, coords.r);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { key, ...coords, tiles: new Map(), lastTouched: ++this.tick };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }
}
