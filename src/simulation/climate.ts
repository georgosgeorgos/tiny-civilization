import { SeededRandom } from "./random.ts";

export type ClimateRegime = "wet" | "normal" | "dry" | "dry-cold";
export type ClimateForcing = {
  rainfall: number;
  temperature: number;
  seaState: number;
  drought: number;
  floodRisk: number;
  regime: ClimateRegime;
  regimeIntensity: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * A deterministic climate oscillator with seasonal weather and low-frequency
 * wet/dry regimes. It supplies environmental pressure; visible clouds remain
 * an observer-paced presentation layer in game.ts.
 */
export class ClimateSystem {
  private elapsedDays = 0;
  private readonly seasonalPhase: number;
  private readonly regimePhase: number;
  private readonly coastalBias: number;
  private readonly superRegimePeriod: number;

  constructor(seed: number) {
    const random = new SeededRandom(seed ^ 0x43504c4d);
    this.seasonalPhase = random.next() * Math.PI * 2;
    this.regimePhase = random.next() * Math.PI * 2;
    this.coastalBias = random.next() * 0.28 - 0.14;
    this.superRegimePeriod = 220 + (seed % 180);
  }

  advance(days: number): ClimateForcing {
    this.elapsedDays += Math.max(0, days);
    return this.current;
  }

  restore(elapsedDays: number): void {
    this.elapsedDays = elapsedDays;
  }

  get current(): ClimateForcing {
    const seasonal = Math.sin((this.elapsedDays / 12) * Math.PI * 2 + this.seasonalPhase);
    const regime = Math.sin((this.elapsedDays / 148) * Math.PI * 2 + this.regimePhase);
    const superRegime = Math.sin((this.elapsedDays / this.superRegimePeriod) * Math.PI * 2 + this.regimePhase * 0.7);
    const combined = regime * 0.4 + superRegime * 0.6;
    const stormCycle = Math.sin((this.elapsedDays / 31) * Math.PI * 2 + this.regimePhase * 1.7);
    const rainfall = clamp(0.57 + seasonal * 0.16 + regime * 0.2 + this.coastalBias);
    const temperature = seasonal * 0.62 + regime * 0.18;
    const seaState = clamp(0.34 + stormCycle * 0.22 + rainfall * 0.28 + this.coastalBias * 0.3);
    const drought = clamp((0.38 - rainfall) * 1.7 + Math.max(0, regime * -0.18));
    const floodRisk = clamp((rainfall - 0.67) * 1.45 + seaState * 0.2);
    const classifiedRegime: ClimateRegime = combined < -0.25 && temperature < -0.2 ? "dry-cold"
      : combined < -0.25 ? "dry"
      : combined > 0.25 ? "wet"
      : "normal";
    return { rainfall, temperature, seaState, drought, floodRisk, regime: classifiedRegime, regimeIntensity: Math.abs(combined) };
  }
}
