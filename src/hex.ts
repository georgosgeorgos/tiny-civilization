export type Axial = { q: number; r: number };

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Pointy-top axial hex → world XZ. */
export function hexToWorld(q: number, r: number, size: number): { x: number; z: number } {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const z = size * 1.5 * r;
  return { x, z };
}

export function hexDistance(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(q: number, r: number): Axial[] {
  return HEX_DIRS.map((dir) => ({ q: q + dir.q, r: r + dir.r }));
}

export function hash2(q: number, r: number): number {
  const n = Math.sin(q * 127.1 + r * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function hexesInRadius(radius: number): Axial[] {
  const hexes: Axial[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}

export function worldToHex(x: number, z: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / size;
  const r = ((2 / 3) * z) / size;
  return cubeRound(q, r);
}

function cubeRound(fracQ: number, fracR: number): Axial {
  const fracS = -fracQ - fracR;
  let q = Math.round(fracQ);
  let r = Math.round(fracR);
  let s = Math.round(fracS);
  const dq = Math.abs(q - fracQ);
  const dr = Math.abs(r - fracR);
  const ds = Math.abs(s - fracS);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
