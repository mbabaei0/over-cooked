# Grow record: Space Station Galley

Grown from `prototypes/space-station-galley/` at commit `9b9fb0b` (first build tagged
`one-shot/space-station-galley` at `49b6d06`). The one-shot folder is untouched.
Date: 2026-11-12.

| Step | What | Result | Seen in |
|---|---|---|---|
| 1 Reference | Same-seed replay of the one-shot, 60 s of play to the first zero-g | `exact no`: every game-state row matched; the screen hash at step 3600 differed only because the corner QR code encodes a random phone-room ID (`crypto.getRandomValues`) | `reference.png` |
| 2 Copy | Web project at the root, still JavaScript; vendor scripts became pinned npm packages (peerjs 1.5.4, qrcode-generator 1.4.4); `controller.html` ships beside the game in the folder build | `match not_assessed` (reference not repeatable); state rows identical to the reference, 0 errors | `copy.png` |
| 3 TypeScript | Split into `src/game/` (rules, rng, types), `screen.ts`, `input.ts`, `audio.ts`, `config.ts`; scenes, BOLT and the loop in `main.ts`; `strict` on | `tsc --noEmit` clean; `match not_assessed`; state rows identical to the reference, 0 errors | `typescript.png` |
| 4 Rules under test | Vitest: rng, delivery points, missed-order penalty, stars, order pace, soups, pots, recipes (values from `data/config.json`); Playwright: `@boot`, and a scripted shift to the first gravity failure, repeated exactly on the same seed | 12 unit + 2 integration, all pass; the miss-penalty rule broken once, its test failed, restored | — |
| 5 Record | `engine.name: Web`, `engine.version: 8.3.4`; CLAUDE.md's Technology Stack and engine reference filled in | `npm run build` pass · `test-run.sh web` `rule web:pass` (14/14) · `npm run smoke` pass | `typescript.png` beside `reference.png`: same frame |

**NOT ASSESSED:** the exact same-seed replay comparison (`exact`/`match`), because the
one-shot draws a random phone-room QR code each run. In its place, the game-state rows of
all three runs were compared by hand and are identical, and the Playwright test proves
the grown game repeats itself exactly on a seed with phones off. Phones on a real device
were not tried after the grow.

**Still `Loose` (typing to do):** the shift state, cooks (players and BOLT, with BOLT's
goals), items, tiles, orders, popups, roster entries and their controllers (keys, pad,
phone, bot), phone connections and messages, and the galley entries drawn on the select
screen.
