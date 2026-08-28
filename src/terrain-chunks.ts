import * as THREE from "three";
import { hash2, hexDistance, hexToWorld } from "./hex";
import { makeHexColumn } from "./models";
import { WORLD_CHUNK_SIZE, chunkKey, type WorldState } from "./world-state";
import type { Biome } from "./world";
import type { VisualStyle } from "./config";

type ResidentChunk = { group: THREE.Group; q: number; r: number };

const BIOME_COLORS: Record<Biome, number> = {
  grass: 0x4f8b45,
  sand: 0xcaa36b,
  rock: 0x6d6761,
  volcanic: 0x4a2924,
  crystal: 0x537d87,
  ruin: 0x80796c,
  snow: 0xd6e0e2,
  jungle: 0x276336,
  desert: 0xbd8648,
  swamp: 0x53603a,
  urban: 0x49505a,
  plaza: 0xa8a39a,
};

/**
 * GPU-instanced mid/far terrain. Interactive, full-detail Tile meshes are kept
 * inside the near radius by Game; this renderer fills the much larger horizon.
 */
export class TerrainChunks {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, ResidentChunk>();
  private readonly column = makeHexColumn();
  private readonly flat = new THREE.CylinderGeometry(0.91, 0.99, 0.16, 6);
  private readonly materials = new Map<Biome, THREE.MeshStandardMaterial>();
  private readonly treeGeometry = new THREE.ConeGeometry(0.16, 0.55, 5);
  private readonly treeMaterial = new THREE.MeshStandardMaterial({ color: 0x245a31, roughness: 0.92, flatShading: true });
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private queued = new Set<string>();

  constructor(
    private readonly world: WorldState,
    private readonly nearRadius = 31,
    private readonly farRadius = 148,
    private readonly visualStyle: VisualStyle = "natural",
  ) {
    this.group.name = "instanced-terrain-chunks";
  }

  update(focusQ: number, focusR: number): void {
    const centerQ = Math.floor(focusQ / WORLD_CHUNK_SIZE);
    const centerR = Math.floor(focusR / WORLD_CHUNK_SIZE);
    const chunkRadius = Math.ceil(this.farRadius / WORLD_CHUNK_SIZE) + 1;
    for (let q = centerQ - chunkRadius; q <= centerQ + chunkRadius; q += 1) {
      for (let r = centerR - chunkRadius; r <= centerR + chunkRadius; r += 1) {
        const key = chunkKey(q, r);
        if (this.chunks.has(key) || this.queued.has(key)) continue;
        const cq = q * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2;
        const cr = r * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2;
        if (hexDistance(cq - focusQ, cr - focusR) > this.farRadius + WORLD_CHUNK_SIZE) continue;
        this.queued.add(key);
      }
    }

    // Building one chunk per frame prevents camera pans from producing long GC stalls.
    const next = this.queued.values().next().value as string | undefined;
    if (next) {
      this.queued.delete(next);
      const [q, r] = next.split(",").map(Number);
      this.addChunk(q, r, focusQ, focusR);
    }

    for (const [key, chunk] of this.chunks) {
      const cq = chunk.q * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2;
      const cr = chunk.r * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2;
      if (hexDistance(cq - focusQ, cr - focusR) <= this.farRadius + WORLD_CHUNK_SIZE * 2) continue;
      this.group.remove(chunk.group);
      this.chunks.delete(key);
    }
  }

  private addChunk(chunkQ: number, chunkR: number, focusQ: number, focusR: number): void {
    const key = chunkKey(chunkQ, chunkR);
    if (this.chunks.has(key)) return;
    const midByBiome = new Map<Biome, { q: number; r: number; height: number }[]>();
    const farByBiome = new Map<Biome, { q: number; r: number; height: number }[]>();
    const trees: { q: number; r: number; height: number; scale: number }[] = [];
    const q0 = chunkQ * WORLD_CHUNK_SIZE;
    const r0 = chunkR * WORLD_CHUNK_SIZE;
    for (let q = q0; q < q0 + WORLD_CHUNK_SIZE; q += 1) {
      for (let r = r0; r < r0 + WORLD_CHUNK_SIZE; r += 1) {
        if (hexDistance(q - focusQ, r - focusR) <= this.nearRadius) continue;
        const sample = this.world.sample(q, r);
        if (!sample || this.world.hasBuilding(q, r)) continue;
        const distance = hexDistance(q - focusQ, r - focusR);
        const byBiome = distance > 88 ? farByBiome : midByBiome;
        const entries = byBiome.get(sample.biome) ?? [];
        const height = Math.max(0.45, sample.height);
        entries.push({ q, r, height });
        byBiome.set(sample.biome, entries);
        const density = sample.biome === "jungle" ? 0.42 : sample.biome === "grass" ? 0.15 : sample.biome === "snow" ? 0.09 : 0;
        if (hash2(q + 19, r - 7) < density) trees.push({ q, r, height, scale: 0.55 + hash2(q - 3, r + 31) * 0.55 });
      }
    }
    const group = new THREE.Group();
    group.name = `terrain-chunk:${key}`;
    this.addTerrainInstances(group, midByBiome, false);
    this.addTerrainInstances(group, farByBiome, true);
    if (trees.length > 0) {
      const mesh = new THREE.InstancedMesh(this.treeGeometry, this.treeMaterial, trees.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      for (let i = 0; i < trees.length; i += 1) {
        const tree = trees[i];
        const world = hexToWorld(tree.q, tree.r, 1);
        this.position.set(world.x, tree.height - 0.1, world.z);
        this.scale.setScalar(tree.scale);
        this.matrix.compose(this.position, this.rotation, this.scale);
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    if (group.children.length === 0) return;
    this.group.add(group);
    this.chunks.set(key, { group, q: chunkQ, r: chunkR });
  }

  private addTerrainInstances(group: THREE.Group, byBiome: Map<Biome, { q: number; r: number; height: number }[]>, far: boolean): void {
    for (const [biome, entries] of byBiome) {
      const mesh = new THREE.InstancedMesh(far ? this.flat : this.column, this.materialFor(biome), entries.length);
      mesh.castShadow = false;
      mesh.receiveShadow = !far;
      mesh.frustumCulled = true;
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const world = hexToWorld(entry.q, entry.r, 1);
        this.position.set(world.x, far ? entry.height - 0.14 : entry.height * 0.5 - 0.14, world.z);
        this.scale.set(1, far ? 1 : entry.height, 1);
        this.matrix.compose(this.position, this.rotation, this.scale);
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
  }

  private materialFor(biome: Biome): THREE.MeshStandardMaterial {
    let material = this.materials.get(biome);
    if (!material) {
      const color = new THREE.Color(BIOME_COLORS[biome]);
      if (this.visualStyle === "austere") color.lerp(new THREE.Color(0x60747a), 0.32).offsetHSL(0, -0.18, -0.05);
      if (this.visualStyle === "radiant") color.offsetHSL(0.015, 0.16, 0.09);
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
      this.materials.set(biome, material);
    }
    return material;
  }
}
