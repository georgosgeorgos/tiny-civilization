import type { BuildingId } from "../buildings.ts";
import { SeededRandom } from "./random.ts";
import type { ClimateForcing } from "./climate.ts";
import type { CultureTraits, GenerativePractice, SimulationInputs } from "./types.ts";

const LAND_USE: Record<BuildingId, number> = {
  hut: 1, farm: 2, orchard: 3, lumber: 4, fishery: 5, mine: 6, market: 7, shrine: 8, forge: 9,
};
const BUILDING_FOR_USE = Object.entries(LAND_USE).map(([building, use]) => ({ building: building as BuildingId, use }));

export type CellularMetrics = {
  soil: number;
  forest: number;
  fish: number;
  water: number;
  minerals: number;
  disease: number;
  habitatDiversity: number;
  settlementFootprint: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const CELL_FIELDS = ["soil", "forest", "fish", "water", "minerals", "disease", "settlement", "suitability", "landUse"] as const;
export type CellularCheckpoint = {
  fields: Record<(typeof CELL_FIELDS)[number], number[]>;
  rebalanceDays: number;
};

/**
 * A small deterministic hex-like ecology. It gives the simulation local
 * feedback loops without requiring every rendered terrain tile in the worker.
 * Cells exchange recovery pressure with their neighbours, while settlement,
 * farming, logging and fishing leave distinct, persistent footprints.
 */
export class CellularEcology {
  private readonly size = 14;
  private readonly soil: Float32Array;
  private readonly forest: Float32Array;
  private readonly fish: Float32Array;
  private readonly water: Float32Array;
  private readonly minerals: Float32Array;
  private readonly disease: Float32Array;
  private readonly settlement: Float32Array;
  private readonly suitability: Float32Array;
  /** A persistent micro-land-use map. Counts still keep the simulation cheap,
   * but every work occupies one actual cell and competes for an eligible site. */
  private readonly landUse: Uint8Array;
  private rebalanceDays = 0;

  get checkpoint(): CellularCheckpoint {
    const fields = Object.fromEntries(CELL_FIELDS.map((field) => [field, Array.from(this[field])])) as CellularCheckpoint["fields"];
    return { fields, rebalanceDays: this.rebalanceDays };
  }

  restore(checkpoint: CellularCheckpoint): void {
    for (const field of CELL_FIELDS) this[field].set(checkpoint.fields[field]);
    this.rebalanceDays = checkpoint.rebalanceDays;
  }

  constructor(seed: number) {
    const length = this.size * this.size;
    this.soil = new Float32Array(length);
    this.forest = new Float32Array(length);
    this.fish = new Float32Array(length);
    this.water = new Float32Array(length);
    this.minerals = new Float32Array(length);
    this.disease = new Float32Array(length);
    this.settlement = new Float32Array(length);
    this.suitability = new Float32Array(length);
    this.landUse = new Uint8Array(length);
    const random = new SeededRandom(seed ^ 0x6d2b79f5);
    for (let i = 0; i < length; i += 1) {
      this.suitability[i] = 0.35 + random.next() * 0.65;
      this.soil[i] = 0.58 + random.next() * 0.34;
      this.forest[i] = 0.35 + random.next() * 0.5;
      this.fish[i] = 0.52 + random.next() * 0.36;
      // Water follows a separate basin field; mineral seams recover very
      // slowly, so mining leaves a regional historical footprint.
      this.water[i] = 0.3 + random.next() * 0.62;
      this.minerals[i] = 0.42 + random.next() * 0.5;
      this.disease[i] = random.next() * 0.06;
    }
  }

  advance(buildings: Record<BuildingId, number>, disruption: SimulationInputs["disruption"], days: number, culture?: CultureTraits, climate?: ClimateForcing, diseaseImport = 0, practices: GenerativePractice[] = [], cultureToEcology = true): CellularMetrics {
    // Long-horizon simulation converges in bounded batches rather than replaying every day.
    const iterations = Math.max(1, Math.min(240, Math.ceil(days * 2)));
    const dt = Math.min(0.5, days / iterations);
    const length = this.soil.length;
    const soilNext = new Float32Array(length);
    const forestNext = new Float32Array(length);
    const fishNext = new Float32Array(length);
    const waterNext = new Float32Array(length);
    const mineralsNext = new Float32Array(length);
    const diseaseNext = new Float32Array(length);
    const settlementNext = new Float32Array(length);
    this.reconcileLandUse(buildings);
    this.rebalanceDays += days;
    if (this.rebalanceDays >= 3) {
      this.rebalanceDays = 0;
      this.rebalanceLandUse();
    }
    const stewardship = culture?.stewardship ?? 0.45;
    const cooperation = culture?.cooperation ?? 0.45;
    const resilience = culture?.resilience ?? 0.45;
    const useCounts = this.landUseCounts();
    // A work's cell is the intense local footprint; dust, runoff, roads, and
    // harvesting pressure also extend lightly across its region. This avoids
    // a saturated single cell masking a real regional carrying-cost.
    const regionalFarmPressure = ((useCounts[LAND_USE.farm] ?? 0) + (useCounts[LAND_USE.orchard] ?? 0)) / length * 0.34 * (1 - stewardship * 0.24);
    const regionalWoodPressure = (useCounts[LAND_USE.lumber] ?? 0) / length * 2.0 * (1 - stewardship * 0.32);
    const regionalFishPressure = (useCounts[LAND_USE.fishery] ?? 0) / length * 0.3 * (1 - stewardship * 0.2);
    const regionalMinePressure = (useCounts[LAND_USE.mine] ?? 0) / length * 0.24;
    const disaster = disruption === "drought" ? 0.11 : disruption === "flood" ? 0.07 : disruption === "wildfire" ? 0.16 : disruption === "ash" ? 0.05 : 0;
    const rainfall = climate?.rainfall ?? 0.58;
    const drought = Math.max(disruption === "drought" ? 0.68 : 0, climate?.drought ?? 0);
    const flood = Math.max(disruption === "flood" ? 0.6 : 0, climate?.floodRisk ?? 0);

    let pSoil = 0;
    let pForest = 0;
    let pFish = 0;
    let pWater = 0;
    let pDisease = 0;
    if (cultureToEcology) {
      for (const practice of practices) {
        pSoil += practice.effects.soil;
        pForest += practice.effects.forest;
        pFish += practice.effects.water * 0.4;
        pWater += practice.effects.water;
        pDisease -= (practice.effects.food + practice.effects.stability) * 0.2;
      }
    }

    for (let step = 0; step < iterations; step += 1) {
      for (let i = 0; i < length; i += 1) {
        const neighbours = this.neighbourMean(i);
        const coast = i % this.size === 0 || i % this.size === this.size - 1 ? 1 : 0;
        const suitability = this.suitability[i];
        const localSettlement = this.settlement[i];
        const use = this.landUse[i] ?? 0;
        const farmPressure = regionalFarmPressure + ((use === LAND_USE.farm || use === LAND_USE.orchard) ? (1 - stewardship * 0.24) : 0);
        const woodPressure = regionalWoodPressure + (use === LAND_USE.lumber ? (1 - stewardship * 0.32) : 0);
        const fishPressure = regionalFishPressure + (use === LAND_USE.fishery ? (1 - stewardship * 0.2) : 0);
        const minePressure = regionalMinePressure + (use === LAND_USE.mine ? 1 : 0);
        const buildingHere = use === 0 ? 0 : Math.max(0, 0.25 + suitability * 1.6 - localSettlement * 0.04);
        const soilLogistic = this.soil[i] * (1 - this.soil[i]) * 4;
        const forestLogistic = this.forest[i] * (1 - this.forest[i]) * 4;
        const fishLogistic = this.fish[i] * (1 - this.fish[i]) * 4;
        const waterLogistic = this.water[i] * (1 - this.water[i]) * 4;
        soilNext[i] = clamp(this.soil[i] + dt * ((0.022 * neighbours.forest + 0.012 * suitability + stewardship * 0.012 + pSoil) * soilLogistic - farmPressure * (0.32 + suitability) - disaster * (1 - resilience * 0.28) - localSettlement * 0.018));
        forestNext[i] = clamp(this.forest[i] + dt * ((0.03 * this.soil[i] * (1 - localSettlement) + 0.04 * (neighbours.forest - this.forest[i]) + stewardship * 0.009 + pForest) * forestLogistic - woodPressure * 0.8 - (disruption === "wildfire" ? 0.24 * (1 - resilience * 0.3) : 0)));
        const fishPractice = pFish * (coast ? 1 : 0.5);
        fishNext[i] = clamp(this.fish[i] + dt * ((0.028 * coast + 0.018 * (neighbours.fish - this.fish[i]) + stewardship * 0.006 + fishPractice) * fishLogistic - fishPressure * (0.4 + coast * 0.7) + (disruption === "storm" ? 0.015 : 0)));
        waterNext[i] = clamp(this.water[i] + dt * (
          (0.024 * suitability + 0.065 * (neighbours.water - this.water[i]) + coast * 0.028 + stewardship * 0.006 + pWater) * waterLogistic -
          farmPressure * (0.16 + suitability * 0.18) + rainfall * 0.025 - drought * 0.18 - localSettlement * 0.011
        ));
        const mineralRecovery = use !== LAND_USE.mine ? 0.0001 : 0;
        mineralsNext[i] = clamp(this.minerals[i] + dt * (0.0025 * suitability + mineralRecovery + 0.005 * (neighbours.minerals - this.minerals[i]) - minePressure * (0.45 + suitability * 0.3)));
        diseaseNext[i] = clamp(this.disease[i] + dt * (
          localSettlement * (0.035 + (1 - this.water[i]) * 0.05) + flood * 0.035 + diseaseImport * 0.12 + pDisease -
          this.disease[i] * (0.06 + cooperation * 0.025 + resilience * 0.018)
        ));
        settlementNext[i] = clamp(localSettlement + dt * (buildingHere * (1.12 + cooperation * 0.45) - (1 - suitability) * 0.015 - disaster * 0.09));
      }
      this.soil.set(soilNext);
      this.forest.set(forestNext);
      this.fish.set(fishNext);
      this.water.set(waterNext);
      this.minerals.set(mineralsNext);
      this.disease.set(diseaseNext);
      this.settlement.set(settlementNext);
    }
    return this.metrics();
  }

  private neighbourMean(index: number): { forest: number; fish: number; water: number; minerals: number } {
    const x = index % this.size;
    const y = Math.floor(index / this.size);
    const offsets = y % 2 === 0 ? [[-1, 0], [1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]] : [[-1, 0], [1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];
    let forest = 0;
    let fish = 0;
    let water = 0;
    let minerals = 0;
    let count = 0;
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= this.size || ny < 0 || ny >= this.size) continue;
      const neighbour = ny * this.size + nx;
      forest += this.forest[neighbour] ?? 0;
      fish += this.fish[neighbour] ?? 0;
      water += this.water[neighbour] ?? 0;
      minerals += this.minerals[neighbour] ?? 0;
      count += 1;
    }
    return { forest: forest / Math.max(1, count), fish: fish / Math.max(1, count), water: water / Math.max(1, count), minerals: minerals / Math.max(1, count) };
  }

  /** Add works to their best remaining cells and remove only surplus works.
   * Existing choices persist, which lets a settlement remember its land use. */
  private reconcileLandUse(buildings: Record<BuildingId, number>): void {
    for (const { building, use } of BUILDING_FOR_USE) {
      const desired = Math.max(0, Math.floor(buildings[building] ?? 0));
      const occupied: number[] = [];
      for (let i = 0; i < this.landUse.length; i += 1) if (this.landUse[i] === use) occupied.push(i);
      if (occupied.length > desired) {
        for (const index of occupied.slice(desired)) this.landUse[index] = 0;
        continue;
      }
      for (let needed = desired - occupied.length; needed > 0; needed -= 1) {
        let best = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < this.landUse.length; i += 1) {
          if (this.landUse[i] !== 0) continue;
          const score = this.siteScore(i, building);
          if (score > bestScore) { best = i; bestScore = score; }
        }
        if (best < 0) break;
        this.landUse[best] = use;
      }
    }
  }

  private siteScore(index: number, building: BuildingId): number {
    const coast = index % this.size === 0 || index % this.size === this.size - 1 ? 1 : 0;
    const tieBreaker = ((index * 47) % 29) * 0.0001;
    if (building === "farm") return this.soil[index] * 1.1 + this.water[index] * 0.8 + this.suitability[index] * 0.25 + tieBreaker;
    if (building === "orchard") return this.soil[index] * 0.8 + this.forest[index] * 0.55 + this.water[index] * 0.35 + tieBreaker;
    if (building === "lumber") return this.forest[index] * 1.3 + this.suitability[index] * 0.2 + tieBreaker;
    if (building === "fishery") return coast * 1.6 + this.fish[index] * 0.7 + tieBreaker;
    if (building === "mine") return this.minerals[index] * 1.35 + (1 - this.water[index]) * 0.12 + tieBreaker;
    if (building === "hut") return this.suitability[index] * 0.75 + this.water[index] * 0.28 + this.soil[index] * 0.16 + tieBreaker;
    return this.suitability[index] * 0.65 + this.settlement[index] * 0.2 + tieBreaker;
  }

  /** A settlement may slowly abandon a damaged plot for a better vacant one.
   * At most one work of each kind moves per seasonal interval, preserving
   * history without allowing a frozen first-build order to decide everything. */
  private rebalanceLandUse(): void {
    for (const { building, use } of BUILDING_FOR_USE) {
      let worst = -1;
      let worstScore = Infinity;
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < this.landUse.length; i += 1) {
        const score = this.siteScore(i, building);
        if (this.landUse[i] === use && score < worstScore) { worst = i; worstScore = score; }
        if (this.landUse[i] === 0 && score > bestScore) { best = i; bestScore = score; }
      }
      if (worst >= 0 && best >= 0 && bestScore > worstScore + 0.12) {
        this.landUse[worst] = 0;
        this.landUse[best] = use;
      }
    }
  }

  private landUseCounts(): Uint16Array {
    const counts = new Uint16Array(10);
    for (const use of this.landUse) counts[use] += 1;
    return counts;
  }

  private metrics(): CellularMetrics {
    let soil = 0;
    let forest = 0;
    let fish = 0;
    let water = 0;
    let minerals = 0;
    let disease = 0;
    let settlement = 0;
    let diverse = 0;
    for (let i = 0; i < this.soil.length; i += 1) {
      soil += this.soil[i] ?? 0;
      forest += this.forest[i] ?? 0;
      fish += this.fish[i] ?? 0;
      water += this.water[i] ?? 0;
      minerals += this.minerals[i] ?? 0;
      disease += this.disease[i] ?? 0;
      settlement += this.settlement[i] ?? 0;
      if ((this.forest[i] ?? 0) > 0.35 && (this.fish[i] ?? 0) > 0.35 && (this.soil[i] ?? 0) > 0.35) diverse += 1;
    }
    const length = this.soil.length;
    return {
      soil: soil / length, forest: forest / length, fish: fish / length,
      water: water / length, minerals: minerals / length, disease: disease / length,
      habitatDiversity: diverse / length, settlementFootprint: settlement / length,
    };
  }
}
