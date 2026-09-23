import { SimulationEngine } from "./engine.ts";
import type { SimulationRequest, SimulationResponse } from "./protocol.ts";
import type { GenerativePractice, RegionSimulationInput, SimulationInputs, SimulationSnapshot, Stores } from "./types.ts";
import { addStores, storeDifference, zeroStores } from "./stores.ts";

/** Async browser adapter with a synchronous fallback for restricted environments. */
export class SimulationClient {
  private readonly fallback: SimulationEngine;
  private worker: Worker | null = null;
  private readonly outstanding: SimulationRequest[] = [];
  private current: Readonly<SimulationSnapshot>;
  private pending: SimulationSnapshot | null = null;
  private stores: Stores;
  private unpostedStoreChange: Stores = zeroStores();
  private bufferedDays = 0;
  private readonly seed: number;
  private readonly regionalFallback = new Map<string, SimulationEngine>();
  private readonly regionalCurrent = new Map<string, Readonly<SimulationSnapshot>>();
  private readonly regionalBufferedDays = new Map<string, number>();
  private readonly regionalLastStores = new Map<string, Stores>();
  private readonly regionalFresh = new Set<string>();

  constructor(seed: number, stores: Stores, knowledge: number) {
    this.seed = seed;
    this.stores = { ...stores };
    this.fallback = new SimulationEngine(seed, stores, knowledge);
    this.current = this.fallback.checkpoint;
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
          const request = this.outstanding.shift();
          if (event.data.type === "snapshot") this.pending = event.data.snapshot;
          else if (request?.type === "advance-regions") {
            const active = new Set(request.regions.map((region) => region.id));
            for (const { id, snapshot } of event.data.snapshots) {
              if (active.has(id)) {
                this.regionalCurrent.set(id, snapshot);
                this.regionalFresh.add(id);
              }
            }
          }
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.recoverWorker();
        };
        this.worker.onmessageerror = () => this.recoverWorker();
        this.post({ type: "init", seed, stores, knowledge });
      } catch {
        this.recoverWorker();
      }
    }
  }

  /** Finish queued work before running the coupled world synchronously in small batches. */
  useSynchronous(): Readonly<SimulationSnapshot> {
    if (this.worker) this.recoverWorker();
    this.drain();
    this.fallback.setStores(addStores(this.fallback.snapshot.stores, this.takeStoreChange()));
    this.current = this.fallback.checkpoint;
    this.stores = { ...this.current.stores };
    return this.current;
  }

  get snapshot(): Readonly<SimulationSnapshot> {
    const snapshot = this.pending ?? this.current;
    return { ...snapshot, stores: this.visibleStores(snapshot) };
  }

  setStores(stores: Stores): void {
    this.unpostedStoreChange = addStores(this.unpostedStoreChange, storeDifference(stores, this.stores));
    this.stores = { ...stores };
  }

  addPractice(practice: GenerativePractice): void {
    if (this.worker) this.post({ type: "add-practice", practice });
    else {
      this.fallback.addPractice(practice);
      this.current = this.fallback.checkpoint;
      this.pending = null;
    }
  }

  advance(inputs: SimulationInputs): Readonly<SimulationSnapshot> | null {
    let delivered = this.drain();
    this.bufferedDays += inputs.deltaDays;
    if (this.bufferedDays < 0.25) return delivered;
    const batched = { ...inputs, deltaDays: this.bufferedDays };
    this.bufferedDays = 0;
    const storeChange = this.takeStoreChange();
    if (this.worker) this.post({ type: "advance", storeChange, inputs: batched });
    else {
      this.fallback.setStores(addStores(this.fallback.snapshot.stores, storeChange));
      this.fallback.advance(batched);
      this.current = this.fallback.checkpoint;
      this.pending = null;
      this.stores = { ...this.current.stores };
      delivered = this.current;
    }
    return delivered;
  }

  advanceYears(inputs: SimulationInputs, years: number): Readonly<SimulationSnapshot> | null {
    this.drain();
    // Preserve the fractional time accumulated before a projection.
    if (this.bufferedDays > 0) {
      const buffered = { ...inputs, deltaDays: this.bufferedDays };
      this.bufferedDays = 0;
      const storeChange = this.takeStoreChange();
      if (this.worker) this.post({ type: "advance", storeChange, inputs: buffered });
      else {
        this.fallback.setStores(addStores(this.fallback.snapshot.stores, storeChange));
        this.fallback.advance(buffered);
      }
    }
    const storeChange = this.takeStoreChange();
    if (this.worker) {
      this.post({ type: "advance-years", storeChange, inputs, years });
      return null;
    }
    this.fallback.setStores(addStores(this.fallback.snapshot.stores, storeChange));
    this.fallback.advanceYears(inputs, years);
    this.current = this.fallback.checkpoint;
    this.pending = null;
    this.stores = { ...this.current.stores };
    return this.current;
  }

  /** Deliver completed work even when the observer has paused time. */
  drain(): Readonly<SimulationSnapshot> | null {
    if (!this.pending) return null;
    this.current = this.pending;
    this.pending = null;
    const visibleStores = this.visibleStores(this.current);
    this.stores = visibleStores;
    return { ...this.current, stores: visibleStores };
  }

  /** Advances independent settlements in the worker. Distant regions can use
   * daily fast-forward while a focused settlement receives sub-day fidelity. */
  advanceRegions(regions: RegionSimulationInput[]): ReadonlyMap<string, Readonly<SimulationSnapshot>> {
    if (regions.length === 0) {
      this.consumeRegionalSnapshots();
      return this.regionalCurrent;
    }
    const batched: RegionSimulationInput[] = [];
    for (const region of regions) {
      const days = (this.regionalBufferedDays.get(region.id) ?? 0) + region.inputs.deltaDays;
      this.regionalBufferedDays.set(region.id, days);
      if (days < 0.25) continue;
      this.regionalBufferedDays.set(region.id, 0);
      batched.push({ ...region, inputs: { ...region.inputs, deltaDays: days } });
    }
    if (batched.length === 0) {
      this.consumeRegionalSnapshots();
      return this.regionalCurrent;
    }
    const requests = batched.map((region) => {
      const previous = this.regionalLastStores.get(region.id) ?? region.stores;
      this.regionalLastStores.set(region.id, { ...region.stores });
      return { ...region, storeChange: storeDifference(region.stores, previous) };
    });
    if (this.worker) {
      this.post({ type: "advance-regions", seed: this.seed, regions: requests });
      this.consumeRegionalSnapshots();
    } else {
      for (const region of requests) {
        let engine = this.regionalFallback.get(region.id);
        if (!engine) {
          engine = new SimulationEngine(this.regionSeed(region.id), region.stores, region.knowledge);
          this.regionalFallback.set(region.id, engine);
        } else {
          engine.setStores(addStores(engine.snapshot.stores, region.storeChange));
        }
        engine.advance(region.inputs);
        this.regionalCurrent.set(region.id, engine.checkpoint);
        this.regionalLastStores.set(region.id, { ...engine.snapshot.stores });
      }
    }
    return this.regionalCurrent;
  }

  getRegionSnapshot(id: string): SimulationSnapshot | undefined {
    const snap = this.regionalCurrent.get(id);
    return snap ? structuredClone(snap) : undefined;
  }

  /** Forget a collapsed settlement so a later renewal starts a fresh regional chronology. */
  retireRegion(id: string): void {
    this.regionalFallback.delete(id);
    this.regionalCurrent.delete(id);
    this.regionalBufferedDays.delete(id);
    this.regionalLastStores.delete(id);
    this.regionalFresh.delete(id);
    for (const request of this.outstanding) {
      if (request.type === "advance-regions") request.regions = request.regions.filter((region) => region.id !== id);
    }
    this.post({ type: "retire-region", id });
  }

  private post(message: SimulationRequest): void {
    if (!this.worker) return;
    if (message.type !== "retire-region") this.outstanding.push(structuredClone(message));
    try {
      this.worker.postMessage(message);
    } catch {
      this.recoverWorker();
    }
  }

  private recoverWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.fallback.loadCheckpoint(this.pending ?? this.current);
    for (const [id, snapshot] of this.regionalCurrent) {
      const engine = new SimulationEngine(this.regionSeed(id), snapshot.stores, snapshot.knowledge);
      engine.loadCheckpoint(snapshot);
      this.regionalFallback.set(id, engine);
    }
    // Replay only unacknowledged requests, in order, from the last checkpoint.
    for (const request of this.outstanding.splice(0)) {
      if (request.type === "advance" || request.type === "advance-years") {
        this.fallback.setStores(addStores(this.fallback.snapshot.stores, request.storeChange));
        if (request.type === "advance") this.fallback.advance(request.inputs);
        else this.fallback.advanceYears(request.inputs, request.years);
      } else if (request.type === "add-practice") {
        this.fallback.addPractice(request.practice);
      } else if (request.type === "advance-regions") {
        for (const region of request.regions) {
          let engine = this.regionalFallback.get(region.id);
          if (!engine) {
            engine = new SimulationEngine(this.regionSeed(region.id), region.stores, region.knowledge);
            this.regionalFallback.set(region.id, engine);
          }
          else engine.setStores(addStores(engine.snapshot.stores, region.storeChange));
          engine.advance(region.inputs);
          this.regionalCurrent.set(region.id, engine.checkpoint);
          this.regionalFresh.add(region.id);
        }
      }
    }
    this.pending = this.fallback.checkpoint;
  }

  private regionSeed(id: string): number {
    let hash = this.seed | 0;
    for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x45d9f3b);
    return hash >>> 0;
  }

  private takeStoreChange(): Stores {
    const change = this.unpostedStoreChange;
    this.unpostedStoreChange = zeroStores();
    return change;
  }

  private consumeRegionalSnapshots(): void {
    for (const id of this.regionalFresh) {
      const snapshot = this.regionalCurrent.get(id);
      if (snapshot) this.regionalLastStores.set(id, { ...snapshot.stores });
    }
    this.regionalFresh.clear();
  }

  private visibleStores(snapshot: Readonly<SimulationSnapshot>): Stores {
    let stores = addStores(snapshot.stores, this.unpostedStoreChange);
    for (const request of this.outstanding) {
      if (request.type === "advance" || request.type === "advance-years") {
        stores = addStores(stores, request.storeChange);
      }
    }
    return stores;
  }
}
