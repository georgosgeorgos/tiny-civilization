/** Small deterministic generator suitable for replayable simulation decisions. */
export class SeededRandom {
  private state: number;

  constructor(state: number) {
    this.state = state;
    this.state = state >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  get checkpoint(): number { return this.state; }

  restore(state: number): void { this.state = state >>> 0; }
}
