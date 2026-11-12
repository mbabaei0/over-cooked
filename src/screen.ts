// The screen: a 1280x720 logical canvas scaled to the window, and the drawing kit
// every scene uses (text, outlined text, rounded boxes, ellipses, the line style).

/** Logical width and height; everything is drawn in these units. */
export const W = 1280, H = 720;
/** Whole-pixel scaling and no smoothing when true. */
export const PIXEL = false;
/** The game's font stack. */
export const FONT = '"Trebuchet MS", Verdana, sans-serif';

/** The game's canvas (#game in index.html). */
export const canvas = document.getElementById('game') as HTMLCanvasElement;
/** Its 2D context. */
export const ctx = canvas.getContext('2d')!;
/** The transform after fit(): each frame starts from it. */
export let baseTransform: DOMMatrix;

/** Sizes the canvas to the window, keeping the logical size. */
export function fit(): void {
  const k = Math.min(innerWidth / W, innerHeight / H);
  const s = PIXEL ? Math.max(1, Math.floor(k)) : k;
  const r = PIXEL ? 1 : s * (devicePixelRatio || 1);
  canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
  canvas.style.width = Math.round(W * s) + 'px'; canvas.style.height = Math.round(H * s) + 'px';
  canvas.style.marginTop = Math.max(0, Math.floor((innerHeight - H * s) / 2)) + 'px';
  canvas.style.imageRendering = PIXEL ? 'pixelated' : 'auto';
  ctx.setTransform(r, 0, 0, r, 0, 0); ctx.imageSmoothingEnabled = !PIXEL;
  baseTransform = ctx.getTransform();
}
addEventListener('resize', fit); fit();

/** Fills the whole screen with one colour. */
export function clear(c: string): void { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }

/** Plain text, vertically centred on y. */
export function text(s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = 'center', weight = 'bold'): void {
  ctx.fillStyle = c; ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align;
  ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}

/** Bold text with a dark outline, vertically centred on y. */
export function textOutlined(s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = 'center'): void {
  ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = '#10141f';
  ctx.strokeText(s, x, y); ctx.fillStyle = c; ctx.fillText(s, x, y);
}

/** The outline style every figure is stroked with. */
export function lineStyle(w = 2.5): void { ctx.lineWidth = w; ctx.strokeStyle = '#141824'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
/** Starts a rounded-rectangle path. */
export function rrect(x: number, y: number, w: number, h: number, r: number): void { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/** Starts an ellipse path. */
export function ellipse(x: number, y: number, rx: number, ry: number): void { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
