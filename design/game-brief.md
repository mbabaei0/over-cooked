# Game Brief: Space Station Galley

## In your words
Space Station Galley
1. Playing alone: keep all (the usual: a bot partner)
2. How long: keep all (the usual: three shifts in three galleys)
3. Stakes: keep all (the usual: stars, no way to fail)
4. Feel: keep all (the usual: slapstick)
5. Look: keep all (the usual: the spike's 2.5D galley)
6. How hard: keep all (the usual)
7. Controls: keep all (keyboard, gamepads, phones)
After play: love it

**Pitch:** A slapstick co-op cooking game on a space station, where gravity keeps failing and everything you didn't grab floats away mid-order. *(inferred (strong))*

**Genre:** co-op cooking (co-op, kitchen job)

**Controls:** WASD/arrows to move, one key to grab or drop, one to chop or dash (push off in zero-g); gamepads, or phones joining by QR code, for P1–P4.

**Question:** Do three shifts, each with its own twist, keep zero-g cooking fresh for 10 minutes, alone with a bot or with friends?

**Hooks:** Gravity fails partway through the shift: loose items float, cooks drift and bounce, and you catch or throw things mid-air.

**Intent:** soft or no failure *(provisional)* · payoff builds *(provisional)*

## Look and references
- Look: the spike's tilted 2.5D cartoon galley: pale steel counters with orange trim, a dark plated floor, portholes onto a ringed planet and stars, chunky orange-suited cooks; red alarm lights pulse before gravity cuts out. Each galley has its own trim colour and view out the window. Every figure drawn, no emoji, no plain circles.
- References: the spike prototype (look, zero-g rules, phone controllers); the co-op cooking genre for orders and handoffs.
- View: 2.5D · Camera: one room that fits the window, tilted about 50°

## First minute
Shift 1 opens on a calm galley with one recipe (Red Nebula soup). The first order card slides in; you grab a tomato, chop it at the board, drop it in a pot, it cooks on the stove, you plate it in a bowl and serve it at the hatch for points and a tip. The bot partner (or P2) starts chopping too. At about 55 s the alarm sounds, lights go red, "GRAVITY OFFLINE!", and your half-chopped tomatoes drift off; you push off a counter and grab one mid-air. Gravity comes back and everything falls where it is.

## Challenge
Shift 1 is gentle: two soups, one gravity failure early. Shift 2 adds a conveyor that carries ingredients in from the cargo bay and keeps moving in zero-g. Shift 3 adds a hull breach vent that pulls anything floating toward it, lost unless caught. Orders come faster and gravity fails more often; by shift 3 you miss orders unless you split the work. A missed order costs points. Stars unlock the next shift (1 star is enough); replaying for 3 stars is the long tail.

## Core loop
- Read the orders → fetch, chop, cook, plate, serve before patience runs out
- Gravity fails → recover what floats, or use it (throw across the room)
- Score → stars at the end of the shift → unlock the next galley, or replay for more stars
- Leads: co-op leads the team (bot, shared credit); management leads orders and the clock

## Goal & fail state
- Earn 1–3 stars on each of three shifts; the run is complete when shift 3 has a star.
- No way to fail: a low score is 0 stars and a retry.

## Features
- [x] Three shifts in three galley layouts, each with its own twist (none, conveyor, breach vent)
- [x] Zero-g failures: things float, cooks drift and bounce, catch and throw
- [x] Chop → pot → cook → plate → serve, with three soups and burning
- [x] Bot partner played alone: chops, carries, fetches what floats off, never blocks
- [x] 1–4 players on keyboard, gamepads, or phones by QR
- [x] Shift-select screen with stars, and an end screen showing each cook's part (shared credit)
- [x] One cheer key: every cook cheers (team signals)
- [x] Cheat code: type ZERO on the shift select to unlock every shift (again to lock them)
- [x] Shift 4, Dark Side Galley: the power fails with gravity, so only helmet lamps, stoves and the hatch light the kitchen
- [x] New recipes: Moon Shroom and Sun Pepper, three new soups (Crater Stew, Galaxy Broth, Solar Flare), and Space Slop for a pot that fits no recipe; later shifts add more of them

## Keep
- love it, the whole game as built *(you said)*
- best moment: everything working smoothly *(you said)*

## Avoid
- (none yet)

## Out of scope
- Co-op with a friend on another machine: needs a server: not built yet (phones on the same network are built instead)
- Split screen: change it after play
- New shared tools chapter by chapter: grow it

## Build order
1. The slice: three shifts, the bot partner, stars and the shift select, built on the spike's zero-g kitchen

---
**Kill condition:** if shifts 2 and 3 feel like shift 1 with different furniture after one tuning round. *(guessed)*

**Who it's for / what they feel:** friends on a couch (or one player with a bot) who want 10 minutes of laughing at their own mess. *(guessed)*

**Games you love / don't:** none named; the genre is co-op cooking games. *(guessed)*
