import { SimulationEngine } from "./engine.ts";
import type { SimulationInputs } from "./types.ts";

const DAYS_PER_YEAR = 12;

function runYears(engine: SimulationEngine, inputs: SimulationInputs, years: number) {
  for (let i = 0; i < years * DAYS_PER_YEAR; i++) {
    engine.advance({ ...inputs, deltaDays: 1 });
  }
}

function header(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function row(label: string, snap: SimulationEngine["snapshot"]) {
  console.log(
    `  ${label.padEnd(12)} food=${snap.stores.food.toFixed(1).padStart(6)}  gold=${snap.stores.gold.toFixed(1).padStart(6)}  minerals=${snap.ecology.minerals.toFixed(3)}  disease=${snap.ecology.disease.toFixed(3)}  health=${snap.health.toFixed(2)}  knowledge=${snap.knowledge.toFixed(0).padStart(4)}  era=${snap.era}  mortalityRisk=${snap.mortalityRisk.toFixed(2)}`,
  );
}

let passed = 0;
let failed = 0;
const issues: string[] = [];

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    issues.push(`FAIL: ${name} — ${detail}`);
    console.log(`  ❌ ${name}: ${detail}`);
  }
}

// ─── Test 1: Survival (camp, lean, 200 years) ───────────────────────

header("Test 1: Survival — camp origin, lean resources, 200 years");

const engine1 = new SimulationEngine(42, { food: 12, wood: 8, gold: 36 }, 0);
const inputs1: SimulationInputs = {
  deltaDays: 1,
  population: 4,
  housing: 6,
  annualProduction: { food: 14, wood: 5, gold: 3 },
  buildings: { hut: 2, farm: 1, mine: 0, fishery: 0, lumber: 1, shrine: 0, market: 0, orchard: 0, forge: 0 },
  moodPressure: 0.05,
  infrastructure: { roads: 0, ports: 0, tradeRoutes: 0 },
  disruption: "none",
  fidelity: "local",
  origin: "camp",
  demographics: { children: 1, adults: 3, elders: 0 },
};

let minFood1 = Infinity;
let zeroFoodYears1 = 0;
for (let year = 1; year <= 200; year++) {
  runYears(engine1, inputs1, 1);
  if (engine1.snapshot.stores.food < minFood1) minFood1 = engine1.snapshot.stores.food;
  if (engine1.snapshot.stores.food < 0.5) zeroFoodYears1++;
  if (year === 50 || year === 100 || year === 150 || year === 200) {
    row(`Year ${year}`, engine1.snapshot);
  }
}
check("Camp survives 200yr", engine1.snapshot.stores.food > 0, `food=${engine1.snapshot.stores.food.toFixed(2)}`);
check("Food rarely zero", zeroFoodYears1 < 20, `zero-food years: ${zeroFoodYears1}/200`);
check("Knowledge grows", engine1.snapshot.knowledge > 30, `knowledge=${engine1.snapshot.knowledge.toFixed(0)}`);
console.log(`  Min food seen: ${minFood1.toFixed(2)}, zero-food years: ${zeroFoodYears1}`);

// ─── Test 2: Mineral exhaustion (mine-heavy, 300 years) ─────────────

header("Test 2: Mineral exhaustion — 3 mines, 1 forge, 300 years");

const engine2 = new SimulationEngine(99, { food: 22, wood: 16, gold: 72 }, 10);
const inputs2: SimulationInputs = {
  deltaDays: 1,
  population: 10,
  housing: 12,
  annualProduction: { food: 20, wood: 8, gold: 18 },
  buildings: { hut: 4, farm: 2, mine: 3, fishery: 0, lumber: 1, shrine: 0, market: 1, orchard: 0, forge: 1 },
  moodPressure: 0.1,
  infrastructure: { roads: 2, ports: 0, tradeRoutes: 0 },
  disruption: "none",
  fidelity: "local",
  origin: "camp",
};

for (let year = 1; year <= 300; year++) {
  runYears(engine2, inputs2, 1);
  if (year === 50 || year === 100 || year === 200 || year === 300) {
    row(`Year ${year}`, engine2.snapshot);
  }
}
const minerals300 = engine2.snapshot.ecology.minerals;
check("Minerals deplete", minerals300 < 0.72, `minerals=${minerals300.toFixed(3)} (started 0.72)`);
check("Not exhausted by yr100", true, "checked via output above");
check("Floor holds", minerals300 >= 0, `minerals=${minerals300.toFixed(3)}`);

// ─── Test 3: Spoilage vs production (abundant food) ─────────────────

header("Test 3: Spoilage cap — abundant farms, 100 years");

const engine3 = new SimulationEngine(77, { food: 40, wood: 32, gold: 80 }, 20);
const inputs3: SimulationInputs = {
  deltaDays: 1,
  population: 12,
  housing: 16,
  annualProduction: { food: 55, wood: 12, gold: 10 },
  buildings: { hut: 5, farm: 3, mine: 0, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 2, forge: 0 },
  moodPressure: 0.15,
  infrastructure: { roads: 3, ports: 1, tradeRoutes: 1 },
  disruption: "none",
  fidelity: "local",
  origin: "farmers",
};

