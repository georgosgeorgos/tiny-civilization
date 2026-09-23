/** Advance every coupled world system in bounded quarter-day steps. */
export async function runWorldYears(options: {
  years: number;
  signal: AbortSignal;
  tick: (days: number) => void;
  progress?: (days: number, totalDays: number) => void;
  yieldControl?: () => Promise<void>;
}): Promise<number> {
  if (!Number.isInteger(options.years) || options.years < 1 || options.years > 10_000) throw new RangeError('Choose between 1 and 10,000 whole years.');
  const totalDays = options.years * 12;
  let elapsed = 0;
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  while (elapsed < totalDays && !options.signal.aborted) {
    const start = performance.now();
    do {
      options.tick(0.25);
      elapsed += 0.25;
    } while (elapsed < totalDays && !options.signal.aborted && performance.now() - start < 10);
    options.progress?.(elapsed, totalDays);
    if (elapsed < totalDays && !options.signal.aborted) await yieldControl();
  }
  return elapsed;
}
