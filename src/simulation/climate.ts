import { SeededRandom } from "./random.ts";

export type ClimateForcing = {
  rainfall: number;
  temperature: number;
  seaState: number;
  drought: number;
  floodRisk: number;
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

  constructor(seed: number) {
    const random = new SeededRandom(seed ^ 0x43504c4d);
    this.seasonalPhase = random.next() * Math.PI * 2;
    this.regimePhase = random.next() * Math.PI * 2;
    this.coastalBias = random.next() * 0.28 - 0.14;
  }

  advance(days: number): ClimateForcing {
    this.elapsedDays += Math.max(0, days);
    return this.current;
  }

  get current(): ClimateForcing {
    const seasonal = Math.sin((this.elapsedDays / 12) * Math.PI * 2 + this.seasonalPhase);
    const regime = Math.sin((this.elapsedDays / 148) * Math.PI * 2 + this.regimePhase);
    const stormCycle = Math.sin((this.elapsedDays / 31) * Math.PI * 2 + this.regimePhase * 1.7);
    const rainfall = clamp(0.57 + seasonal * 0.16 + regime * 0.2 + this.coastalBias);
    const temperature = seasonal * 0.62 + regime * 0.18;
    const seaState = clamp(0.34 + stormCycle * 0.22 + rainfall * 0.28 + this.coastalBias * 0.3);
    const drought = clamp((0.38 - rainfall) * 1.7 + Math.max(0, regime * -0.18));
    const floodRisk = clamp((rainfall - 0.67) * 1.45 + seaState * 0.2);
    return { rainfall, temperature, seaState, drought, floodRisk };
  }
}
