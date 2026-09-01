import { DEFAULT_CONFIG } from "../config.ts";
import { runExperiment, branchExperiment } from "./experiment.ts";
import { createWorldManifest, serializeExperiment } from "./manifest.ts";

const manifest = createWorldManifest({ ...DEFAULT_CONFIG, seed: 731, archetype: "continental", origin: "farmers" }, ["secure food", "develop coastal trade"]);

const baseInputs = {
  population: 8,
  housing: 12,
  annualProduction: { food: 24, wood: 9, gold: 7 },
  buildings: { hut: 5, farm: 3, mine: 0, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 1, forge: 0 },
  moodPressure: 0.12,
  infrastructure: { roads: 3, ports: 1, tradeRoutes: 1 },
  disruption: "none" as const,
  fidelity: "remote" as const,
};

const record = runExperiment({
  manifest,
  stores: { food: 36, wood: 20, gold: 28 },
  knowledge: 14,
  years: 100,
  checkpointEvery: 10,
  inputs: baseInputs,
});

console.log("=== Base experiment ===");
console.log(serializeExperiment(record));

const branchPoint = record.checkpoints.find(cp => cp.year === 50);
if (branchPoint) {
  console.log("\n=== Counterfactual branch from year 50: double food production ===");
  const branchCheckpoints = branchExperiment({
    checkpoint: branchPoint,
    seed: manifest.config.seed,
    inputs: { ...baseInputs, annualProduction: { ...baseInputs.annualProduction, food: 48 } },
    years: 50,
    checkpointEvery: 10,
  });
  const baseEnd = record.checkpoints.find(cp => cp.year === 100);
  const branchEnd = branchCheckpoints.find(cp => cp.year === 100);
  if (baseEnd && branchEnd) {
    console.log(`\nYear 100 comparison (base vs branch):`);
    console.log(`  Food:       ${baseEnd.snapshot.stores.food.toFixed(1)} vs ${branchEnd.snapshot.stores.food.toFixed(1)}`);
    console.log(`  Knowledge:  ${baseEnd.snapshot.knowledge.toFixed(1)} vs ${branchEnd.snapshot.knowledge.toFixed(1)}`);
    console.log(`  Health:     ${(baseEnd.snapshot.health * 100).toFixed(1)}% vs ${(branchEnd.snapshot.health * 100).toFixed(1)}%`);
    console.log(`  Stability:  ${(baseEnd.snapshot.stability * 100).toFixed(1)}% vs ${(branchEnd.snapshot.stability * 100).toFixed(1)}%`);
    console.log(`  Era:        ${baseEnd.snapshot.era} vs ${branchEnd.snapshot.era}`);
    console.log(`  Practices:  [${baseEnd.snapshot.culture.practices.join(", ")}] vs [${branchEnd.snapshot.culture.practices.join(", ")}]`);
    console.log(`  Techniques: ${baseEnd.snapshot.innovations.techniques.length} vs ${branchEnd.snapshot.innovations.techniques.length}`);
  }
}