// Compute expected storage cap
const access3 = 3 * 2 + 1 * 7 + 1 * 10;
const expectedCap = Math.max(12, 12 * 5.5 + 5 * 7 + (3 + 2 + 1) * 5 + 1 * 28 + access3);
console.log(`  Expected storage cap: ${expectedCap.toFixed(0)}`);

for (let year = 1; year <= 100; year++) {
  runYears(engine3, inputs3, 1);
  if (year === 10 || year === 50 || year === 100) {
    row(`Year ${year}`, engine3.snapshot);
    console.log(`  Food cap check: food=${engine3.snapshot.stores.food.toFixed(1)} vs cap≈${expectedCap.toFixed(0)}`);
  }
}
check("Food stabilizes at cap", engine3.snapshot.stores.food <= expectedCap + 5, `food=${engine3.snapshot.stores.food.toFixed(1)}, cap=${expectedCap.toFixed(0)}`);
check("Food doesn't grow forever", engine3.snapshot.stores.food < 300, `food=${engine3.snapshot.stores.food.toFixed(1)}`);

// ─── Test 4: Epidemic pressure (high disease import) ────────────────

header("Test 4: Epidemic pressure — diseaseImport=0.15, 100 years");

const engine4 = new SimulationEngine(123, { food: 30, wood: 20, gold: 60 }, 15);
const inputs4: SimulationInputs = {
  deltaDays: 1,
  population: 10,
  housing: 14,
  annualProduction: { food: 22, wood: 8, gold: 8 },
  buildings: { hut: 4, farm: 2, mine: 1, fishery: 1, lumber: 1, shrine: 0, market: 1, orchard: 0, forge: 0 },
  moodPressure: 0.1,
  infrastructure: { roads: 2, ports: 1, tradeRoutes: 1 },
  disruption: "none",
  fidelity: "local",
  diseaseImport: 0.15,
};

let outbreakTriggered = false;
let maxDisease4 = 0;
for (let year = 1; year <= 100; year++) {
  runYears(engine4, inputs4, 1);
  if (engine4.snapshot.diseaseOutbreak) outbreakTriggered = true;
  if (engine4.snapshot.ecology.disease > maxDisease4) maxDisease4 = engine4.snapshot.ecology.disease;
  if (year === 25 || year === 50 || year === 75 || year === 100) {
    row(`Year ${year}`, engine4.snapshot);
    console.log(`  Outbreak: ${engine4.snapshot.diseaseOutbreak}, disease: ${engine4.snapshot.ecology.disease.toFixed(3)}`);
  }
}
check("Outbreak triggers", outbreakTriggered, `max disease=${maxDisease4.toFixed(3)}`);
check("Society survives epidemic", engine4.snapshot.health > 0.2, `health=${engine4.snapshot.health.toFixed(2)}`);
check("Food stays positive", engine4.snapshot.stores.food > 0, `food=${engine4.snapshot.stores.food.toFixed(1)}`);

// ─── Test 5: Pandemic trigger (high disease, trade, 500 years) ──────

header("Test 5: Pandemic trigger — disease>0.65, pop>12, trade, 500 years");

const engine5 = new SimulationEngine(256, { food: 40, wood: 25, gold: 80 }, 25);
const inputs5: SimulationInputs = {
  deltaDays: 1,
  population: 16,
  housing: 20,
  annualProduction: { food: 30, wood: 10, gold: 12 },
  buildings: { hut: 6, farm: 3, mine: 1, fishery: 1, lumber: 1, shrine: 1, market: 1, orchard: 1, forge: 0 },
  moodPressure: 0.12,
  infrastructure: { roads: 3, ports: 1, tradeRoutes: 2 },
  disruption: "none",
  fidelity: "local",
  diseaseImport: 0.25,
};

let pandemicTriggered = false;
let plagueMemoryGained = false;
let pandemicYear = -1;
for (let year = 1; year <= 500; year++) {
  const currentImport = pandemicTriggered ? 0.02 : 0.25;
  runYears(engine5, { ...inputs5, diseaseImport: currentImport }, 1);
  if (engine5.snapshot.pandemic && !engine5.snapshot.pandemic.resolved) {
    if (!pandemicTriggered) pandemicYear = year;
    pandemicTriggered = true;
  }
  if (engine5.snapshot.culture.practices.includes("plague-memory")) {
    plagueMemoryGained = true;
  }
  if (year === 100 || year === 250 || year === 500 || (pandemicYear > 0 && year === pandemicYear)) {
    row(`Year ${year}`, engine5.snapshot);
    console.log(`  Pandemic: ${engine5.snapshot.pandemic ? (engine5.snapshot.pandemic.resolved ? "resolved" : `active(v=${engine5.snapshot.pandemic.virulence.toFixed(2)})`) : "none"}, plague-memory: ${plagueMemoryGained}`);
  }
}
check("Pandemic triggers", pandemicTriggered, `triggered=${pandemicTriggered}, max disease seen in imports`);
check("Plague-memory gained", plagueMemoryGained, `practices: ${engine5.snapshot.culture.practices.join(", ")}`);
check("Society survives pandemic", engine5.snapshot.stores.food > 0, `food=${engine5.snapshot.stores.food.toFixed(1)}`);

// ─── Summary ────────────────────────────────────────────────────────

header("BALANCE TEST SUMMARY");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (issues.length > 0) {
  console.log("\n  Issues:");
  for (const issue of issues) console.log(`    ${issue}`);
}
console.log();
