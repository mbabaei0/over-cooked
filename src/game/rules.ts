// The kitchen's rules with no browser in them, so Vitest runs them in Node.
// The game calls these; the values come from data/config.json through the caller.

/** The three soups' keys. */
export type SoupType = 'red' | 'green' | 'mixed';
/** Ingredient kinds a pot holds. */
export type Ingredient = 'tomato' | 'kelp';

/** The seeded random source: mulberry32. Every gameplay random call reads this, never Math.random. */
let seed = 0;
/** Sets the seed; the same seed gives the same game. */
export function setSeed(n: number): void { seed = n; }
/** The next random number in [0, 1). */
export function rng(): number {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The soup a pot's contents make: all tomato is red, no tomato is green, else mixed. */
export function soupOfContents(contents: readonly string[]): SoupType {
  const tom = contents.filter(k => k === 'tomato').length;
  return tom === contents.length ? 'red' : tom === 0 ? 'green' : 'mixed';
}

/** True when a pot is full, cooked and not burnt. */
export function isPotDone(contents: number, cook: number, burnt: boolean, potSize: number, cookTime: number): boolean {
  return contents >= potSize && cook >= cookTime && !burnt;
}

/** True when what is in a pot so far can still become this recipe. */
export function fitsRecipe(recipe: readonly string[], contents: readonly string[]): boolean {
  const r = recipe.slice();
  for (const k of contents) { const i = r.indexOf(k); if (i < 0) return false; r.splice(i, 1); }
  return true;
}

/** Points for a served order: the base, plus a tip for the patience left (timeLeft of patience). */
export function deliveryPoints(base: number, tipMax: number, timeLeft: number, patience: number): number {
  return base + Math.round(tipMax * Math.max(0, timeLeft / patience));
}

/** The score after a missed order: the penalty taken, never below zero. */
export function scoreAfterMiss(score: number, penalty: number): number {
  return Math.max(0, score - penalty);
}

/**
 * When the next order comes, at time t: the gap between orders runs from gapStart to
 * gapEnd as the shift goes on (t of shiftLength), so orders come faster late in a shift.
 */
export function nextOrderAt(t: number, shiftLength: number, gapStart: number, gapEnd: number): number {
  const k = Math.min(1, t / shiftLength);
  return t + gapStart + (gapEnd - gapStart) * k;
}

/** Stars for a shift's score against its three thresholds. */
export function starsFor(score: number, star1: number, star2: number, star3: number): number {
  return score >= star3 ? 3 : score >= star2 ? 2 : score >= star1 ? 1 : 0;
}
