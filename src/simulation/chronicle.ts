import type { SimulationSnapshot } from "./types.ts";
import type { ChronicleEvent, ChronicleEventKind, ExperimentCheckpoint } from "./manifest.ts";

export type ChronicleMetrics = ChronicleEvent["metrics"];

export function classifyChronicleEvent(message: string): ChronicleEventKind {
  const text = message.toLowerCase();
  if (/directive|council order|priority/.test(text)) return "directive";
  if (/discover|isle|continent|jungle|desert|volcan|tundra|ruin/.test(text)) return "discovery";
  if (/starts a|finished a|work begins|farm|market|forge|fishery|lumber/.test(text)) return "construction";
  if (/founded|camp on|offshoot/.test(text)) return "founding";
  if (/migrant|resettled|migration|child.*came of age/.test(text)) return "migration";
  if (/trade|envoy|signal corridor|route/.test(text)) return "trade";
  if (/custom|lineage|culture|practice/.test(text)) return "culture";
  if (/collapse/.test(text)) return "collapse";
  if (/renew/.test(text)) return "renewal";
  if (/rain|storm|drought|flood|wildfire|ash|weather/.test(text)) return "weather";
  if (/milestone|chapter/.test(text)) return "milestone";
  return "observation";
}

/**
 * Event source and checkpoint store shared by the visible observer history and
 * exported research records. Events are bounded in memory, while checkpoint
 * capture is explicit so a long-running browser session stays lightweight.
 */
export class EventChronicle {
  private readonly events: ChronicleEvent[] = [];
  private readonly checkpoints: ExperimentCheckpoint[] = [];

  record(day: number, kind: ChronicleEventKind, message: string, regions: readonly string[], metrics: ChronicleMetrics): void {
    const previous = this.events.at(-1);
    if (previous?.message === message && Math.abs(previous.day - day) < 0.01) return;
    this.events.push({
      id: this.events.length + 1,
      day: Number(day.toFixed(4)),
      year: Math.floor(day / 12) + 1,
      kind,
      message,
      regions: [...new Set(regions)].sort(),
      metrics: { ...metrics },
    });
    if (this.events.length > 2_400) this.events.splice(0, this.events.length - 2_400);
  }

  checkpoint(year: number, snapshot: SimulationSnapshot): void {
    const previous = this.checkpoints.at(-1);
    if (previous?.year === year) return;
    this.checkpoints.push({ year, snapshot: structuredClone(snapshot) });
    if (this.checkpoints.length > 480) this.checkpoints.splice(0, this.checkpoints.length - 480);
  }

  getEvents(): ChronicleEvent[] {
    return structuredClone(this.events);
  }

  getCheckpoints(): ExperimentCheckpoint[] {
    return structuredClone(this.checkpoints);
  }
}
