import { SimulationEngine } from "./engine.ts";
import type { ExperimentCheckpoint, ExperimentDefinition, ExperimentRecord, WorldManifest } from "./manifest.ts";
import type { SimulationInputs, Stores } from "./types.ts";

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
