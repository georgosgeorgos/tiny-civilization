import type { BasinEngine } from './engine.ts';

/** Yield between small batches so a long run can be observed and cancelled. */
export async function runSeasons(
  engine: BasinEngine,
  seasons: number,
  options: { signal: AbortSignal; onProgress?: () => void; yieldControl?: () => Promise<void> },
): Promise<void> {
  if (!Number.isSafeInteger(seasons) || seasons < 0 || !Number.isSafeInteger(engine.state.season + seasons)) throw new Error('Choose a whole, nonnegative number of seasons.');
  const target = engine.state.season + seasons;
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  while (engine.state.season < target && !options.signal.aborted) {
    const start = performance.now();
    do {
      engine.advance(1);
    } while (engine.state.season < target && !options.signal.aborted && performance.now() - start < 12);
    options.onProgress?.();
    if (engine.state.season < target && !options.signal.aborted) await yieldControl();
  }
}
