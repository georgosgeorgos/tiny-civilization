import { SimulationEngine } from "./engine.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";
import type { RegionSimulationInput, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";

/** Async browser adapter with a synchronous fallback for restricted environments. */
export class SimulationClient {
  private readonly fallback: SimulationEngine;
  private worker: Worker | null;
  private current: Readonly<SimulationSnapshot>;
  private pending: SimulationSnapshot | null = null;
  private stores: Stores;
  private bufferedDays = 0;
  private readonly seed: number;
  private readonly regionalFallback = new Map<string, SimulationEngine>();
  private readonly regionalCurrent = new Map<string, Readonly<SimulationSnapshot>>();
  private regionalPending: ReadonlyMap<string, SimulationSnapshot> | null = null;
  private readonly regionalBufferedDays = new Map<string, number>();

  constructor(seed: number, stores: Stores, knowledge: number) {
    this.seed = seed;
    this.stores = { ...stores };
    this.fallback = new SimulationEngine(seed, stores, knowledge);
    this.current = this.fallback.snapshot;
    this.worker = typeof Worker === "undefined" ? null : new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
        if (event.data.type === "snapshot") this.pending = event.data.snapshot;
        else this.regionalPending = new Map(event.data.snapshots.map((entry) => [entry.id, entry.snapshot]));
      };
      this.worker.onerror = () => {
        console.warn("Simulation worker crashed — falling back to synchronous engine");
        this.worker = null;
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

  advanceYears(inputs: SimulationInputs, years: number): Readonly<SimulationSnapshot> | null {
    let delivered: Readonly<SimulationSnapshot> | null = null;
    if (this.pending) {
      this.current = this.pending;
      delivered = this.current;
      this.pending = null;
    }
    if (this.worker) this.post({ type: "advance-years", stores: this.stores, inputs, years });
    else {
      this.fallback.setStores(this.stores);
      this.current = this.fallback.advanceYears(inputs, years);
      delivered = this.current;
    }
    return delivered;
  }

  /** Advances independent settlements in the worker. Distant regions can use
   * daily fast-forward while a focused settlement receives sub-day fidelity. */
  advanceRegions(regions: RegionSimulationInput[]): ReadonlyMap<string, Readonly<SimulationSnapshot>> {
    if (this.regionalPending) {
      for (const [id, snapshot] of this.regionalPending) this.regionalCurrent.set(id, snapshot);
      this.regionalPending = null;
    }
    if (regions.length === 0) return this.regionalCurrent;
    const batched: RegionSimulationInput[] = [];
    for (const region of regions) {
      const days = (this.regionalBufferedDays.get(region.id) ?? 0) + region.inputs.deltaDays;
      this.regionalBufferedDays.set(region.id, days);
      if (days < 0.25) continue;
      this.regionalBufferedDays.set(region.id, 0);
      batched.push({ ...region, inputs: { ...region.inputs, deltaDays: days } });
    }
    if (batched.length === 0) return this.regionalCurrent;
    if (this.worker) {
      this.post({ type: "advance-regions", seed: this.seed, regions: batched });
    } else {
      for (const region of batched) {
        let engine = this.regionalFallback.get(region.id);
        if (!engine) {
          engine = new SimulationEngine(this.regionSeed(region.id), region.stores, region.knowledge);
          this.regionalFallback.set(region.id, engine);
        }
        engine.setStores(region.stores);
        this.regionalCurrent.set(region.id, engine.advance(region.inputs));
      }
    }
    return this.regionalCurrent;
  }

  getRegionSnapshot(id: string): SimulationSnapshot | undefined {
    const snap = this.regionalCurrent.get(id);
    return snap ? { ...snap } as SimulationSnapshot : undefined;
  }

  /** Forget a collapsed settlement so a later renewal starts a fresh regional chronology. */
  retireRegion(id: string): void {
    this.regionalFallback.delete(id);
    this.regionalCurrent.delete(id);
    this.regionalBufferedDays.delete(id);
    this.post({ type: "retire-region", id });
  }

  private post(message: SimulationRequest): void {
    this.worker?.postMessage(message);
  }

  private regionSeed(id: string): number {
    let hash = this.seed | 0;
    for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x45d9f3b);
    return hash >>> 0;
  }
}
