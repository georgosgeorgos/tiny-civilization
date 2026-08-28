/// <reference lib="webworker" />
import { SimulationEngine } from "./engine.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";

let engine: SimulationEngine | null = null;
const regions = new Map<string, SimulationEngine>();

function seedFor(id: string, seed: number): number {
  let hash = seed | 0;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x45d9f3b);
  return hash >>> 0;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    engine = new SimulationEngine(message.seed, message.stores, message.knowledge);
  } else if (message.type === "advance" && engine) {
    engine.setStores(message.stores);
    engine.advance(message.inputs);
  } else if (message.type === "advance-years" && engine) {
    engine.setStores(message.stores);
    engine.advanceYears(message.inputs, message.years);
  } else if (message.type === "advance-regions") {
    const snapshots = message.regions.map((region) => {
      let regional = regions.get(region.id);
      if (!regional) {
        regional = new SimulationEngine(seedFor(region.id, message.seed), region.stores, region.knowledge);
        regions.set(region.id, regional);
      }
      regional.setStores(region.stores);
      regional.advance(region.inputs);
      return { id: region.id, snapshot: structuredClone(regional.snapshot) };
    });
    const response: SimulationResponse = { type: "region-snapshots", snapshots };
    self.postMessage(response);
    return;
  } else if (message.type === "retire-region") {
    regions.delete(message.id);
    return;
  }
  if (!engine) return;
  const response: SimulationResponse = { type: "snapshot", snapshot: structuredClone(engine.snapshot) };
  self.postMessage(response);
};
