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
