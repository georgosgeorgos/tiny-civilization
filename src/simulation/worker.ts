/// <reference lib="webworker" />
import { SimulationEngine } from "./engine.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";

let engine: SimulationEngine | null = null;

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    engine = new SimulationEngine(message.seed, message.stores, message.knowledge);
  } else if (engine) {
    engine.setStores(message.stores);
    engine.advance(message.inputs);
  }
  if (!engine) return;
  const response: SimulationResponse = { type: "snapshot", snapshot: structuredClone(engine.snapshot) };
  self.postMessage(response);
};
