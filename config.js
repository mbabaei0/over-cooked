// PROTOTYPE - NOT FOR PRODUCTION
// Question: Do three shifts, each with its own twist, keep zero-g cooking fresh for 10 minutes, alone with a bot or with friends?
// Date: 2026-11-12
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
// s1_ / s2_ / s3_ values are per shift: shift 1 is gentle, shift 3 is the busy one.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

  // ---- The hook: gravity failures ----
  s1_first_zero_g: { value: 55, min: 5, max: 150, step: 1 },    // s into shift 1 of the first failure
  s2_first_zero_g: { value: 45, min: 5, max: 150, step: 1 },
  s3_first_zero_g: { value: 38, min: 5, max: 150, step: 1 },
  s1_zero_g_interval: { value: 70, min: 10, max: 150, step: 1 }, // s from gravity back to the next failure
  s2_zero_g_interval: { value: 40, min: 10, max: 150, step: 1 },
  s3_zero_g_interval: { value: 30, min: 10, max: 150, step: 1 },
  zero_g_jitter: { value: 5, min: 0, max: 20, step: 1 },       // s, +/- random spread on the interval
  s1_zero_g_duration: { value: 6, min: 2, max: 20, step: 0.5 },  // s gravity stays off
  s2_zero_g_duration: { value: 7, min: 2, max: 20, step: 0.5 },
  s3_zero_g_duration: { value: 8, min: 2, max: 20, step: 0.5 },
  zero_g_warning: { value: 3, min: 0, max: 8, step: 0.5 },     // s of alarm before it cuts out
  float_kick: { value: 1.3, min: 0, max: 4, step: 0.1 },       // tiles/s, push given to each loose item
  float_drag: { value: 0.12, min: 0, max: 2, step: 0.02 },     // per s, how fast floating items slow down
  float_height: { value: 1.35, min: 0.9, max: 2.5, step: 0.05 }, // tiles above the floor items float at
  fall_gravity: { value: 14, min: 4, max: 40, step: 1 },       // tiles/s^2 when gravity comes back

  // ---- Shift 2's twist: the cargo conveyor ----
  conveyor_speed: { value: 1.1, min: 0.2, max: 4, step: 0.1 },   // tiles/s along the belt (it never stops, zero-g or not)
  conveyor_interval: { value: 2.6, min: 0.5, max: 10, step: 0.1 }, // s between crates the cargo bay drops on the belt

  // ---- Shift 3's twist: the hull breach vent (open while gravity is off) ----
  breach_pull: { value: 2.6, min: 0, max: 10, step: 0.1 },      // tiles/s^2 pull on floating items, strongest near the vent
  breach_pull_cook: { value: 1.2, min: 0, max: 10, step: 0.1 }, // tiles/s^2 pull on drifting cooks
  breach_radius: { value: 0.7, min: 0.2, max: 2, step: 0.05 },  // tiles; a floating item this close is lost to space
  pot_respawn: { value: 6, min: 1, max: 30, step: 0.5 },        // s before a lost pot is replaced on its stove

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
  cheer_time: { value: 1.2, min: 0.3, max: 3, step: 0.1 },     // s every cook cheers for

  // ---- The bot partner (BOLT), when one person plays ----
  bot_partner: { value: 1, min: 0, max: 1, step: 1 },          // 1 = a bot joins a solo shift, 0 = play alone
  bot_speed: { value: 0.85, min: 0.3, max: 1.2, step: 0.05 },  // x cook_speed
  bot_think: { value: 0.25, min: 0.05, max: 1, step: 0.05 },   // s between the bot's decisions
  bot_serve_delay: { value: 2.5, min: 0, max: 15, step: 0.5 }, // s a soup sits done before the bot plates it (leaves it to you first)

  // ---- Kitchen ----
  chop_time: { value: 1.5, min: 0.3, max: 5, step: 0.1 },      // s of holding Use to chop
  cook_time: { value: 9, min: 2, max: 30, step: 0.5 },         // s a full pot takes on a stove
  burn_time: { value: 10, min: 2, max: 30, step: 0.5 },        // s after done before the soup burns
  pot_size: { value: 2, min: 1, max: 3, step: 1 },             // chopped ingredients per soup

  // ---- The shift ----
  shift_length: { value: 180, min: 30, max: 600, step: 10 },   // s, every shift
  s1_order_interval_start: { value: 22, min: 4, max: 40, step: 1 }, // s between new orders at the start
  s1_order_interval_end: { value: 14, min: 3, max: 40, step: 1 },   // s between new orders at the end
  s2_order_interval_start: { value: 18, min: 4, max: 40, step: 1 },
  s2_order_interval_end: { value: 11, min: 3, max: 40, step: 1 },
  s3_order_interval_start: { value: 15, min: 4, max: 40, step: 1 },
  s3_order_interval_end: { value: 8, min: 3, max: 40, step: 1 },
  order_patience: { value: 65, min: 15, max: 150, step: 5 },   // s an order waits before it is missed
  max_orders: { value: 4, min: 1, max: 6, step: 1 },
  points_base: { value: 20, min: 5, max: 50, step: 1 },        // per soup served
  tip_max: { value: 10, min: 0, max: 30, step: 1 },            // extra for a fast serve, scaled by patience left
  missed_penalty: { value: 10, min: 0, max: 30, step: 1 },     // lost when an order runs out
  s1_star1: { value: 50, min: 10, max: 400, step: 5 },         // shift 1 score for 1 star (1 star unlocks the next shift)
  s1_star2: { value: 110, min: 10, max: 500, step: 5 },
  s1_star3: { value: 170, min: 10, max: 600, step: 5 },
  s2_star1: { value: 60, min: 10, max: 400, step: 5 },
  s2_star2: { value: 130, min: 10, max: 500, step: 5 },
  s2_star3: { value: 200, min: 10, max: 600, step: 5 },
  s3_star1: { value: 60, min: 10, max: 400, step: 5 },
  s3_star2: { value: 140, min: 10, max: 500, step: 5 },
  s3_star3: { value: 220, min: 10, max: 600, step: 5 },

  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },
};
