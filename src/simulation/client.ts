import { SimulationEngine } from "./engine.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";
import type { SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

/** Async browser adapter with a synchronous fallback for restricted environments. */
export class SimulationClient {
  private readonly fallback: SimulationEngine;
  private readonly worker: Worker | null;
  private current: Readonly<SimulationSnapshot>;
  private pending: SimulationSnapshot | null = null;
  private stores: Stores;
  private bufferedDays = 0;

  constructor(seed: number, stores: Stores, knowledge: number) {
    this.stores = { ...stores };
    this.fallback = new SimulationEngine(seed, stores, knowledge);
    this.current = this.fallback.snapshot;
    this.worker = typeof Worker === "undefined" ? null : new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
        this.pending = event.data.snapshot;
      };
      this.post({ type: "init", seed, stores, knowledge });
    }
  }

  get snapshot(): Readonly<SimulationSnapshot> {
    return this.pending ?? this.current;
  }

  setStores(stores: Stores): void {
    this.stores = { ...stores };
  }

  advance(inputs: SimulationInputs): Readonly<SimulationSnapshot> | null {
    let delivered: Readonly<SimulationSnapshot> | null = null;
    if (this.pending) {
      this.current = this.pending;
      delivered = this.current;
      this.pending = null;
    }
    this.bufferedDays += inputs.deltaDays;
    if (this.bufferedDays < 0.25) return delivered;
    const batched = { ...inputs, deltaDays: this.bufferedDays };
    this.bufferedDays = 0;
    if (this.worker) this.post({ type: "advance", stores: this.stores, inputs: batched });
    else {
      this.fallback.setStores(this.stores);
      this.current = this.fallback.advance(batched);
      delivered = this.current;
    }
    return delivered;
  }

  private post(message: SimulationRequest): void {
    this.worker?.postMessage(message);
  }
}
