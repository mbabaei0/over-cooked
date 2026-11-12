// The game's shared types.

/**
 * Objects the code builds field by field, kind by kind: the shift state, cooks,
 * items, tiles, orders and phone controllers. Typing each is still to do; the grow
 * record names them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

/** One step of a cook's controls, from keys, a pad, a phone or BOLT. */
export interface Input {
  mx: number;
  my: number;
  grab: boolean;
  useHeld: boolean;
  usePressed: boolean;
}

/** A grid cell, [row, column]. */
export type Cell = [number, number];
