import { DEFAULT_CONFIG } from "../config.ts";
import { runExperiment } from "./experiment.ts";
import { createWorldManifest, serializeExperiment } from "./manifest.ts";

const manifest = createWorldManifest({ ...DEFAULT_CONFIG, seed: 731, archetype: "continental", origin: "farmers" }, ["secure food", "develop coastal trade"]);
const record = runExperiment({
  manifest,
  stores: { food: 36, wood: 20, gold: 28 },
  knowledge: 14,
  years: 100,
  checkpointEvery: 10,
  inputs: {
    population: 8,
    housing: 12,
    annualProduction: { food: 24, wood: 9, gold: 7 },
    buildings: { hut: 5, farm: 3, mine: 0, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 1, forge: 0 },
    moodPressure: 0.12,
    infrastructure: { roads: 3, ports: 1, tradeRoutes: 1 },
    disruption: "none",
    fidelity: "remote",
  },
});

console.log(serializeExperiment(record));
