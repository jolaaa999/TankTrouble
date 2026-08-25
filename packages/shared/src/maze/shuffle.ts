import { createRng } from './rng.js';

/** Fisher–Yates shuffle copy using seed-derived RNG. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = createRng(seed >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
