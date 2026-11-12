// Vitest: the kitchen's rules in src/game/, run in Node with no browser.
// Values come from data/config.json, so a tuning change keeps the tests true.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import {
  deliveryPoints, fitsRecipe, isPotDone, islandTarget, nextOrderAt, rng, scoreAfterMiss, setSeed, soupOfContents, starsFor,
} from '../../src/game/rules';

const v = (k: keyof typeof config): number => (config[k] as { value: number }).value;

describe('rng', () => {
  it('repeats the same numbers for the same seed', () => {
    setSeed(config.seed); const first = [rng(), rng(), rng()];
    setSeed(config.seed); const again = [rng(), rng(), rng()];
    expect(again).toEqual(first);
    expect(first.every(n => n >= 0 && n < 1)).toBe(true);
  });
});

describe('serving an order', () => {
  const base = v('points_base'), tip = v('tip_max'), patience = v('order_patience');

  it('pays the base plus the whole tip when served at once', () => {
    expect(deliveryPoints(base, tip, patience, patience)).toBe(base + tip);
  });

  it('pays the base plus half the tip at half patience', () => {
    expect(deliveryPoints(base, tip, patience / 2, patience)).toBe(base + Math.round(tip / 2));
  });

  it('never pays less than the base, even past patience', () => {
    expect(deliveryPoints(base, tip, -5, patience)).toBe(base);
  });
});

describe('missing an order', () => {
  const penalty = v('missed_penalty');

  it('takes the penalty off the score', () => {
    expect(scoreAfterMiss(penalty * 3, penalty)).toBe(penalty * 2);
  });

  it('never takes the score below zero', () => {
    expect(scoreAfterMiss(penalty - 1, penalty)).toBe(0);
  });
});

describe('stars for a shift', () => {
  const s1 = v('s1_star1'), s2 = v('s1_star2'), s3 = v('s1_star3');

  it('gives 0 to 3 stars at the thresholds', () => {
    expect(starsFor(s1 - 1, s1, s2, s3)).toBe(0);
    expect(starsFor(s1, s1, s2, s3)).toBe(1);
    expect(starsFor(s2, s1, s2, s3)).toBe(2);
    expect(starsFor(s3, s1, s2, s3)).toBe(3);
  });
});

describe('order pace', () => {
  const len = v('shift_length'), start = v('s1_order_interval_start'), end = v('s1_order_interval_end');

  it('waits the start gap at the shift start and the end gap at its end', () => {
    expect(nextOrderAt(0, len, start, end)).toBe(start);
    expect(nextOrderAt(len, len, start, end)).toBeCloseTo(len + end, 9);
  });

  it('keeps the end gap after the shift length', () => {
    expect(nextOrderAt(len * 2, len, start, end)).toBeCloseTo(len * 2 + end, 9);
  });
});

describe('pots and soups', () => {
  it('names the soup from what is in the pot', () => {
    expect(soupOfContents(['tomato', 'tomato'])).toBe('red');
    expect(soupOfContents(['kelp', 'kelp'])).toBe('green');
    expect(soupOfContents(['tomato', 'kelp'])).toBe('mixed');
    expect(soupOfContents(['shroom', 'shroom'])).toBe('crater');
    expect(soupOfContents(['kelp', 'shroom'])).toBe('galaxy');
    expect(soupOfContents(['tomato', 'pepper'])).toBe('flare');
  });

  it('turns a mix that fits no recipe into slop', () => {
    expect(soupOfContents(['pepper', 'kelp'])).toBe('slop');
    expect(soupOfContents(['pepper', 'pepper'])).toBe('slop');
    expect(soupOfContents(['tomato', 'shroom'])).toBe('slop');
  });

  it('names the soup by its kinds whatever the pot size', () => {
    expect(soupOfContents(['tomato', 'tomato', 'tomato'])).toBe('red');
    expect(soupOfContents(['shroom', 'kelp', 'kelp'])).toBe('galaxy');
  });

  it('is done only when full, cooked and not burnt', () => {
    const size = v('pot_size'), cook = v('cook_time');
    expect(isPotDone(size, cook, false, size, cook)).toBe(true);
    expect(isPotDone(size - 1, cook, false, size, cook)).toBe(false);
    expect(isPotDone(size, cook - 0.5, false, size, cook)).toBe(false);
    expect(isPotDone(size, cook, true, size, cook)).toBe(false);
  });

  it('knows what a half-filled pot can still become', () => {
    expect(fitsRecipe(['tomato', 'kelp'], ['kelp'])).toBe(true);
    expect(fitsRecipe(['tomato', 'tomato'], ['kelp'])).toBe(false);
  });
});

describe('the drifting island (shift 6)', () => {
  const home = 4, reach = v('island_reach');

  it('leaves its home toward the side it is sent', () => {
    expect(islandTarget(home, home, reach, -1)).toBe(home - reach);
    expect(islandTarget(home, home, reach, 1)).toBe(home + reach);
  });

  it('crosses to the far side from either side', () => {
    expect(islandTarget(home - reach, home, reach, -1)).toBe(home + reach);
    expect(islandTarget(home + reach, home, reach, 1)).toBe(home - reach);
  });
});
