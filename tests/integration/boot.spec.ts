// Playwright: the single-file build opened from disk, driven through the
// game-state hook (src/hook.ts). npm run smoke runs only the @boot test.
// ?phones=0 keeps the phone room (PeerJS, a network call) out of the checks.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(build(query));
  // Until the game installs its hook, window.game is the canvas (an element's id is a window
  // property), so wait for the hook itself.
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return errors;
}

test('boots to the title screen with no errors @boot', async ({ page }) => {
  const errors = await open(page, 'manual=1&phones=0');
  expect(await page.evaluate(() => window.game!.scene)).toBe('title');
  const size = await page.locator('#game').boundingBox();
  expect(size && size.width > 0 && size.height > 0).toBe(true);
  expect(errors).toEqual([]);
});

test('a scripted shift reaches the first gravity failure, and the same seed repeats it exactly', async ({ page }) => {
  // The reference replay's opening: Enter (title, P1 joins), Enter (start shift 1), then P1
  // walks right and grabs; then the shift runs on to just past the first zero-g.
  // ?manual=1 stops the loop, so only step() moves the game.
  const firstZeroG = config.s1_first_zero_g.value;
  async function run(): Promise<{ scene: string; moved: number; failures: number; state: unknown }> {
    const errors = await open(page, 'manual=1&phones=0&seed=7');
    const out = await page.evaluate(firstZeroG => {
      type P = { x: number; bot: boolean };
      type S = { players: P[]; g: { failures: number } };
      const g = window.game!;
      g.press('Enter'); g.step(30, false);
      g.press('Enter'); g.step(60, false);
      const p1 = () => (g.state as S).players.find(p => !p.bot)!;
      const x0 = p1().x;
      g.hold('KeyD', true); g.step(72, false); g.hold('KeyD', false);
      const moved = p1().x - x0;
      g.press('KeyF'); g.step(Math.ceil((firstZeroG + 1) * 60), false);
      return { scene: g.scene, moved, failures: (g.state as S).g.failures, state: JSON.parse(JSON.stringify(g.state)) };
    }, firstZeroG);
    expect(errors).toEqual([]);
    return out;
  }
  const first = await run();
  expect(first.scene).toBe('play');
  expect(first.moved).toBeGreaterThan(0.5);
  expect(first.failures).toBe(1);
  expect(await run()).toEqual(first);
});

test('shift 5: a cook who walks onto the portal comes out on the serving ship', async ({ page }) => {
  const errors = await open(page, 'manual=1&phones=0&scene=play&shift=5&solo=1');
  const out = await page.evaluate(() => {
    type P = { x: number; y: number; bot: boolean };
    const g = window.game!, p1 = () => (g.state as { players: P[] }).players.find(p => !p.bot)!;
    // P1 starts at (3.5, 6.5) on the cooking ship; the pad is at row 4, column 5.
    g.hold('KeyW', true); g.step(28, false); g.hold('KeyW', false);
    const before = { x: p1().x, y: p1().y };
    g.hold('KeyD', true); g.step(40, false); g.hold('KeyD', false);
    return { before, after: { x: p1().x, y: p1().y }, warped: (g.events as { type: string }[]).some(e => e.type === 'portal') };
  });
  expect(out.before.x).toBeLessThan(7);
  expect(out.warped).toBe(true);
  expect(out.after.x).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('shift 6: when gravity fails the island drifts to one side and closes it', async ({ page }) => {
  const first = config.s6_first_zero_g.value, reach = config.island_reach.value;
  const errors = await open(page, 'manual=1&phones=0&scene=play&shift=6&solo=1');
  const out = await page.evaluate(first => {
    type T = { type: string; island: boolean };
    type S = { island: { col: number; home: number; w: number; r: number }; tiles: T[][] };
    const g = window.game!, s = () => g.state as S;
    const home = s().island.col;
    g.step(Math.ceil((first + 9) * 60), false);
    const I = s().island, row = s().tiles[I.r];
    return { home, col: I.col, w: I.w, left: row[1].type, right: row[13].type };
  }, first);
  expect(Math.abs(out.col - out.home)).toBe(reach);
  // the side it went to is closed, the other side is open floor
  if (out.col < out.home) { expect(out.left).not.toBe('.'); expect(out.right).toBe('.'); }
  else { expect(out.right).not.toBe('.'); expect(out.left).toBe('.'); }
  expect(errors).toEqual([]);
});
