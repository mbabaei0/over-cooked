// PROTOTYPE - NOT FOR PRODUCTION
// Question: Is cooking still fun, and funny, when gravity cuts out and loose ingredients float away?
// Date: 2026-11-11
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

  // ---- The hook: gravity failures ----
  first_zero_g: { value: 55, min: 5, max: 150, step: 1 },      // s into the shift of the first failure
  zero_g_interval: { value: 38, min: 10, max: 120, step: 1 },  // s from gravity back to the next failure
  zero_g_jitter: { value: 6, min: 0, max: 20, step: 1 },       // s, +/- random spread on the interval
  zero_g_duration: { value: 7, min: 2, max: 20, step: 0.5 },   // s gravity stays off
  zero_g_warning: { value: 3, min: 0, max: 8, step: 0.5 },     // s of alarm before it cuts out
  float_kick: { value: 1.3, min: 0, max: 4, step: 0.1 },       // tiles/s, push given to each loose item
  float_drag: { value: 0.12, min: 0, max: 2, step: 0.02 },     // per s, how fast floating items slow down
  float_height: { value: 1.35, min: 0.9, max: 2.5, step: 0.05 }, // tiles above the floor items float at
  fall_gravity: { value: 14, min: 4, max: 40, step: 1 },       // tiles/s^2 when gravity comes back

  // ---- Cooks ----
  cook_speed: { value: 4.4, min: 2, max: 8, step: 0.1 },       // tiles/s walking
  cook_accel: { value: 38, min: 5, max: 100, step: 1 },        // tiles/s^2 walking start/stop
  zero_g_thrust: { value: 5, min: 1, max: 15, step: 0.25 },    // tiles/s^2 suit thrusters in zero-g
  zero_g_max: { value: 4.2, min: 1, max: 10, step: 0.1 },      // tiles/s top drift speed in zero-g
  zero_g_drag: { value: 0.35, min: 0, max: 3, step: 0.05 },    // per s drift slow-down in zero-g
  wall_bounce: { value: 0.65, min: 0, max: 1, step: 0.05 },    // 0 = stick, 1 = full bounce off counters in zero-g
  dash_speed: { value: 8, min: 3, max: 16, step: 0.5 },        // tiles/s dash (zero-g: push-off)
  dash_cooldown: { value: 0.7, min: 0.1, max: 3, step: 0.05 }, // s
  toss_speed: { value: 4, min: 1, max: 10, step: 0.25 },       // tiles/s an item is thrown at
  reach: { value: 1.05, min: 0.5, max: 2, step: 0.05 },        // tiles, how far a cook can grab loose items

  // ---- Kitchen ----
  chop_time: { value: 1.5, min: 0.3, max: 5, step: 0.1 },      // s of holding Use to chop
  cook_time: { value: 9, min: 2, max: 30, step: 0.5 },         // s a full pot takes on a stove
  burn_time: { value: 10, min: 2, max: 30, step: 0.5 },        // s after done before the soup burns
  pot_size: { value: 2, min: 1, max: 3, step: 1 },             // chopped ingredients per soup

  // ---- The shift ----
  shift_length: { value: 180, min: 30, max: 600, step: 10 },   // s
  order_interval_start: { value: 18, min: 4, max: 40, step: 1 }, // s between new orders at the start
  order_interval_end: { value: 9, min: 3, max: 40, step: 1 },  // s between new orders at the end
  order_patience: { value: 65, min: 15, max: 150, step: 5 },   // s an order waits before it is missed
  max_orders: { value: 4, min: 1, max: 6, step: 1 },
  points_base: { value: 20, min: 5, max: 50, step: 1 },        // per soup served
  tip_max: { value: 10, min: 0, max: 30, step: 1 },            // extra for a fast serve, scaled by patience left
  missed_penalty: { value: 10, min: 0, max: 30, step: 1 },     // lost when an order runs out
  star1: { value: 60, min: 10, max: 400, step: 5 },            // score for 1 star
  star2: { value: 130, min: 10, max: 500, step: 5 },           // score for 2 stars
  star3: { value: 200, min: 10, max: 600, step: 5 },           // score for 3 stars

  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },
};
