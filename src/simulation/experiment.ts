import type { SimulationConfig } from "../config.ts";
import { SimulationEngine } from "./engine.ts";
import type { ExperimentCheckpoint, ExperimentDefinition, ExperimentRecord, WorldManifest } from "./manifest.ts";
import { createWorldManifest } from "./manifest.ts";
import type { SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

export type ExperimentPlan = {
  manifest: WorldManifest;
  stores: Stores;
  knowledge?: number;
  inputs: Omit<SimulationInputs, "deltaDays">;
  years: number;
  /** Years at which the runner records a comparable checkpoint. */
  checkpointEvery?: number;
};

/**
 * Deterministic, render-free experiment runner. It advances the same engine
 * used by the browser in bounded macro steps, so scenario batches can be
 * tested without Three.js or DOM state.
 */
export function runExperiment(plan: ExperimentPlan): ExperimentRecord {
  const years = Math.max(0, Math.floor(plan.years));
  const interval = Math.max(1, Math.floor(plan.checkpointEvery ?? 10));
  const engine = new SimulationEngine(plan.manifest.config.seed, plan.stores, plan.knowledge ?? 0);
  // The manifest is the authoritative scenario contract. Callers may override
  // the origin for a counterfactual, but a normal replay inherits it directly.
  const inputs = { ...plan.inputs, origin: plan.inputs.origin ?? plan.manifest.config.origin };
  const checkpoints: ExperimentCheckpoint[] = [{ year: 0, snapshot: structuredClone(engine.snapshot) }];
  let elapsed = 0;
  while (elapsed < years) {
    const span = Math.min(interval, years - elapsed);
    engine.advanceYears({ ...inputs, deltaDays: span * 12 }, span);
    elapsed += span;
    checkpoints.push({ year: elapsed, snapshot: structuredClone(engine.snapshot) });
  }
  const definition: ExperimentDefinition = {
    stores: structuredClone(plan.stores),
    knowledge: plan.knowledge ?? 0,
    inputs: structuredClone(inputs),
    years,
    checkpointEvery: interval,
  };
  return { manifest: structuredClone(plan.manifest), definition, events: [], checkpoints };
}

export function runExperimentBatch(plans: readonly ExperimentPlan[]): ExperimentRecord[] {
  return plans.map((plan) => runExperiment(plan));
}

export type BranchPlan = {
  checkpoint: ExperimentCheckpoint;
  seed: number;
  inputs: Omit<SimulationInputs, "deltaDays">;
  years: number;
  checkpointEvery?: number;
};

export function branchExperiment(plan: BranchPlan): ExperimentCheckpoint[] {
  const interval = Math.max(1, Math.floor(plan.checkpointEvery ?? 10));
  const engine = new SimulationEngine(plan.seed, plan.checkpoint.snapshot.stores);
  engine.loadCheckpoint(plan.checkpoint.snapshot);
  const inputs = { ...plan.inputs };
  const checkpoints: ExperimentCheckpoint[] = [{ year: plan.checkpoint.year, snapshot: structuredClone(engine.snapshot) }];
  let elapsed = 0;
  while (elapsed < plan.years) {
    const span = Math.min(interval, plan.years - elapsed);
    engine.advanceYears({ ...inputs, deltaDays: span * 12 }, span);
    elapsed += span;
    checkpoints.push({ year: plan.checkpoint.year + elapsed, snapshot: structuredClone(engine.snapshot) });
  }
  return checkpoints;
}

export type SweepConfig = {
  baseConfig: SimulationConfig;
  seeds: number[];
  stores: Stores;
  knowledge?: number;
  inputs: Omit<SimulationInputs, "deltaDays">;
  years: number;
  checkpointEvery?: number;
  directives?: string[];
};

export type MetricSample = {
  food: number;
  knowledge: number;
  health: number;
  stability: number;
  practices: number;
  techniques: number;
  era: string;
};

export type SweepSummary = {
  year: number;
  n: number;
  mean: MetricSample;
  min: MetricSample;
  max: MetricSample;
  std: MetricSample;
};

function extractMetrics(snapshot: SimulationSnapshot): MetricSample {
  return {
    food: snapshot.stores.food,
    knowledge: snapshot.knowledge,
    health: snapshot.health,
    stability: snapshot.stability,
    practices: snapshot.culture.practices.length,
    techniques: snapshot.innovations.techniques.length,
    era: snapshot.era,
  };
}

function summarize(year: number, samples: MetricSample[]): SweepSummary {
  const n = samples.length;
  const keys: (keyof Omit<MetricSample, "era">)[] = ["food", "knowledge", "health", "stability", "practices", "techniques"];
  const mean = { food: 0, knowledge: 0, health: 0, stability: 0, practices: 0, techniques: 0, era: "" };
  const min = { food: Infinity, knowledge: Infinity, health: Infinity, stability: Infinity, practices: Infinity, techniques: Infinity, era: "" };
  const max = { food: -Infinity, knowledge: -Infinity, health: -Infinity, stability: -Infinity, practices: -Infinity, techniques: -Infinity, era: "" };
  for (const s of samples) {
    for (const k of keys) { mean[k] += s[k]; min[k] = Math.min(min[k], s[k]); max[k] = Math.max(max[k], s[k]); }
  }
  for (const k of keys) mean[k] /= n;
  const std = { food: 0, knowledge: 0, health: 0, stability: 0, practices: 0, techniques: 0, era: "" };
  for (const s of samples) {
    for (const k of keys) std[k] += (s[k] - mean[k]) ** 2;
  }
  for (const k of keys) std[k] = Math.sqrt(std[k] / n);
  return { year, n, mean, min, max, std };
}

export type OEEMetrics = {
  discoveryRate: number[];
  cumulativeDiscoveries: number[];
  practiceVectorDiversity: number[];
  traitEntropy: number[];
  activeSpeciesCount: number[];
};

export function computeOEEMetrics(checkpoints: ExperimentCheckpoint[]): OEEMetrics {
  const discoveryRate: number[] = [];
  const cumulativeDiscoveries: number[] = [];
  const practiceVectorDiversity: number[] = [];
  const traitEntropy: number[] = [];
  const activeSpeciesCount: number[] = [];
  const allSeenIds = new Set<string>();

  for (let i = 0; i < checkpoints.length; i++) {
    const snap = checkpoints[i].snapshot;
    const practices = snap.culture.practices;

    for (const p of practices) allSeenIds.add(p.id);
    cumulativeDiscoveries.push(allSeenIds.size);
    activeSpeciesCount.push(practices.length);

    if (i > 0) {
      const prevIds = new Set(checkpoints[i - 1].snapshot.culture.practices.map(p => p.id));
      const newCount = practices.filter(p => !prevIds.has(p.id)).length;
      discoveryRate.push(newCount);
    } else {
      discoveryRate.push(practices.length);
    }

    const effectKeys: (keyof import("./types.ts").PracticeEffects)[] = ["soil", "forest", "food", "water", "knowledge", "stability"];
    if (practices.length >= 2) {
      let totalDist = 0;
      let pairs = 0;
      for (let a = 0; a < practices.length; a++) {
        for (let b = a + 1; b < practices.length; b++) {
          let dist = 0;
          for (const k of effectKeys) dist += (practices[a].effects[k] - practices[b].effects[k]) ** 2;
          totalDist += Math.sqrt(dist);
          pairs++;
        }
      }
      practiceVectorDiversity.push(pairs > 0 ? totalDist / pairs : 0);
    } else {
      practiceVectorDiversity.push(0);
    }

    const traits = snap.culture.traits;
    const traitVals = [traits.cooperation, traits.curiosity, traits.mobility, traits.stewardship, traits.resilience];
    const sum = traitVals.reduce((s, v) => s + v, 0);
    let entropy = 0;
    for (const v of traitVals) {
      const p = v / sum;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    traitEntropy.push(entropy);
  }

  return { discoveryRate, cumulativeDiscoveries, practiceVectorDiversity, traitEntropy, activeSpeciesCount };
}

export function runSweep(config: SweepConfig): SweepSummary[] {
  const interval = Math.max(1, Math.floor(config.checkpointEvery ?? 10));
  const years = Math.max(0, Math.floor(config.years));
  const checkpointYears: number[] = [];
  for (let y = 0; y <= years; y += interval) checkpointYears.push(y);
  if (checkpointYears[checkpointYears.length - 1] !== years) checkpointYears.push(years);

  const allCheckpoints: Map<number, MetricSample[]> = new Map();
  for (const y of checkpointYears) allCheckpoints.set(y, []);

  for (const seed of config.seeds) {
    const manifest = createWorldManifest({ ...config.baseConfig, seed }, config.directives ?? []);
    const record = runExperiment({
      manifest,
      stores: config.stores,
      knowledge: config.knowledge,
      inputs: config.inputs,
      years,
      checkpointEvery: interval,
    });
    for (const cp of record.checkpoints) {
      allCheckpoints.get(cp.year)?.push(extractMetrics(cp.snapshot));
    }
  }

  const summaries: SweepSummary[] = [];
  for (const year of checkpointYears) {
    const samples = allCheckpoints.get(year);
    if (samples && samples.length > 0) summaries.push(summarize(year, samples));
  }
  return summaries;
}
