import type { BuildingId } from "../buildings.ts";
import { SeededRandom } from "./random.ts";
import type { ClimateForcing } from "./climate.ts";
import type { CultureTraits, SimulationInputs } from "./types.ts";

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

  advance(buildings: Record<BuildingId, number>, disruption: SimulationInputs["disruption"], days: number, culture?: CultureTraits, climate?: ClimateForcing): CellularMetrics {
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
    const buildingsTotal = Object.values(buildings).reduce((total, value) => total + value, 0);
    const stewardship = culture?.stewardship ?? 0.45;
    const cooperation = culture?.cooperation ?? 0.45;
    const resilience = culture?.resilience ?? 0.45;
    const farmPressure = buildings.farm / length * (1 - stewardship * 0.24);
    const woodPressure = buildings.lumber / length * (1 - stewardship * 0.32);
    const fishPressure = buildings.fishery / length * (1 - stewardship * 0.2);
    const minePressure = buildings.mine / length;
    const urbanPressure = buildingsTotal / length;
    const disaster = disruption === "drought" ? 0.11 : disruption === "flood" ? 0.07 : disruption === "wildfire" ? 0.16 : disruption === "ash" ? 0.05 : 0;
    const rainfall = climate?.rainfall ?? 0.58;
    const drought = Math.max(disruption === "drought" ? 0.68 : 0, climate?.drought ?? 0);
    const flood = Math.max(disruption === "flood" ? 0.6 : 0, climate?.floodRisk ?? 0);

    for (let step = 0; step < iterations; step += 1) {
      for (let i = 0; i < length; i += 1) {
        const neighbours = this.neighbourMean(i);
        const coast = i % this.size === 0 || i % this.size === this.size - 1 ? 1 : 0;
        const suitability = this.suitability[i];
        const localSettlement = this.settlement[i];
        const buildingHere = Math.max(0, urbanPressure * (0.25 + suitability * 1.6) - localSettlement * 0.04);
        soilNext[i] = clamp(this.soil[i] + dt * (0.022 * neighbours.forest + 0.012 * suitability + stewardship * 0.012 - farmPressure * (0.32 + suitability) - disaster * (1 - resilience * 0.28) - localSettlement * 0.018));
        forestNext[i] = clamp(this.forest[i] + dt * (0.03 * this.soil[i] * (1 - localSettlement) + 0.04 * (neighbours.forest - this.forest[i]) + stewardship * 0.009 - woodPressure * 0.8 - (disruption === "wildfire" ? 0.24 * (1 - resilience * 0.3) : 0)));
        fishNext[i] = clamp(this.fish[i] + dt * (0.028 * coast + 0.018 * (neighbours.fish - this.fish[i]) + stewardship * 0.006 - fishPressure * (0.4 + coast * 0.7) + (disruption === "storm" ? 0.015 : 0)));
        waterNext[i] = clamp(this.water[i] + dt * (
          0.024 * suitability + 0.065 * (neighbours.water - this.water[i]) + coast * 0.028 + stewardship * 0.006 -
          farmPressure * (0.16 + suitability * 0.18) + rainfall * 0.025 - drought * 0.18 - localSettlement * 0.011
        ));
        mineralsNext[i] = clamp(this.minerals[i] + dt * (0.0025 * suitability + 0.005 * (neighbours.minerals - this.minerals[i]) - minePressure * (0.45 + suitability * 0.3)));
        diseaseNext[i] = clamp(this.disease[i] + dt * (
          localSettlement * (0.035 + (1 - this.water[i]) * 0.05) + flood * 0.035 -
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
