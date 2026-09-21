import { DEFAULT_CONFIG } from "../config.ts";
import { runExperiment, branchExperiment, runSweep, computeOEEMetrics } from "./experiment.ts";
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
const portableRecord = serializeExperiment(record);
console.log(`World: ${record.manifest.id} (${record.manifest.modelVersion})`);
console.log(`Portable record: ${record.checkpoints.length} checkpoints, ${(new TextEncoder().encode(portableRecord).byteLength / 1024).toFixed(1)} KiB JSON`);
for (const checkpoint of record.checkpoints) {
  const snapshot = checkpoint.snapshot;
  console.log(
    `  Year ${String(checkpoint.year).padStart(3)}: food ${snapshot.stores.food.toFixed(1)}, `
    + `knowledge ${snapshot.knowledge.toFixed(1)}, health ${(snapshot.health * 100).toFixed(1)}%, `
    + `era ${snapshot.era}, practices ${snapshot.culture.practices.length}, techniques ${snapshot.innovations.techniques.length}`,
  );
}

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
    console.log(`  Practices:  [${baseEnd.snapshot.culture.practices.map(p => p.name).join(", ")}] vs [${branchEnd.snapshot.culture.practices.map(p => p.name).join(", ")}]`);
    console.log(`  Techniques: ${baseEnd.snapshot.innovations.techniques.length} vs ${branchEnd.snapshot.innovations.techniques.length}`);
  }
}

console.log("\n=== Ensemble sweep: 10 seeds × 2 origins ===");
const seeds = Array.from({ length: 10 }, (_, i) => 100 + i * 137);
for (const origin of ["farmers", "camp"] as const) {
  const summaries = runSweep({
    baseConfig: { ...DEFAULT_CONFIG, origin },
    seeds,
    stores: origin === "farmers" ? { food: 36, wood: 20, gold: 28 } : { food: 12, wood: 8, gold: 36 },
    knowledge: origin === "farmers" ? 14 : 0,
    inputs: baseInputs,
    years: 100,
    checkpointEvery: 25,
    directives: ["secure food"],
  });
  console.log(`\n  Origin: ${origin}`);
  for (const s of summaries) {
    console.log(`  Year ${String(s.year).padStart(3)}: food ${s.mean.food.toFixed(1)} ±${s.std.food.toFixed(1)}, knowledge ${s.mean.knowledge.toFixed(1)} ±${s.std.knowledge.toFixed(1)}, practices ${s.mean.practices.toFixed(1)} ±${s.std.practices.toFixed(1)}, techniques ${s.mean.techniques.toFixed(1)} ±${s.std.techniques.toFixed(1)}`);
  }
}

console.log("\n=== Coupling ablation experiment ===");
const conditions = [
  { label: "Full coupling", cultureToEcology: true, ecologyToCulture: true },
  { label: "Culture→Ecology only", cultureToEcology: true, ecologyToCulture: false },
  { label: "Ecology→Culture only", cultureToEcology: false, ecologyToCulture: true },
  { label: "No coupling", cultureToEcology: false, ecologyToCulture: false },
] as const;

const ablationSeeds = Array.from({ length: 5 }, (_, i) => 500 + i * 71);
for (const condition of conditions) {
  const totalDiscoveryRates: number[] = [];
  let totalCumulative = 0;
  for (const seed of ablationSeeds) {
    const ablationManifest = createWorldManifest({ ...DEFAULT_CONFIG, seed, origin: "farmers" }, []);
    const ablationRecord = runExperiment({
      manifest: ablationManifest,
      stores: { food: 36, wood: 20, gold: 28 },
      knowledge: 14,
      years: 200,
      checkpointEvery: 10,
      inputs: { ...baseInputs, cultureToEcology: condition.cultureToEcology, ecologyToCulture: condition.ecologyToCulture },
    });
    const oee = computeOEEMetrics(ablationRecord.checkpoints);
    totalDiscoveryRates.push(...oee.discoveryRate);
    totalCumulative += oee.cumulativeDiscoveries[oee.cumulativeDiscoveries.length - 1] ?? 0;
  }
  const meanRate = totalDiscoveryRates.reduce((s, v) => s + v, 0) / Math.max(1, totalDiscoveryRates.length);
  const meanCumulative = totalCumulative / ablationSeeds.length;
  console.log(`  ${condition.label.padEnd(24)} mean discovery rate: ${meanRate.toFixed(3)}, mean cumulative discoveries: ${meanCumulative.toFixed(1)}`);
}
