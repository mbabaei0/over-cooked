// Input: keys by position (event.code), OS key repeat ignored; gamepads read once a step.
import { startAudio } from './audio';

/** Keys held now. */
export const down = new Set<string>();
/** Keys pressed this step; cleared after each step. */
export const hit = new Set<string>();
/** True when the key went down this step. */
export const pressed = (code: string): boolean => hit.has(code);
const GAME_KEYS = new Set(['Space', 'Period', 'Slash', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const PAD_KEEP = [0, 2, 3, 9, 14, 15];
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (GAME_KEYS.has(e.code)) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('pointerdown', () => startAudio());
addEventListener('blur', () => down.clear());

/** The gamepads as read this step. */
export let padsNow: (Gamepad | null)[] = [];
/** Last step's kept buttons per pad, for edges. */
export const padPrev: Record<number, Record<number, boolean>> = {};
/** Reads the gamepads once for this step. */
export function readPads(): void {
  try { padsNow = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { padsNow = []; }
}
/** True while the pad's button is held. */
export function padBtn(gp: Gamepad | null | undefined, i: number): boolean { return !!(gp && gp.buttons[i] && gp.buttons[i].pressed); }
/** True on the step pad i's button b went down. */
export function padEdge(i: number, b: number): boolean { const gp = padsNow[i]; return padBtn(gp, b) && !((padPrev[i] || {})[b]); }
/** Keeps this step's buttons for next step's edges. */
export function savePads(): void {
  padsNow.forEach((gp, i) => { if (gp) { const o: Record<number, boolean> = {}; PAD_KEEP.forEach(b => { o[b] = padBtn(gp, b); }); padPrev[i] = o; } });
}
