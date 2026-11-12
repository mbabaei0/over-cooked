// Every tuning value, from data/config.json: each with value, min, max and step.
// The tweak panel is on the dev server only: no build has it. It edits the same
// object (window.CONFIG), so the game's `tune` reads stay live.
import data from '../data/config.json';

/** One tuning value: its value and the slider's range. */
export interface Entry {
  value: number;
  min: number;
  max: number;
  step: number;
}

/** The tuning values, keyed as data/config.json; `seed` is a plain number. */
export type Config = typeof data;

declare global {
  interface Window {
    CONFIG: Config;
  }
}

/** The game's config: the data file's object itself, which the tweak panel edits live. */
export const CONFIG: Config = data;
window.CONFIG = data;

/** Live reads: `tune.speed` is `CONFIG.speed.value`, so a slider move shows at once. */
export const tune = new Proxy({} as Record<string, number>, {
  get: (_, k: string) => (CONFIG as unknown as Record<string, Entry>)[k].value,
});

if (import.meta.env.DEV) await import('./dev/tune');
