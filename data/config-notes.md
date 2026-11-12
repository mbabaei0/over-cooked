# The values' notes

What `prototypes/space-station-galley/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

---- The hook: gravity failures ----
- `s1_first_zero_g`: s into shift 1 of the first failure
- `s1_zero_g_interval`: s from gravity back to the next failure
- `zero_g_jitter`: s, +/- random spread on the interval
- `s1_zero_g_duration`: s gravity stays off
- `zero_g_warning`: s of alarm before it cuts out
- `float_kick`: tiles/s, push given to each loose item
- `float_drag`: per s, how fast floating items slow down
- `float_height`: tiles above the floor items float at
- `fall_gravity`: tiles/s^2 when gravity comes back

---- Shift 2's twist: the cargo conveyor ----
- `conveyor_speed`: tiles/s along the belt (it never stops, zero-g or not)
- `conveyor_interval`: s between crates the cargo bay drops on the belt

---- Shift 3's twist: the hull breach vent (open while gravity is off) ----
- `breach_pull`: tiles/s^2 pull on floating items, strongest near the vent
- `breach_pull_cook`: tiles/s^2 pull on drifting cooks
- `breach_radius`: tiles; a floating item this close is lost to space
- `pot_respawn`: s before a lost pot is replaced on its stove

---- Shift 4's twist: the blackout (the power fails with gravity) ----
- `s4_*`: shift 4's gravity schedule, order pace and stars, read like the `s1_` values
- `dark_level`: 0 = no blackout, 1 = pitch black away from the lights
- `dark_fade`: per s, how fast the lights go out and come back
- `dark_lamp`: tiles, the reach of each cook's helmet lamp
- `dark_glow`: tiles, the glow around each stove and the serving hatch

---- Cooks ----
- `cook_speed`: tiles/s walking
- `cook_accel`: tiles/s^2 walking start/stop
- `zero_g_thrust`: tiles/s^2 suit thrusters in zero-g
- `zero_g_max`: tiles/s top drift speed in zero-g
- `zero_g_drag`: per s drift slow-down in zero-g
- `wall_bounce`: 0 = stick, 1 = full bounce off counters in zero-g
- `dash_speed`: tiles/s dash (zero-g: push-off)
- `dash_cooldown`: s
- `toss_speed`: tiles/s an item is thrown at
- `reach`: tiles, how far a cook can grab loose items
- `cheer_time`: s every cook cheers for

---- The bot partner (BOLT), when one person plays ----
- `bot_partner`: 1 = a bot joins a solo shift, 0 = play alone
- `bot_speed`: x cook_speed
- `bot_think`: s between the bot's decisions
- `bot_serve_delay`: s a soup sits done before the bot plates it (leaves it to you first)

---- Kitchen ----
- `chop_time`: s of holding Use to chop
- `cook_time`: s a full pot takes on a stove
- `burn_time`: s after done before the soup burns
- `pot_size`: chopped ingredients per soup

---- The shift ----
- `shift_length`: s, every shift
- `s1_order_interval_start`: s between new orders at the start
- `s1_order_interval_end`: s between new orders at the end
- `order_patience`: s an order waits before it is missed
- `points_base`: per soup served
- `tip_max`: extra for a fast serve, scaled by patience left
- `missed_penalty`: lost when an order runs out
- `s1_star1`: shift 1 score for 1 star (1 star unlocks the next shift)

