// Space Station Galley: four shifts in four galleys, 1-4 cooks (BOLT the robot helps a solo cook).
// Gravity cuts out every so often and everything not held floats away. Shift 2 adds a cargo
// conveyor that never stops; shift 3 a hull breach that pulls floating things out into space;
// shift 4 a blackout: the power fails with gravity, and only helmet lamps light the kitchen.
// Chunky toy-like 2.5D: a tilted camera over a box world.
//
// The design record is design/game-brief.md. This file holds the scenes, the world, BOLT and
// the loop; the browser-free rules are in game/, the screen, input and sound in their modules.
import { Peer } from 'peerjs';
import qrcode from 'qrcode-generator';
import { CONFIG, tune } from './config';
import { params, manual, clock, seedFrom, install } from './hook';
import { W, H, FONT, ctx, baseTransform, clear, text, textOutlined, lineStyle, rrect, ellipse } from './screen';
import { down, hit, pressed, padsNow, padPrev, readPads, padBtn, padEdge, savePads } from './input';
import { muted, setMuted, tone, sweep, sfx } from './audio';
import { rng, setSeed, soupOfContents, isPotDone, fitsRecipe, deliveryPoints, scoreAfterMiss, nextOrderAt, starsFor, type SoupType } from './game/rules';
import type { Loose, Input, Cell } from './game/types';

type QRCode = ReturnType<typeof qrcode>;

// ---- Built to be checked ----------------------------------------------------------------
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
const TITLE = 'Space Station Galley';
const CONTROLS = [
  'P1  WASD move  ·  F grab / place / throw  ·  G chop / dash',
  'P2  Arrows move  ·  .  grab / place / throw  ·  /  chop / dash',
  'Gamepads  stick move  ·  A grab  ·  X chop / dash  ·  Y cheer',
  'C cheer (everyone cheers)  ·  P pause  ·  M mute  ·  Phones: scan the QR code',
];
const CHEAP = params.get('render') === 'cheap';
const events: Loose[] = []; // window.game.events: anything the game wants a run to see

// ---- The galleys: four maps, projection --------------------------------------------------
// '#' counter · T tomato crate · K kelp crate · M moon shroom crate · P sun pepper crate · B chopping board · S stove · W bowl rack
// H serving hatch · X trash airlock · '.' floor
// > < ^ v conveyor belt (moves items that way) · I cargo bay (drops crates on the belt)
// V hull vent (opens while gravity is off and pulls floating things out)
const LEVELS = [
  { key: 's1', name: 'Orbit Galley', twist: 'The station kitchen. Gravity fails now and then.',
    soups: ['red', 'green'], trim: '#ff8a3d', view: 'ring', map: [
      '#TT#KK##S#S##W#',
      '#.............#',
      'B.............X',
      '#.............#',
      'B....##B##....H',
      '#.............H',
      '#.............#',
      '#.............#',
      '##W####B###S###',
    ] },
  { key: 's2', name: 'Cargo Deck', twist: 'Ingredients arrive on a conveyor that never stops, not even in zero-g.',
    soups: ['red', 'green', 'mixed', 'crater'], trim: '#2ec4b6', view: 'giant', map: [
      '##B#S#S#W#S##X#',
      'I.............#',
      'v.............H',
      'v.....#B#.....H',
      'v.............#',
      'v.............#',
      'v.............#',
      'v.............#',
      '>>>>>>>#B##W###',
    ] },
  { key: 's3', name: 'Hull Breach Bay', twist: 'When gravity fails, a hull breach pulls floating things out into space.',
    soups: ['red', 'green', 'mixed', 'crater', 'galaxy'], trim: '#e0567a', view: 'nebula', breach: true, map: [
      '#TT#S#S#S#KK#W#',
      '#.............#',
      'B.............H',
      '#....#BB#.....H',
      'B.............#',
      '#.............X',
      'M.............#',
      'M.............#',
      '##W##B#V#B#####',
    ] },
  { key: 's4', name: 'Dark Side Galley', twist: 'When gravity fails, the power fails too. Only your helmet lamp and the stoves give light.',
    soups: ['red', 'green', 'mixed', 'crater', 'galaxy', 'flare'], trim: '#ffd23f', view: 'eclipse', dark: true, map: [
      '#TT##B#W#B##KK#',
      '#.............#',
      'H.............#',
      'H....#SSS#....X',
      '#.............#',
      'M.............P',
      'M.............P',
      '#.............#',
      '##W###B#B###W##',
    ] },
];
const LAST = LEVELS.length - 1;
const DIRS: Record<string, number[]> = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], 'v': [0, 1] };
const isBelt = (t: Loose): boolean => !!t && DIRS[t.type] !== undefined;
let LV = 0, level = LEVELS[0], MAP = level.map, ROWS = MAP.length, COLS = MAP[0].length;
const LT = (name: string): number => tune[`${level.key}_${name}`]; // a per-shift tuning value
const TS = 64, TD = 42, TZ = 48, CH = 0.75; // tile width px, tile depth px, px per unit height, counter height
let X0 = (W - COLS * TS) / 2;
const Y0 = 236;
const sx = (x: number): number => X0 + x * TS;
const sy = (y: number, z = 0): number => Y0 + y * TD - z * TZ;
const SOUPS: Record<string, { name: string; color: string; rim: string; recipe: string[] }> = {
  red: { name: 'Red Nebula', color: '#e8473b', rim: '#ff8a6b', recipe: ['tomato', 'tomato'] },
  green: { name: 'Comet Kelp', color: '#4fbf5a', rim: '#9be38a', recipe: ['kelp', 'kelp'] },
  mixed: { name: 'Eclipse Mix', color: '#f0902e', rim: '#ffc46b', recipe: ['tomato', 'kelp'] },
  crater: { name: 'Crater Stew', color: '#9a7fc4', rim: '#cdb8f0', recipe: ['shroom', 'shroom'] },
  galaxy: { name: 'Galaxy Broth', color: '#4f5fd8', rim: '#9fb0ff', recipe: ['shroom', 'kelp'] },
  flare: { name: 'Solar Flare', color: '#ffb020', rim: '#fff07a', recipe: ['pepper', 'tomato'] },
  slop: { name: 'Space Slop', color: '#7a6a4a', rim: '#a8946a', recipe: [] }, // a pot that fits no recipe; no order wants it
};
/** The crates: the tile letter, the ingredient it gives, and the crate's colours. */
const CRATES: Record<string, { kind: string; box: string; label: string }> = {
  T: { kind: 'tomato', box: '#2e6f8e', label: '#e8473b' },
  K: { kind: 'kelp', box: '#2e8e6a', label: '#4fbf5a' },
  M: { kind: 'shroom', box: '#4e4478', label: '#b49ae0' },
  P: { kind: 'pepper', box: '#8a5a24', label: '#ffb020' },
};
const CRATE_OF: Record<string, string> = Object.fromEntries(Object.entries(CRATES).map(([t, c]) => [c.kind, t]));
/** The ingredients this shift's soups use: what the cargo bay drops on the belt. */
const levelKinds = (): string[] => [...new Set(level.soups.flatMap(sp => SOUPS[sp].recipe))];
const COLORS = [
  { suit: '#ff8a3d', dark: '#b8541a' }, { suit: '#2ec4b6', dark: '#16867b' },
  { suit: '#b06cff', dark: '#723cb8' }, { suit: '#ffd23f', dark: '#b38f12' },
  { suit: '#d8dee8', dark: '#8a95a8' }, // BOLT the robot
];
const KEYSETS = [
  { kind: 'keys', u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD', grab: 'KeyF', use: 'KeyG' },
  { kind: 'keys', u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', grab: 'Period', use: 'Slash' },
];
const SPAWNS = [[3.5, 6.5], [11.5, 6.5], [3.5, 2.5], [11.5, 2.5]];

// Progress: stars per shift, kept in this browser only. 1 star unlocks the next shift.
let progress: { stars: number[]; best: number[]; cheat?: boolean } = { stars: LEVELS.map(() => 0), best: LEVELS.map(() => 0) };
try { const j = JSON.parse(localStorage.getItem('ssg-progress') || 'null'); if (j && Array.isArray(j.stars)) progress = j; } catch (e) {}
// progress saved before a shift was added has no entry for it yet
for (const k of ['stars', 'best'] as const) { if (!Array.isArray(progress[k])) progress[k] = []; while (progress[k].length < LEVELS.length) progress[k].push(0); }
function saveProgress(): void { try { localStorage.setItem('ssg-progress', JSON.stringify(progress)); } catch (e) {} }
const unlocked = (i: number): boolean => params.get('unlock') === 'all' || !!progress.cheat || i === 0 || progress.stars[i - 1] > 0;

// Cheat code: type Z E R O on the shift-select screen and every shift opens; type it again to
// lock them back. Kept with the progress, so it lasts until typed again. No key in it moves
// the selection or joins a cook there.
const CHEAT = ['KeyZ', 'KeyE', 'KeyR', 'KeyO'];
const CHEAT_BANNER = 2; // seconds the "unlocked" banner shows
let cheatAt = 0, cheatBanner = 0;
/** Reads this step's presses against the cheat code; true on the step it is completed. */
function cheatTyped(): boolean {
  for (const code of hit) { // in the order pressed, so fast typing within one step still counts
    if (code === CHEAT[cheatAt]) cheatAt++;
    else cheatAt = code === CHEAT[0] ? 1 : 0;
    if (cheatAt === CHEAT.length) { cheatAt = 0; return true; }
  }
  return false;
}
const R = 0.32; // cook radius in tiles

// Stars on the window: fixed by a hash, not gameplay chance.
const STARS = Array.from({ length: 90 }, (_, i) => {
  const h = (n: number): number => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: h(1), y: h(2), s: 0.5 + h(3) * 1.6, sp: 0.3 + h(4) };
});

// ---- Players (the roster survives a restart) ----------------------------------------------
let roster: Loose[] = [];
function join(ctl: Loose): void {
  if (roster.length >= 4) return;
  const r = { i: roster.length, ctl, name: 'P' + (roster.length + 1) };
  roster.push(r);
  if (state && state.players && (scene === 'play')) {
    state.players.push(makePlayer(r));
    const bot = state.players.find((p: Loose) => p.bot); // a second person took the seat: BOLT steps out
    if (bot && roster.length >= 2) { if (bot.held) { const it = bot.held; bot.held = null; it.x = bot.x; it.y = bot.y; setAir(it, 0, 0, 1); } state.players.splice(state.players.indexOf(bot), 1); }
  }
  tone(660, 0.08, 'triangle'); tone(990, 0.1, 'triangle', 0.3, 0.08);
  events.push({ type: 'join', name: r.name });
}
function checkJoins(consume: boolean): void {
  KEYSETS.forEach(k => {
    if (pressed(k.grab) && !roster.some(r => r.ctl === k)) { join(k); if (consume) hit.delete(k.grab); }
  });
  padsNow.forEach((gp, i) => {
    if (gp && (padEdge(i, 0) || padEdge(i, 9)) && !roster.some(r => r.ctl.kind === 'pad' && r.ctl.index === i)) {
      join({ kind: 'pad', index: i }); padPrev[i] = { 0: true, 2: padBtn(gp, 2), 9: true };
    }
  });
}
function makePlayer(r: Loose): Loose {
  const [x, y] = SPAWNS[r.bot ? 1 : r.i];
  if (r.ctl.kind === 'phone') { r.ctl.grabSeen = r.ctl.grabN; r.ctl.useSeen = r.ctl.useN; } // title presses don't carry in
  return { r, x, y, vx: 0, vy: 0, z: 0, fx: 0, fy: 1, held: null, dashT: 0, dashCd: 0, chopping: false,
    delivered: 0, helped: 0, chops: 0, catches: 0, tilt: 0, walk: 0, cheerT: 0, bot: !!r.bot,
    think: 0, goal: null, path: null, actCd: 0 };
}
function readInput(p: Loose): Input {
  const c = p.r.ctl, inp = { mx: 0, my: 0, grab: false, useHeld: false, usePressed: false };
  if (c.kind === 'keys') {
    inp.mx = (down.has(c.r) ? 1 : 0) - (down.has(c.l) ? 1 : 0);
    inp.my = (down.has(c.d) ? 1 : 0) - (down.has(c.u) ? 1 : 0);
    inp.grab = hit.has(c.grab); inp.useHeld = down.has(c.use); inp.usePressed = hit.has(c.use);
  } else if (c.kind === 'phone') {
    inp.mx = c.mx; inp.my = c.my; inp.useHeld = c.use;
    inp.grab = c.grabN > c.grabSeen; c.grabSeen = c.grabN;
    inp.usePressed = c.useN > c.useSeen; c.useSeen = c.useN;
  } else {
    const gp = padsNow[c.index];
    if (gp) {
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) < 0.25) { ax = 0; ay = 0; }
      ax += (padBtn(gp, 15) ? 1 : 0) - (padBtn(gp, 14) ? 1 : 0);
      ay += (padBtn(gp, 13) ? 1 : 0) - (padBtn(gp, 12) ? 1 : 0);
      inp.mx = ax; inp.my = ay;
      inp.grab = padEdge(c.index, 0); inp.useHeld = padBtn(gp, 2); inp.usePressed = padEdge(c.index, 2);
    }
  }
  const m = Math.hypot(inp.mx, inp.my);
  if (m > 1) { inp.mx /= m; inp.my /= m; }
  return inp;
}

// ---- Phones: a PeerJS room that controller.html joins from a QR code ---------------------
// The game hosts; each phone opens a data channel and streams its stick and buttons. Presses
// arrive as running counts, so a lost or late packet never loses or repeats a press.
// ?phones=0 turns this off. ?ctl=http://192.168.1.10:8000 points the QR at another origin
// (use it when the game itself is open on localhost, which a phone cannot reach).
const ROOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const net: { peer: Peer | null; id: string; url: string; status: string; error: string; qr: QRCode | null; start: boolean; cheer: boolean; scene: string } =
  { peer: null, id: '', url: '', status: 'off', error: '', qr: null, start: false, cheer: false, scene: '' };
const phones = new Map<string, Loose>(); // phone's client id -> controller; survives a dropped connection
function roomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return 'ssg-' + Array.from(b, x => ROOM_CHARS[x % ROOM_CHARS.length]).join('');
}
function controllerUrl(id: string): string {
  const u = new URL('controller.html', location.href);
  if (params.get('ctl')) { const o = new URL(params.get('ctl')!); u.protocol = o.protocol; u.host = o.host; }
  u.search = ''; u.hash = ''; u.searchParams.set('room', id);
  return u.href;
}
function openRoom(): void {
  if (params.get('phones') === '0') return;
  net.id = roomId(); net.url = controllerUrl(net.id); net.status = 'connecting';
  const q = qrcode(0, 'M'); q.addData(net.url); q.make(); net.qr = q;
  const peer = new Peer(net.id, { debug: 1 });
  net.peer = peer;
  peer.on('open', () => { net.status = 'open'; events.push({ type: 'room', id: net.id, url: net.url }); });
  peer.on('connection', acceptPhone);
  peer.on('disconnected', () => { if (!peer.destroyed) { net.status = 'connecting'; setTimeout(() => peer.disconnected && !peer.destroyed && peer.reconnect(), 1500); } });
  peer.on('error', err => {
    if (err.type === 'unavailable-id') { peer.destroy(); openRoom(); return; } // room name taken: pick another
    if (err.type === 'peer-unavailable') return;
    net.status = 'error'; net.error = err.type; console.warn('phones:', err.type, err);
  });
}
function sendTo(ctl: Loose, msg: unknown): void { if (ctl.conn && ctl.conn.open) ctl.conn.send(msg); }
function broadcast(msg: unknown): void { for (const c of phones.values()) sendTo(c, msg); }
function acceptPhone(conn: Loose): void {
  conn.on('data', (msg: Loose) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const cid = String(msg.id || conn.peer).slice(0, 40);
      let ctl = phones.get(cid);
      if (!ctl) {
        if (roster.length >= 4) { conn.send({ t: 'full' }); return; }
        ctl = { kind: 'phone', cid, mx: 0, my: 0, use: false, grabN: 0, useN: 0, grabSeen: 0, useSeen: 0, conn: null };
        phones.set(cid, ctl);
      }
      if (ctl.conn && ctl.conn !== conn) ctl.conn.close();
      ctl.conn = conn; conn.ctl = ctl;
      ctl.grabN = ctl.grabSeen = msg.g | 0; ctl.useN = ctl.useSeen = msg.u | 0; // a reloaded phone counts from 0 again
      if (!roster.some(r => r.ctl === ctl)) join(ctl);
      const r = roster.find(r => r.ctl === ctl);
      conn.send({ t: 'you', name: r.name, color: COLORS[r.i].suit, scene, gravity: !state.g || state.g.on });
      events.push({ type: 'phone', name: r.name });
      return;
    }
    const c = conn.ctl;
    if (!c || c.conn !== conn) return;
    if (msg.t === 'in') {
      const cl = (v: Loose) => Math.max(-1, Math.min(1, Number(v) || 0));
      c.mx = cl(msg.mx); c.my = cl(msg.my); c.use = !!msg.hold;
      if ((msg.g | 0) > c.grabN) c.grabN = msg.g | 0;
      if ((msg.u | 0) > c.useN) c.useN = msg.u | 0;
    } else if (msg.t === 'start') net.start = true;
    else if (msg.t === 'cheer') net.cheer = true;
  });
  conn.on('close', () => { const c = conn.ctl; if (c && c.conn === conn) { c.conn = null; c.mx = c.my = 0; c.use = false; } });
  conn.on('error', (e: Loose) => console.warn('phone link:', e));
}
function drawQr(q: QRCode, x: number, y: number, size: number): number { // white card with a quiet zone, modules snapped to whole pixels
  const n = q.getModuleCount(), cell = Math.max(1, Math.floor(size / (n + 4))), s = cell * (n + 4);
  ctx.fillStyle = '#ffffff'; rrect(x, y, s, s, 8); ctx.fill();
  ctx.fillStyle = '#0b0f1a';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, cell, cell);
  return s;
}
function roomLabel(): string {
  return net.status === 'open' ? `room ${net.id.slice(4)}` : net.status === 'connecting' ? 'opening room…' : `phones offline (${net.error || 'no network'})`;
}

// ---- Items ------------------------------------------------------------------------------
let nextId = 1;
function makeItem(kind: string, x: number, y: number, z = 0): Loose {
  const it = { id: nextId++, kind, chopped: false, chop: 0, soup: null, contents: [], cook: 0, burnt: false,
    x, y, z, vx: 0, vy: 0, vz: 0, at: 'floor', tr: -1, tc: -1, spin: 0, spinV: 0, floated: false, doneSaid: false,
    by: [], bp: 0 };
  state.items.push(it);
  return it;
}
const isIngr = (it: Loose): boolean => CRATE_OF[it.kind] !== undefined;
const tileAt = (r: number, c: number): Loose => (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? state.tiles[r][c] : null;
const solid = (t: Loose): boolean => t && t.type !== '.';
function detach(it: Loose): void {
  if (it.tr >= 0) { const t = tileAt(it.tr, it.tc); if (t && t.item === it) t.item = null; }
  it.tr = it.tc = -1;
}
function removeItem(it: Loose): void {
  detach(it);
  const i = state.items.indexOf(it); if (i >= 0) state.items.splice(i, 1);
  state.players.forEach((p: Loose) => { if (p.held === it) p.held = null; });
}
function placeOnTile(it: Loose, t: Loose): void {
  detach(it); t.item = it; it.at = 'counter'; it.tr = t.r; it.tc = t.c;
  it.x = t.c + 0.5; it.y = t.r + 0.5; it.z = CH; it.vx = it.vy = it.vz = 0; it.spin = 0; it.bp = 0;
}
function canPlace(t: Loose, it: Loose): boolean {
  if (!t || t.item) return false;
  if (t.type === '#' || isBelt(t)) return true;
  if (t.type === 'B') return isIngr(it);
  if (t.type === 'S') return it.kind === 'pot';
  return false;
}
function setAir(it: Loose, vx: number, vy: number, vz: number): void {
  detach(it); it.at = 'air'; it.vx = vx; it.vy = vy; it.vz = vz; it.spinV = (rng() * 2 - 1) * 3;
}
function potDone(pot: Loose): boolean { return isPotDone(pot.contents.length, pot.cook, pot.burnt, tune.pot_size, tune.cook_time); }
function soupOf(pot: Loose): SoupType { return soupOfContents(pot.contents); }
function credit(it: Loose, ...names: (string | null | undefined)[]): void { for (const n of names) if (n && !it.by.includes(n)) it.by.push(n); }
function addToPot(pot: Loose, ing: Loose, p: Loose): boolean {
  if (pot.burnt || pot.contents.length >= tune.pot_size || !ing.chopped) return false;
  pot.contents.push(ing.kind); pot.cook = 0; pot.doneSaid = false; credit(pot, ...ing.by, p && p.r.name);
  removeItem(ing); sfx.plop();
  return true;
}
function fillBowl(bowl: Loose, pot: Loose, p: Loose): void {
  bowl.soup = soupOf(pot); credit(bowl, ...pot.by, p && p.r.name); pot.by = [];
  pot.contents = []; pot.cook = 0; pot.doneSaid = false; sfx.pick();
}
function trashItem(it: Loose): boolean { // returns true if the item is gone
  if (it.kind === 'pot') { it.contents = []; it.cook = 0; it.burnt = false; it.doneSaid = false; it.by = []; sweep(400, 80, 0.3, 'sine', 0.2); return false; }
  if (it.kind === 'bowl' && it.soup) { it.soup = null; it.by = []; sweep(400, 80, 0.3, 'sine', 0.2); return false; }
  removeItem(it); sweep(400, 80, 0.3, 'sine', 0.2); return true;
}
function toFloorNear(it: Loose): void { // an item that cannot rest on a counter slides off to the nearest floor
  let best = null, bd = 1e9;
  const r0 = Math.floor(it.y), c0 = Math.floor(it.x);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const t = tileAt(r0 + dr, c0 + dc); if (!t || solid(t)) continue;
    const px = Math.min(Math.max(it.x, t.c + 0.15), t.c + 0.85), py = Math.min(Math.max(it.y, t.r + 0.15), t.r + 0.85);
    const d = Math.hypot(px - it.x, py - it.y); if (d < bd) { bd = d; best = [px, py]; }
  }
  if (!best) best = [7.5, 6.5];
  detach(it); it.x = best[0]; it.y = best[1]; it.vx = it.vy = 0; it.at = 'air'; if (it.vz > 0) it.vz = 0;
}

// ---- Orders, scoring ----------------------------------------------------------------------
function addOrder(type?: string): void {
  if (!type) type = level.soups[Math.floor(rng() * level.soups.length)];
  state.orders.push({ id: state.orderN++, type, t: tune.order_patience, max: tune.order_patience, born: state.t });
}
function deliver(bowl: Loose, p: Loose): boolean {
  const matches = state.orders.filter((o: Loose) => o.type === bowl.soup);
  if (!matches.length) return false;
  const o = matches.reduce((a: Loose, b: Loose) => (a.t < b.t ? a : b));
  state.orders.splice(state.orders.indexOf(o), 1);
  const pts = deliveryPoints(tune.points_base, tune.tip_max, o.t, o.max);
  state.score += pts; state.delivered++;
  if (p) p.delivered++; else state.spaceDeliveries++;
  credit(bowl, p && p.r.name); // shared credit: everyone who chopped, cooked, plated or served it
  for (const pl of state.players) if (bowl.by.includes(pl.r.name)) pl.helped++;
  popup(14.5, 4.6, p ? `+${pts}` : `+${pts} SPACE DELIVERY!`, '#ffe066');
  removeItem(bowl); sfx.serve();
  events.push({ type: 'deliver', soup: bowl.soup, pts, by: p ? p.r.name : 'space' });
  return true;
}
function popup(x: number, y: number, s: string, color: string): void { state.popups.push({ x, y, s, color, t: 0 }); }

// ---- Scenes ---------------------------------------------------------------------------
let scene: string, state: Loose;
function reset(): void {
  setSeed(seedFrom(CONFIG.seed) + LV * 1000);
  nextId = 1;
  level = LEVELS[LV]; MAP = level.map; ROWS = MAP.length; COLS = MAP[0].length; X0 = (W - COLS * TS) / 2;
  state = {
    t: 0, score: 0, gained: '', items: [], tiles: [], players: [], orders: [], orderN: 0,
    nextOrder: 10, delivered: 0, missed: 0, drops: 0, spaceDeliveries: 0, catches: 0, lost: 0, popups: [],
    g: { on: true, warn: false, next: LT('first_zero_g'), end: 0, beep: 0, failures: 0 },
    shake: 0, flash: 0, stars: 0, ended: false, unlockedNow: false, newBest: false,
    intakeT: 1, intakeFlash: 0, intakeOut: null, vent: null, respawns: [], dark: 0,
  };
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push({ r, c, type: MAP[r][c], item: null, stand: false });
    state.tiles.push(row);
  }
  for (const t of state.tiles.flat()) {
    if (solid(t)) t.stand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const n = tileAt(t.r + dr, t.c + dc); return n && !solid(n); });
    if (t.type === 'I') state.intakeOut = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => tileAt(t.r + dr, t.c + dc)).find(isBelt) || null;
    if (t.type === 'V') state.vent = { x: t.c + 0.5, y: t.r + 0.5, t };
  }
  state.tiles.flat().filter((t: Loose) => t.type === 'S').forEach((t: Loose) => placeOnTile(makeItem('pot', 0, 0), t));
  state.players = roster.map(makePlayer);
  if (roster.length === 1 && tune.bot_partner >= 1) state.players.push(makePlayer({ i: 4, ctl: { kind: 'bot' }, name: 'BOLT', bot: true }));
  addOrder('red');
}
function startShift(i: number): void { LV = i; reset(); scene = 'play'; events.push({ type: 'shift', shift: i + 1 }); }

function facingTile(p: Loose): Loose {
  const ax = Math.abs(p.fx) >= Math.abs(p.fy);
  const px = p.x + (ax ? Math.sign(p.fx) * 0.72 : 0), py = p.y + (ax ? 0 : Math.sign(p.fy) * 0.72);
  return tileAt(Math.floor(py), Math.floor(px));
}
function looseNear(p: Loose, filter?: (it: Loose) => boolean): Loose {
  let best = null, bd = tune.reach;
  for (const it of state.items) {
    if (it.at !== 'floor' && it.at !== 'air') continue;
    if (filter && !filter(it)) continue;
    const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy);
    if (d > bd) continue;
    if (d > 0.5 && (dx * p.fx + dy * p.fy) / d < -0.3) continue; // mostly in front
    best = it; bd = d;
  }
  return best;
}
function hold(p: Loose, it: Loose): void {
  if (it.at === 'air' && !state.g.on) { p.catches++; state.catches++; popup(it.x, it.y - 0.3, 'catch!', '#9fe8ff'); }
  if (isIngr(it) || it.kind === 'bowl') credit(it, p.r.name);
  detach(it); it.at = 'held'; it.vx = it.vy = it.vz = 0; it.spin = 0; p.held = it; sfx.pick();
}
function combine(held: Loose, other: Loose, p: Loose): boolean { // held item meets another item: true if something happened
  if (other.kind === 'pot' && isIngr(held)) return addToPot(other, held, p);
  if (held.kind === 'pot' && isIngr(other)) return addToPot(held, other, p);
  if (other.kind === 'pot' && held.kind === 'bowl' && !held.soup && potDone(other)) { fillBowl(held, other, p); return true; }
  if (held.kind === 'pot' && other.kind === 'bowl' && !other.soup && potDone(held)) { fillBowl(other, held, p); return true; }
  return false;
}
function interact(p: Loose, T: Loose): void {
  const zeroG = !state.g.on;
  if (p.held) {
    const it = p.held;
    if (solid(T)) {
      if (T.type === 'X') { if (trashItem(it)) p.held = null; return; }
      if (T.type === 'H') { if (!(it.kind === 'bowl' && it.soup && deliver(it, p))) sfx.buzz(); return; }
      if (T.item) { if (!combine(it, T.item, p)) sfx.buzz(); return; }
      if (canPlace(T, it)) {
        p.held = null; placeOnTile(it, T); sfx.place();
        if (zeroG) { const a = rng() * Math.PI * 2; setAir(it, Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.5); it.floated = true; }
        return;
      }
      sfx.buzz(); return;
    }
    const near = looseNear(p, o => o !== it && (o.kind === 'pot' || (it.kind === 'pot' && (isIngr(o) || o.kind === 'bowl'))));
    if (near && combine(it, near, p)) return;
    // throw
    p.held = null;
    it.x = p.x + p.fx * 0.4; it.y = p.y + p.fy * 0.4; it.z = 0.7 + p.z;
    const s = tune.toss_speed;
    if (zeroG) { setAir(it, p.vx + p.fx * s, p.vy + p.fy * s, 0); it.floated = true; }
    else setAir(it, p.fx * s, p.fy * s, 3);
    sfx.toss(); events.push({ type: 'toss', kind: it.kind });
    return;
  }
  const near = looseNear(p);
  if (near) { hold(p, near); return; }
  if (!T) return;
  if (T.item) { hold(p, T.item); return; }
  if (CRATES[T.type] || T.type === 'W') {
    const it = makeItem(CRATES[T.type] ? CRATES[T.type].kind : 'bowl', p.x, p.y);
    it.at = 'held'; p.held = it; sfx.pick();
  }
}

function startZeroG(): void {
  const g = state.g;
  g.on = false; g.warn = false; g.end = state.t + LT('zero_g_duration'); g.failures++;
  state.shake = 0.5; state.flash = 1;
  for (const it of state.items) {
    if (it.at === 'counter' || it.at === 'floor') {
      const a = rng() * Math.PI * 2, s = tune.float_kick * (0.4 + rng() * 0.8);
      setAir(it, Math.cos(a) * s, Math.sin(a) * s, 0.6 + rng()); it.floated = true;
    }
  }
  for (const p of state.players) { p.vx += (rng() * 2 - 1) * 0.8; p.vy += (rng() * 2 - 1) * 0.8; }
  sfx.gravOff(); events.push({ type: 'zero-g', t: state.t }); broadcast({ t: 'grav', on: false });
}
function endZeroG(): void {
  const g = state.g;
  g.on = true; g.next = state.t + LT('zero_g_interval') + (rng() * 2 - 1) * tune.zero_g_jitter;
  state.shake = 0.35; sfx.gravOn(); events.push({ type: 'gravity', t: state.t }); broadcast({ t: 'grav', on: true });
}

function collideTiles(o: Loose, rad: number, bounce: number): void {
  const r0 = Math.floor(o.y) - 1, c0 = Math.floor(o.x) - 1;
  for (let r = r0; r <= r0 + 2; r++) for (let c = c0; c <= c0 + 2; c++) {
    const t = tileAt(r, c);
    if (t && !solid(t)) continue;
    const cx = Math.min(Math.max(o.x, c), c + 1), cy = Math.min(Math.max(o.y, r), r + 1);
    let dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d >= rad) continue;
    if (d < 1e-6) { dx = 0; dy = -1; d = 1e-6; }
    const nx = dx / d, ny = dy / d;
    o.x += nx * (rad - d); o.y += ny * (rad - d);
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= (1 + bounce) * vn * nx; o.vy -= (1 + bounce) * vn * ny; if (bounce > 0.3 && vn < -1.5) sfx.land(); }
  }
}

function updatePlayer(p: Loose, dt: number): void {
  const inp = p.bot ? botControl(p, dt) : readInput(p), zeroG = !state.g.on;
  const m = Math.hypot(inp.mx, inp.my);
  if (m > 0.2) { p.fx = inp.mx / m; p.fy = inp.my / m; }
  const T = facingTile(p);
  p.target = T;
  const canChop = !p.held && T && T.type === 'B' && T.item && isIngr(T.item) && !T.item.chopped && !zeroG;
  p.chopping = false;
  if (canChop && inp.useHeld) {
    const it = T.item, before = it.chop;
    it.chop += dt / tune.chop_time; p.chopping = true;
    if (Math.floor(before * 5) !== Math.floor(it.chop * 5)) { sfx.chop(); p.chops++; }
    credit(it, p.r.name);
    if (it.chop >= 1) { it.chop = 1; it.chopped = true; sfx.chopped(); }
  } else if (inp.usePressed && p.dashCd <= 0) {
    if (zeroG) { p.vx += p.fx * tune.dash_speed * 0.6; p.vy += p.fy * tune.dash_speed * 0.6; p.dashT = 0.35; }
    else { p.vx = p.fx * tune.dash_speed; p.vy = p.fy * tune.dash_speed; p.dashT = 0.12; }
    p.dashCd = tune.dash_cooldown; sfx.dash();
  }
  if (inp.grab) interact(p, T);

  p.dashT -= dt; p.dashCd -= dt; p.cheerT = Math.max(0, p.cheerT - dt);
  if (!zeroG) {
    p.z += (0 - p.z) * Math.min(1, 12 * dt); p.tilt *= 0.85;
    if (p.dashT <= 0) {
      const sp = tune.cook_speed * (p.bot ? tune.bot_speed : 1), tx = inp.mx * sp, ty = inp.my * sp;
      let dx = tx - p.vx, dy = ty - p.vy; const d = Math.hypot(dx, dy), mx = tune.cook_accel * dt;
      if (d > mx) { dx *= mx / d; dy *= mx / d; }
      p.vx += dx; p.vy += dy;
    }
  } else {
    p.vx += inp.mx * tune.zero_g_thrust * dt; p.vy += inp.my * tune.zero_g_thrust * dt;
    if (level.breach && state.vent) { // the breach tugs at drifting cooks too
      const dx = state.vent.x - p.x, dy = state.vent.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.vx += dx / d * tune.breach_pull_cook * dt; p.vy += dy / d * tune.breach_pull_cook * dt;
    }
    const k = Math.max(0, 1 - tune.zero_g_drag * dt); p.vx *= k; p.vy *= k;
    const s = Math.hypot(p.vx, p.vy);
    if (p.dashT <= 0 && s > tune.zero_g_max) { p.vx *= tune.zero_g_max / s; p.vy *= tune.zero_g_max / s; }
    p.z += (0.32 + 0.08 * Math.sin(state.t * 2.2 + p.r.i * 1.7) - p.z) * Math.min(1, 3 * dt);
    p.tilt += (p.vx * 0.06 - p.tilt) * Math.min(1, 4 * dt);
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.walk += Math.hypot(p.vx, p.vy) * dt;
  collideTiles(p, R, zeroG ? tune.wall_bounce : 0);
}

// ---- BOLT, the bot partner ---------------------------------------------------------------
// A prep cook: fetches whatever floats off, chops, keeps the pots fed for the open orders, and
// plates a finished soup only after it has sat a moment (so a person gets there first). It holds
// on to what it carries while gravity is off, and it is pushed aside by people, never the reverse.
function wantedTypes(): SoupType[] { // open orders not already covered by a full pot or a filled bowl
  const types = state.orders.slice().sort((a: Loose, b: Loose) => a.t - b.t).map((o: Loose) => o.type);
  const take = (ty: Loose) => { const i = types.indexOf(ty); if (i >= 0) types.splice(i, 1); };
  for (const it of state.items) {
    if (it.kind === 'pot' && !it.burnt && it.contents.length >= tune.pot_size) take(soupOf(it));
    if (it.kind === 'bowl' && it.soup) take(it.soup);
  }
  return types;
}
function potPlan(): { pot: Loose; type: SoupType; lack: string[] }[] { // each pot that is not full, with the soup it should become and what it lacks
  const types = wantedTypes(), plans = [];
  const pots = state.items.filter((it: Loose) => it.kind === 'pot' && it.at === 'counter' && !it.burnt && it.contents.length < tune.pot_size)
    .sort((a: Loose, b: Loose) => b.contents.length - a.contents.length);
  for (const pot of pots) {
    const i = types.findIndex(ty => fitsRecipe(SOUPS[ty].recipe, pot.contents));
    if (i < 0) continue;
    const ty = types.splice(i, 1)[0], lack = SOUPS[ty].recipe.slice();
    for (const k of pot.contents) lack.splice(lack.indexOf(k), 1);
    plans.push({ pot, type: ty, lack });
  }
  return plans;
}
function neededKinds(): string[] {
  const need = potPlan().flatMap(pl => pl.lack);
  const inFlight = state.items.filter((it: Loose) => isIngr(it) && ((it.at === 'counter' && tileAt(it.tr, it.tc).type === 'B') || (it.at === 'held' && !state.players.some((p: Loose) => p.bot && p.held === it))));
  for (const it of inFlight) { const i = need.indexOf(it.kind); if (i >= 0) need.splice(i, 1); }
  return need;
}
function nearestTile(p: Loose, f: (t: Loose) => boolean): Loose {
  let best = null, bd = 1e9;
  for (const t of state.tiles.flat()) {
    if (!t.stand || !f(t)) continue;
    const d = (t.c + 0.5 - p.x) ** 2 + (t.r + 0.5 - p.y) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
const heldBy = (it: Loose): boolean => state.players.some((p: Loose) => p.held === it);
function botDecide(p: Loose): Loose {
  const zg = !state.g.on, H = p.held;
  const tileGoal = (t: Loose, act: Loose) => (t ? { t, act } : null);
  if (H) {
    if (zg) return null; // keep it safe until gravity is back
    if (isIngr(H)) {
      if (!H.chopped) return tileGoal(nearestTile(p, t => t.type === 'B' && !t.item), 'place');
      const plan = potPlan().find(pl => pl.lack.includes(H.kind));
      if (plan) return tileGoal(tileAt(plan.pot.tr, plan.pot.tc), 'place');
      return tileGoal(nearestTile(p, t => t.type === '#' && !t.item), 'place');
    }
    if (H.kind === 'bowl') {
      if (H.soup) return tileGoal(nearestTile(p, t => t.type === (state.orders.some((o: Loose) => o.type === H.soup) ? 'H' : 'X')), 'place');
      const dp = state.items.find((it: Loose) => it.kind === 'pot' && it.at === 'counter' && potDone(it));
      return tileGoal(dp ? tileAt(dp.tr, dp.tc) : nearestTile(p, t => t.type === '#' && !t.item), 'place');
    }
    if (H.kind === 'pot') {
      if (H.burnt) return tileGoal(nearestTile(p, t => t.type === 'X'), 'place');
      return tileGoal(nearestTile(p, t => (t.type === 'S' || t.type === '#') && !t.item && (t.type === 'S' || !state.tiles.flat().some((s: Loose) => s.type === 'S' && !s.item))), 'place');
    }
    return null;
  }
  // empty-handed: first fetch what matters that is loose (floating, or knocked to the floor):
  // pots, soups, and the ingredients the pots need; the rest is left for the trash
  const need = neededKinds();
  let best = null, bd = 1e9;
  for (const it of state.items) {
    if ((it.at !== 'air' && it.at !== 'floor') || heldBy(it)) continue;
    if (!(it.kind === 'pot' || (it.kind === 'bowl' && it.soup) || (isIngr(it) && need.includes(it.kind)))) continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y) - (it.kind === 'pot' ? 2 : 0);
    if (d < bd) { bd = d; best = it; }
  }
  if (best) return { it: best };
  if (zg) return null;
  const burnt = nearestTile(p, t => t.item && t.item.kind === 'pot' && t.item.burnt);
  if (burnt) return tileGoal(burnt, 'grab');
  const ready = state.items.some((it: Loose) => it.kind === 'pot' && it.at === 'counter' && potDone(it) && it.cook - tune.cook_time >= tune.bot_serve_delay);
  if (ready) {
    const bowl = nearestTile(p, t => t.item && t.item.kind === 'bowl' && !t.item.soup);
    return tileGoal(bowl || nearestTile(p, t => t.type === 'W'), 'grab');
  }
  const board = nearestTile(p, t => t.type === 'B' && t.item && isIngr(t.item) && !t.item.chopped);
  if (board) return tileGoal(board, 'chop');
  for (const k of need) {
    const on = (t: Loose, chopped: Loose) => t.item && t.item.kind === k && t.item.chopped === chopped && t.type !== 'B';
    const src = nearestTile(p, t => on(t, true)) || nearestTile(p, t => t.type === 'B' && t.item && t.item.kind === k && t.item.chopped)
      || nearestTile(p, t => on(t, false)) || nearestTile(p, t => t.type === CRATE_OF[k]);
    if (src) return tileGoal(src, 'grab');
  }
  const loosePot = nearestTile(p, t => t.type === '#' && t.item && t.item.kind === 'pot' && state.tiles.flat().some((s: Loose) => s.type === 'S' && !s.item));
  if (loosePot) return tileGoal(loosePot, 'grab');
  return null;
}
function bfs(p: Loose, isGoal: (r: number, c: number) => boolean): Cell[] | null { // over floor tiles from the bot's tile; returns [[r, c], ...] or null
  let sr = Math.floor(p.y), sc = Math.floor(p.x);
  const s0 = tileAt(sr, sc); if (!s0 || solid(s0)) return null;
  const key = (r: number, c: number): number => r * COLS + c, prev = new Map<number, Cell | null>([[key(sr, sc), null]]), q: Cell[] = [[sr, sc]];
  while (q.length) {
    const cur = q.shift()!;
    if (isGoal(cur[0], cur[1])) { const path: Cell[] = []; let n: Cell | null | undefined = cur; while (n) { path.unshift(n); n = prev.get(key(n[0], n[1])); } return path; }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cur[0] + dr, nc = cur[1] + dc, t = tileAt(nr, nc);
      if (!t || solid(t) || prev.has(key(nr, nc))) continue;
      prev.set(key(nr, nc), cur); q.push([nr, nc]);
    }
  }
  return null;
}
function botControl(p: Loose, dt: number): Input {
  const inp = { mx: 0, my: 0, grab: false, useHeld: false, usePressed: false };
  p.think -= dt; p.actCd -= dt;
  if (p.goal && p.goal.it && (heldBy(p.goal.it) || !state.items.includes(p.goal.it))) p.think = 0;
  if (p.think <= 0) {
    p.think = tune.bot_think; p.goal = botDecide(p);
    const g = p.goal;
    if (g && g.t) p.path = bfs(p, (r, c) => Math.abs(r - g.t.r) + Math.abs(c - g.t.c) === 1);
    else if (g && g.it) p.path = bfs(p, (r, c) => Math.hypot(c + 0.5 - g.it.x, r + 0.5 - g.it.y) < 0.95);
    else p.path = null;
    if (g && !p.path) p.goal = null;
  }
  const g = p.goal, zg = !state.g.on;
  const steer = (dx: number, dy: number, slow = 1) => { // move along (dx, dy); in zero-g, thrust to match a gentle drift
    const d = Math.hypot(dx, dy) || 1;
    if (!zg) { inp.mx = dx / d * slow; inp.my = dy / d * slow; return; }
    let ax = (dx / d * 2.4 * slow - p.vx) * 1.2, ay = (dy / d * 2.4 * slow - p.vy) * 1.2;
    const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
    inp.mx = ax; inp.my = ay;
  };
  if (!g || !p.path) return inp;
  // follow the path's tile centres until the last one
  const here = [Math.floor(p.y), Math.floor(p.x)];
  let i = p.path.findIndex((n: Loose) => n[0] === here[0] && n[1] === here[1]);
  if (i < 0) i = 0;
  const atEnd = i >= p.path.length - 1;
  if (g.it) {
    const dx = g.it.x - p.x, dy = g.it.y - p.y, d = Math.hypot(dx, dy);
    if (d < tune.reach * 0.85) { steer(dx, dy, 0.25); if (p.actCd <= 0) { inp.grab = true; p.actCd = 0.35; p.think = 0.05; } return inp; }
    if (atEnd) { steer(dx, dy); return inp; }
  } else if (atEnd) {
    const dx = g.t.c - here[1], dy = g.t.r - here[0];
    // line up with the tile's middle on the other axis, then push toward the counter
    const ox = dx ? 0 : (here[1] + 0.5 - p.x) * 3, oy = dy ? 0 : (here[0] + 0.5 - p.y) * 3;
    steer(dx + ox, dy + oy, 0.6);
    const ft = tileAt(Math.floor(p.y + dy * 0.72), Math.floor(p.x + dx * 0.72));
    if (ft === g.t && Math.hypot(ox, oy) < 0.6) {
      inp.mx = dx; inp.my = dy; // face it squarely
      if (g.act === 'chop') inp.useHeld = true;
      else if (p.actCd <= 0) { inp.grab = true; p.actCd = 0.35; p.think = 0.05; }
    }
    return inp;
  }
  const n = p.path[Math.min(i + 1, p.path.length - 1)];
  steer(n[1] + 0.5 - p.x, n[0] + 0.5 - p.y);
  return inp;
}

function loseItem(it: Loose): void { // pulled out through the hull breach
  if (it.kind === 'pot') state.respawns.push({ t: state.t + tune.pot_respawn });
  removeItem(it); state.lost++; sfx.lost();
  popup(state.vent.x, state.vent.y - 1.2, 'lost to space!', '#ff8a9a');
  events.push({ type: 'lost', kind: it.kind });
}
function updateBelts(dt: number): void {
  if (state.intakeOut) { // the cargo bay drops a crate of something on the belt
    state.intakeT -= dt; state.intakeFlash = Math.max(0, state.intakeFlash - dt);
    if (state.intakeT <= 0) {
      state.intakeT = tune.conveyor_interval;
      const t0 = state.intakeOut;
      if (!t0.item) {
        const kinds = levelKinds(), it = makeItem(kinds[Math.floor(rng() * kinds.length)], 0, 0);
        placeOnTile(it, t0); state.intakeFlash = 0.4; sfx.thunk();
        if (!state.g.on) { setAir(it, 0.8 + rng() * 0.6, (rng() * 2 - 1) * 0.6, 0.6); it.floated = true; }
      }
    }
  }
  for (const it of state.items) {
    if (it.at !== 'counter') continue;
    const t = tileAt(it.tr, it.tc); if (!isBelt(t)) continue;
    const [dx, dy] = DIRS[t.type], n = tileAt(t.r + dy, t.c + dx), go = isBelt(n) && !n.item;
    it.bp = go ? it.bp + dt * tune.conveyor_speed : 0;
    if (it.bp >= 1) { placeOnTile(it, n); continue; }
    it.x = t.c + 0.5 + dx * it.bp; it.y = t.r + 0.5 + dy * it.bp;
  }
}

function updateItem(it: Loose, dt: number): void {
  if (it.at !== 'air') return;
  const zeroG = !state.g.on;
  if (zeroG) {
    const target = tune.float_height + 0.14 * Math.sin(state.t * 1.7 + it.id);
    it.vz += ((target - it.z) * 6 - it.vz * 2.5) * dt;
    const k = Math.max(0, 1 - tune.float_drag * dt); it.vx *= k; it.vy *= k;
    if (level.breach && state.vent) {
      const dx = state.vent.x - it.x, dy = state.vent.y - it.y, d = Math.hypot(dx, dy) || 1e-3;
      if (d < tune.breach_radius) { loseItem(it); return; }
      const a = tune.breach_pull / (0.5 + d * 0.35);
      it.vx += dx / d * a * dt; it.vy += dy / d * a * dt;
    }
  } else {
    it.vz -= tune.fall_gravity * dt;
    const k = Math.max(0, 1 - 0.6 * dt); it.vx *= k; it.vy *= k;
  }
  it.spin += it.spinV * dt;
  it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
  if (it.x < 0.25) { it.x = 0.25; it.vx = Math.abs(it.vx) * 0.8; }
  if (it.x > COLS - 0.25) { it.x = COLS - 0.25; it.vx = -Math.abs(it.vx) * 0.8; }
  if (it.y < 0.25) { it.y = 0.25; it.vy = Math.abs(it.vy) * 0.8; }
  if (it.y > ROWS - 0.25) { it.y = ROWS - 0.25; it.vy = -Math.abs(it.vy) * 0.8; }
  if (zeroG) {
    // floating items bump cooks gently
    for (const p of state.players) {
      const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy);
      if (d < R + 0.15 && d > 1e-4 && it.z < 1.3) { it.vx += dx / d * 0.6; it.vy += dy / d * 0.6; }
    }
    return;
  }
  const t = tileAt(Math.floor(it.y), Math.floor(it.x));
  const surf = solid(t) ? CH : 0;
  if (it.z <= surf && it.vz <= 0) land(it, t);
}
function land(it: Loose, t: Loose): void {
  if (solid(t)) {
    if (t.type === 'H' && it.kind === 'bowl' && it.soup && deliver(it, null)) return;
    if (t.type === 'X') { if (trashItem(it)) return; toFloorNear(it); return; }
    if (t.item && combine(it, t.item, null)) return;
    if (canPlace(t, it)) { placeOnTile(it, t); sfx.land(); it.floated = false; return; }
    toFloorNear(it); return;
  }
  it.at = 'floor'; it.z = 0; it.vx = it.vy = it.vz = 0; it.spin = 0; sfx.land();
  if (it.floated) { state.drops++; it.floated = false; }
}

function updatePlay(dt: number): void {
  state.t += dt;
  const g = state.g;
  // gravity schedule
  if (g.on) {
    g.warn = state.t >= g.next - tune.zero_g_warning;
    if (g.warn && state.t >= g.beep) { sfx.alarm(); g.beep = state.t + 0.5; }
    if (state.t >= g.next) startZeroG();
  } else if (state.t >= g.end) endZeroG();
  // orders
  if (state.t >= state.nextOrder) {
    if (state.orders.length < tune.max_orders) addOrder();
    state.nextOrder = nextOrderAt(state.t, tune.shift_length, LT('order_interval_start'), LT('order_interval_end'));
  }
  if (level.dark) state.dark += ((g.on ? 0 : 1) - state.dark) * Math.min(1, dt * tune.dark_fade); // the blackout
  updateBelts(dt);
  for (const rs of state.respawns.slice()) { // a replacement pot for one lost to space
    if (state.t < rs.t) continue;
    const st = state.tiles.flat().find((t: Loose) => t.type === 'S' && !t.item);
    if (st) { placeOnTile(makeItem('pot', 0, 0), st); state.respawns.splice(state.respawns.indexOf(rs), 1); popup(st.c + 0.5, st.r, 'new pot', '#9fe8ff'); }
    else rs.t = state.t + 1;
  }
  for (const o of state.orders.slice()) {
    o.t -= dt;
    if (o.t <= 0) {
      state.orders.splice(state.orders.indexOf(o), 1);
      state.score = scoreAfterMiss(state.score, tune.missed_penalty); state.missed++;
      popup(7.5, -0.6, `order missed  -${tune.missed_penalty}`, '#ff6b6b'); sfx.missed();
      if (!state.orders.length) state.nextOrder = Math.min(state.nextOrder, state.t + 2);
    }
  }
  for (const p of state.players) updatePlayer(p, dt);
  // cooks bump each other (in zero-g they bounce off)
  for (let i = 0; i < state.players.length; i++) for (let j = i + 1; j < state.players.length; j++) {
    const a = state.players[i], b = state.players[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= 2 * R || d < 1e-6) continue;
    const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
    const ka = a.bot && !b.bot ? 2 : b.bot && !a.bot ? 0 : 1; // BOLT always gives way
    a.x -= nx * push * ka; a.y -= ny * push * ka; b.x += nx * push * (2 - ka); b.y += ny * push * (2 - ka);
    if (!state.g.on) {
      const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
      if (va - vb > 0) { a.vx += (vb - va) * nx; a.vy += (vb - va) * ny; b.vx += (va - vb) * nx; b.vy += (va - vb) * ny; if (va - vb > 1.5) tone(220, 0.06, 'triangle', 0.15); }
    }
  }
  for (const it of state.items.slice()) updateItem(it, dt);
  // held items follow their cook
  for (const p of state.players) if (p.held) { p.held.x = p.x + p.fx * 0.3; p.held.y = p.y + p.fy * 0.3; }
  // pots cook on stoves while gravity holds
  for (const it of state.items) {
    if (it.kind !== 'pot') continue;
    const t = it.at === 'counter' ? tileAt(it.tr, it.tc) : null;
    if (t && t.type === 'S' && g.on && it.contents.length >= tune.pot_size && !it.burnt) {
      it.cook += dt;
      if (!it.doneSaid && it.cook >= tune.cook_time) { it.doneSaid = true; sfx.done(); if (soupOf(it) === 'slop') popup(it.x, it.y - 1, 'space slop!', '#c8b48a'); }
      if (it.cook >= tune.cook_time + tune.burn_time) { it.burnt = true; sfx.burn(); popup(it.x, it.y - 1, 'burnt!', '#ff6b6b'); }
    }
  }
  for (const pp of state.popups) pp.t += dt;
  state.popups = state.popups.filter((pp: Loose) => pp.t < 1.4);
  state.shake = Math.max(0, state.shake - dt); state.flash = Math.max(0, state.flash - dt * 2);
  if (state.t >= tune.shift_length) {
    state.ended = true;
    state.stars = starsFor(state.score, LT('star1'), LT('star2'), LT('star3'));
    state.gained = `${state.stars} star${state.stars === 1 ? '' : 's'}`;
    const wasLocked = LV < LAST && !unlocked(LV + 1);
    state.newBest = state.score > progress.best[LV] && progress.best[LV] > 0;
    progress.stars[LV] = Math.max(progress.stars[LV], state.stars); progress.best[LV] = Math.max(progress.best[LV], state.score);
    saveProgress();
    state.unlockedNow = wasLocked && unlocked(LV + 1);
    if (state.unlockedNow || (LV === LAST && state.stars > 0)) sfx.unlock();
    scene = 'results'; tone(523, 0.2, 'triangle', 0.25); tone(784, 0.3, 'triangle', 0.25, 0.2);
    events.push({ type: 'end', score: state.score, stars: state.stars });
  }
}

// ---- Drawing: figures ---------------------------------------------------------------------
function shadow(x: number, y: number, rx: number, a = 0.35): void { ctx.fillStyle = `rgba(5,8,15,${a})`; ellipse(x, y, rx, rx * 0.4); ctx.fill(); }

function drawTomato(x: number, y: number, chopped: boolean, s = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2);
  if (!chopped) {
    ctx.fillStyle = '#e8473b'; ellipse(0, -11, 12, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9a85'; ellipse(-4, -15, 3.5, 2.5); ctx.fill();
    ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); // star-shaped stalk
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 2.5 : 6; ctx.lineTo(Math.cos(a) * r, -21 + Math.sin(a) * r * 0.6); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#e8473b'; ctx.beginPath(); ctx.ellipse(i * 8, -5, 6, 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3a3'; ctx.beginPath(); ctx.ellipse(i * 8, -5, 3.5, 3.5, 0, Math.PI, 0); ctx.fill();
    }
  }
  ctx.restore();
}
function drawKelp(x: number, y: number, chopped: boolean, s = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2);
  if (!chopped) {
    ctx.fillStyle = '#3aa64a'; ctx.beginPath(); ctx.moveTo(-4, 0);
    ctx.bezierCurveTo(-14, -8, 2, -14, -6, -26); ctx.bezierCurveTo(6, -20, 12, -12, 5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9be38a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(-3, -12, -4, -22); ctx.stroke();
    ctx.fillStyle = '#7ad4ff'; ellipse(6, -18, 2, 2); ctx.fill(); // a glowing pod
  } else {
    for (let i = 0; i < 4; i++) {
      const px = -9 + i * 6, py = -4 - (i % 2) * 4;
      ctx.fillStyle = i % 2 ? '#4fbf5a' : '#3aa64a'; rrect(px - 3, py - 3, 6, 6, 1.5); ctx.fill(); lineStyle(1.5); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawShroom(x: number, y: number, chopped: boolean, s = 1): void { // a moon shroom: a pale stalk under a cratered violet cap
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2);
  if (!chopped) {
    ctx.fillStyle = '#e8e2d4'; rrect(-4, -12, 8, 12, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a7fc4'; ctx.beginPath(); ctx.ellipse(0, -12, 13, 10, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6e58a0'; ellipse(-5, -16, 2.5, 2); ctx.fill(); ellipse(4, -18, 2, 1.6); ctx.fill(); ellipse(6, -14, 1.6, 1.3); ctx.fill();
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#9a7fc4'; ctx.beginPath(); ctx.ellipse(i * 8, -4, 6, 5, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8e2d4'; ctx.fillRect(i * 8 - 1.5, -4, 3, 3);
    }
  }
  ctx.restore();
}
function drawPepper(x: number, y: number, chopped: boolean, s = 1): void { // a sun pepper: a glowing golden pod with a curled stem
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2);
  if (!chopped) {
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(-8, -18); ctx.quadraticCurveTo(-12, -4, 0, 0); ctx.quadraticCurveTo(12, -4, 8, -18); ctx.quadraticCurveTo(0, -22, -8, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff07a'; ellipse(-3, -13, 2.5, 4); ctx.fill();
    ctx.strokeStyle = '#3aa64a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(2, -27, 7, -26); ctx.stroke();
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(i * 8, -5, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff07a'; ellipse(i * 8, -5, 2, 2); ctx.fill();
    }
  }
  ctx.restore();
}
/** Draws any ingredient by its kind. */
function drawIngr(kind: string, x: number, y: number, chopped: boolean, s = 1): void {
  if (kind === 'tomato') drawTomato(x, y, chopped, s);
  else if (kind === 'kelp') drawKelp(x, y, chopped, s);
  else if (kind === 'shroom') drawShroom(x, y, chopped, s);
  else if (kind === 'pepper') drawPepper(x, y, chopped, s);
}
function drawBowl(x: number, y: number, soup: SoupType | null, s = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2);
  ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.ellipse(0, -9, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(-13, 2, 0, 2); ctx.quadraticCurveTo(13, 2, 14, -9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = soup ? SOUPS[soup].color : '#9aa7b8'; ellipse(0, -9, 11, 3.6); ctx.fill();
  if (soup) { ctx.fillStyle = SOUPS[soup].rim; ellipse(-3, -10, 4, 1.4); ctx.fill(); }
  ctx.strokeStyle = '#141824'; ellipse(0, -9, 14, 5); ctx.stroke();
  ctx.fillStyle = '#5ec8ff'; rrect(-14, -8, 28, 2, 1); ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1; // space-age stripe
  ctx.restore();
}
function drawPot(x: number, y: number, pot: Loose, s = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); lineStyle(2.5);
  ctx.fillStyle = '#3b4352'; rrect(-21, -14, 6, 5, 2); ctx.fill(); ctx.stroke(); rrect(15, -14, 6, 5, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pot.burnt ? '#2a2a2a' : '#5b6577';
  ctx.beginPath(); ctx.moveTo(-17, -18); ctx.lineTo(-16, -2); ctx.quadraticCurveTo(0, 4, 16, -2); ctx.lineTo(17, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7d889c'; ctx.fillRect(-16, -12, 32, 3);
  ctx.fillStyle = '#262c38'; ellipse(0, -18, 17, 6); ctx.fill(); ctx.stroke();
  if (pot.contents.length) {
    const col = pot.burnt ? '#1a1a1a' : potDone(pot) ? SOUPS[soupOf(pot)].color : pot.contents.length >= tune.pot_size ? '#c76b4a' : '#8a5a4a';
    ctx.fillStyle = col; ellipse(0, -18, 13, 4); ctx.fill();
    if (pot.cook > 0 && !pot.burnt && pot.contents.length >= tune.pot_size) { // bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 3; i++) { const b = (state.t * 2 + i * 0.33) % 1; ellipse(-7 + i * 7, -19 - b * 6, 1.5 + b * 1.5, 1.5 + b * 1.5); ctx.fill(); }
    }
  }
  if (pot.burnt) { ctx.fillStyle = 'rgba(60,60,60,0.6)'; for (let i = 0; i < 3; i++) { const b = (state.t * 0.8 + i * 0.33) % 1; ellipse(-6 + i * 6 + Math.sin(b * 6) * 3, -26 - b * 22, 4 + b * 5, 4 + b * 5); ctx.fill(); } }
  ctx.restore();
}
function drawItem(it: Loose, x: number, y: number, s = 1): void {
  if (it.spin && it.at === 'air') { ctx.save(); ctx.translate(x, y - 10 * s); ctx.rotate(it.spin); ctx.translate(-x, -(y - 10 * s)); }
  if (isIngr(it)) drawIngr(it.kind, x, y, it.chopped, s);
  else if (it.kind === 'bowl') drawBowl(x, y, it.soup, s);
  else if (it.kind === 'pot') drawPot(x, y, it, s);
  if (it.spin && it.at === 'air') ctx.restore();
}
function drawItemUI(it: Loose, x: number, y: number): void { // bars and contents above items
  if (isIngr(it) && it.chop > 0 && !it.chopped) bar(x, y - 34, it.chop, '#ffd23f');
  if (it.kind === 'pot') {
    const n = tune.pot_size;
    if (it.contents.length && it.contents.length < n || (it.contents.length && it.cook === 0)) {
      for (let i = 0; i < n; i++) {
        const cx = x + (i - (n - 1) / 2) * 20, cy = y - 46;
        ctx.fillStyle = 'rgba(16,20,31,0.75)'; ellipse(cx, cy - 8, 10, 10); ctx.fill();
        const k = it.contents[i];
        if (k) drawIngr(k, cx, cy + 2, true, 0.55);
        else { ctx.strokeStyle = '#6b7690'; ctx.lineWidth = 1.5; ellipse(cx, cy - 8, 6, 6); ctx.stroke(); }
      }
    }
    if (it.contents.length >= n && !it.burnt) {
      if (it.cook < tune.cook_time) bar(x, y - 36, it.cook / tune.cook_time, '#5be37a');
      else {
        const over = (it.cook - tune.cook_time) / tune.burn_time;
        if (over > 0.45 && Math.floor(state.t * (over > 0.75 ? 8 : 4)) % 2) { textOutlined('!', x, y - 50, 30, '#ff5a3d'); }
        else { ctx.fillStyle = '#5be37a'; ellipse(x, y - 44, 10, 10); ctx.fill(); lineStyle(2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 5, y - 44); ctx.lineTo(x - 1, y - 40); ctx.lineTo(x + 6, y - 48); ctx.stroke(); }
      }
    }
  }
}
function bar(x: number, y: number, k: number, col: string): void {
  ctx.fillStyle = '#10141f'; rrect(x - 22, y - 5, 44, 10, 5); ctx.fill();
  ctx.fillStyle = col; rrect(x - 20, y - 3, 40 * Math.min(1, k), 6, 3); ctx.fill();
}

function drawCook(p: Loose, x: number, y: number, z: number, i: number, s = 1): void {
  const col = COLORS[i], up = p.fy < -0.5 && Math.abs(p.fx) < 0.7;
  const cheer = p.cheerT > 0, hop = cheer ? Math.abs(Math.sin(p.cheerT * 9)) * 14 : 0;
  const lift = z * TZ + hop, bob = Math.abs(Math.sin(p.walk * 4)) * (z > 0.05 ? 0 : 3);
  shadow(x, y, 22 * s, z > 0.05 ? 0.22 : 0.38);
  ctx.save(); ctx.translate(x, y - lift - bob); ctx.scale(s, s); ctx.rotate(p.tilt || 0);
  const hx = p.fx * 16, hy = -18 + p.fy * 5;
  const drawHeld = () => { if (p.held) { drawItem(p.held, hx, hy + 8, 0.95); } };
  if (up) drawHeld();
  lineStyle(2.5);
  // boots
  const step = Math.sin(p.walk * 8) * (z > 0.05 ? 0 : 3);
  ctx.fillStyle = '#2a3142'; rrect(-12, -8 + step * 0.3, 10, 9, 3); ctx.fill(); ctx.stroke(); rrect(2, -8 - step * 0.3, 10, 9, 3); ctx.fill(); ctx.stroke();
  // suit body
  ctx.fillStyle = col.suit; rrect(-17, -38, 34, 32, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col.dark; ctx.fillRect(-16, -18, 32, 5);
  if (!up) { // apron + badge
    ctx.fillStyle = '#f4f1ea'; rrect(-10, -30, 20, 22, 5); ctx.fill(); lineStyle(1.5); ctx.stroke();
    ctx.fillStyle = col.suit; ellipse(0, -22, 3, 3); ctx.fill();
  } else { ctx.fillStyle = '#9aa7b8'; rrect(-10, -34, 20, 20, 4); ctx.fill(); lineStyle(1.5); ctx.stroke(); ctx.fillStyle = '#5ec8ff'; ctx.fillRect(-6, -30, 12, 3); } // oxygen pack
  lineStyle(2.5);
  // arms
  ctx.fillStyle = col.suit;
  if (cheer) { rrect(-25, -64, 8, 22, 4); ctx.fill(); ctx.stroke(); rrect(17, -64, 8, 22, 4); ctx.fill(); ctx.stroke(); }
  else if (p.held || p.chopping) { const ay = p.chopping ? Math.sin(state.t * 30) * 4 : 0; rrect(hx - 16, -34 + ay, 9, 14, 4); ctx.fill(); ctx.stroke(); rrect(hx + 7, -34 + ay, 9, 14, 4); ctx.fill(); ctx.stroke(); }
  else { rrect(-23, -34, 8, 18, 4); ctx.fill(); ctx.stroke(); rrect(15, -34, 8, 18, 4); ctx.fill(); ctx.stroke(); }
  // helmet dome with head
  ctx.fillStyle = '#f2c9a0'; ellipse(0, -52, 13, 12); ctx.fill();
  if (!up) {
    ctx.fillStyle = '#141824'; const ex = p.fx * 4;
    ellipse(-5 + ex, -53, 2.2, 3); ctx.fill(); ellipse(5 + ex, -53, 2.2, 3); ctx.fill();
    ctx.fillStyle = 'rgba(232,90,90,0.4)'; ellipse(-8 + ex, -48, 3, 2); ctx.fill(); ellipse(8 + ex, -48, 3, 2); ctx.fill();
  } else { ctx.fillStyle = '#6b4a35'; ellipse(0, -55, 12, 9); ctx.fill(); }
  ctx.fillStyle = 'rgba(170,225,255,0.28)'; ellipse(0, -52, 18, 17); ctx.fill();
  lineStyle(2.5); ellipse(0, -52, 18, 17); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-8, -60, 4, 6, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col.dark; rrect(-15, -40, 30, 5, 2); ctx.fill(); lineStyle(2); ctx.stroke(); // helmet ring
  // chef hat on top of the dome
  lineStyle(2.2); ctx.fillStyle = '#ffffff';
  ellipse(-6, -76, 7, 6); ctx.fill(); ctx.stroke(); ellipse(6, -76, 7, 6); ctx.fill(); ctx.stroke(); ellipse(0, -80, 8, 7); ctx.fill(); ctx.stroke();
  rrect(-9, -74, 18, 6, 2); ctx.fill(); ctx.stroke();
  if (!up) drawHeld();
  ctx.restore();
  if (cheer) drawSparkles(x, y - lift - 96, p.cheerT);
  if (s === 1) textOutlined(p.r ? p.r.name : '', x, y - lift - 100, 15, col.suit);
}
function starPath(x: number, y: number, ro: number, ri: number): void { ctx.beginPath(); for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5 - Math.PI / 2, r = j % 2 ? ri : ro; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
function drawSparkles(x: number, y: number, t: number): void {
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + t * 4, r = 16 + (1 - t / tune.cheer_time) * 18;
    ctx.fillStyle = ['#ffe066', '#9fe8ff', '#ff9ad5'][k]; starPath(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 6, 2.5); ctx.fill();
  }
}
// BOLT: a hover robot with a screen face, so it never reads as one of the suited cooks.
function drawBot(p: Loose, x: number, y: number, z: number, s = 1): void {
  const col = COLORS[4], up = p.fy < -0.5 && Math.abs(p.fx) < 0.7, cheer = p.cheerT > 0;
  const hover = 6 + Math.sin((state ? state.t : 0) * 5) * 2, lift = z * TZ + hover + (cheer ? Math.abs(Math.sin(p.cheerT * 9)) * 12 : 0);
  shadow(x, y, 20 * s, 0.32);
  ctx.save(); ctx.translate(x, y - lift); ctx.scale(s, s); ctx.rotate(p.tilt || 0);
  const hx = p.fx * 18, hy = -16 + p.fy * 5;
  const drawHeld = () => { if (p.held) drawItem(p.held, hx, hy + 8, 0.95); };
  if (up) drawHeld();
  // thruster glow and hover skirt
  const gl = ctx.createRadialGradient(0, 4, 2, 0, 4, 22); gl.addColorStop(0, 'rgba(94,200,255,0.8)'); gl.addColorStop(1, 'rgba(94,200,255,0)');
  ctx.fillStyle = gl; ellipse(0, 6, 22, 10); ctx.fill();
  lineStyle(2.5); ctx.fillStyle = '#3b4352'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(14, -6); ctx.lineTo(9, 2); ctx.lineTo(-9, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  // body: a rounded barrel with a yellow hazard band
  ctx.fillStyle = col.suit; rrect(-16, -36, 32, 31, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-15, -16, 30, 5);
  ctx.fillStyle = '#141824'; for (let i = 0; i < 4; i++) ctx.fillRect(-13 + i * 8, -16, 3, 5);
  if (!up) { ctx.fillStyle = '#2a3142'; rrect(-8, -31, 16, 11, 3); ctx.fill(); ctx.fillStyle = '#5be37a'; ctx.fillRect(-5, -27, 4, 3); ctx.fillStyle = '#ff5a3d'; ctx.fillRect(2, -27, 4, 3); }
  // arms: thin rods with claw hands
  lineStyle(2.5); ctx.strokeStyle = '#141824';
  const arm = (sx0: number, ex: number, ey: number) => { ctx.lineWidth = 5; ctx.strokeStyle = '#141824'; ctx.beginPath(); ctx.moveTo(sx0, -28); ctx.lineTo(ex, ey); ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#8a95a8'; ctx.beginPath(); ctx.moveTo(sx0, -28); ctx.lineTo(ex, ey); ctx.stroke(); lineStyle(2); ctx.beginPath(); ctx.arc(ex, ey, 4, 0.6, Math.PI * 2 - 0.6); ctx.stroke(); };
  if (cheer) { arm(-15, -24, -54); arm(15, 24, -54); }
  else if (p.held || p.chopping) { const ay = p.chopping ? Math.sin(state.t * 30) * 4 : 0; arm(-15, hx - 10, -22 + ay); arm(15, hx + 10, -22 + ay); }
  else { arm(-15, -22, -12); arm(15, 22, -12); }
  // head: a square monitor with a face on its screen
  lineStyle(2.5); ctx.fillStyle = col.suit; rrect(-17, -66, 34, 28, 7); ctx.fill(); ctx.stroke();
  if (!up) {
    ctx.fillStyle = '#10202e'; rrect(-13, -62, 26, 20, 4); ctx.fill();
    const ex = p.fx * 3, blink = Math.floor(((state ? state.t : 0) + 0.3) * 0.7) % 4 === 0 && (((state ? state.t : 0) * 0.7) % 1) < 0.08;
    ctx.fillStyle = '#5ec8ff';
    if (cheer) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#5ec8ff'; ctx.beginPath(); ctx.arc(-5 + ex, -50, 3.5, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(5 + ex, -50, 3.5, Math.PI, 0); ctx.stroke(); }
    else { ctx.fillRect(-8 + ex, -55, 5, blink ? 1.5 : 7); ctx.fillRect(3 + ex, -55, 5, blink ? 1.5 : 7); }
    ctx.fillRect(-4 + ex, -46, 8, 2);
  } else { ctx.fillStyle = '#8a95a8'; for (let i = 0; i < 3; i++) ctx.fillRect(-10, -60 + i * 6, 20, 3); }
  // antenna, and a small chef hat cocked to one side
  lineStyle(2); ctx.beginPath(); ctx.moveTo(10, -66); ctx.lineTo(13, -78); ctx.stroke();
  ctx.fillStyle = cheer || Math.floor((state ? state.t : 0) * 2) % 2 ? '#ffd23f' : '#ff5a3d'; ellipse(13, -80, 3.5, 3.5); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(-5, -70); ctx.rotate(-0.25); lineStyle(2); ctx.fillStyle = '#ffffff';
  ellipse(-4, -6, 5, 4.5); ctx.fill(); ctx.stroke(); ellipse(4, -6, 5, 4.5); ctx.fill(); ctx.stroke(); ellipse(0, -9, 6, 5); ctx.fill(); ctx.stroke(); rrect(-7, -4, 14, 5, 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (!up) drawHeld();
  ctx.restore();
  if (cheer) drawSparkles(x, y - lift - 92, p.cheerT);
  if (s === 1) textOutlined(p.r.name, x, y - lift - 98, 15, '#e8eef5');
}
function drawAnyCook(p: Loose, x: number, y: number, z: number, i: number, s = 1): void { if (p.bot) drawBot(p, x, y, z, s); else drawCook(p, x, y, z, i, s); }

// ---- Drawing: the galley ------------------------------------------------------------------
function drawWall(): void {
  const top = 98, bot = sy(0, CH) + 2;
  const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#3a4560'); g.addColorStop(1, '#2a3248');
  ctx.fillStyle = g; ctx.fillRect(X0 - 10, top, COLS * TS + 20, bot - top);
  lineStyle(3); ctx.strokeRect(X0 - 10, top, COLS * TS + 20, bot - top);
  // windows onto space
  const wins = [[1.1, 4.4], [5.3, 9.6], [10.5, 13.9]];
  wins.forEach(([a, b], wi) => {
    const x = sx(a), w = (b - a) * TS, y = top + 12, h = bot - top - 30;
    ctx.save(); rrect(x, y, w, h, 18); ctx.clip();
    ctx.fillStyle = '#060814'; ctx.fillRect(x, y, w, h);
    for (const s of STARS) {
      const px = x + ((s.x * w * 1.0 - state.t * 6 * s.sp) % w + w) % w, py = y + s.y * h;
      ctx.fillStyle = `rgba(220,230,255,${0.4 + s.sp * 0.5})`; ctx.fillRect(px, py, s.s, s.s);
    }
    if (wi === 1 && level.view === 'ring') { // a ringed planet drifting past
      const px = x + w * 0.65 - (state.t * 1.2) % 40, py = y + h * 0.55;
      const pg = ctx.createRadialGradient(px - 10, py - 10, 4, px, py, 34); pg.addColorStop(0, '#ffb36b'); pg.addColorStop(1, '#b8432f');
      ctx.fillStyle = pg; ellipse(px, py, 30, 30); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,170,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py, 52, 10, -0.3, 0, Math.PI * 2); ctx.stroke();
    }
    if (level.view === 'giant' && wi === 1) { // a banded blue gas giant filling the window, a small moon
      const px = x + w * 0.5, py = y + h + 40;
      ctx.save(); ellipse(px, py, 150, 150); ctx.clip();
      ['#3d6fd1', '#5a8ee8', '#2f58b0', '#7fb0ff', '#3d6fd1', '#2a4d9c'].forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(px - 150, py - 150 + k * 22 + Math.sin(state.t * 0.3 + k) * 3, 300, 22); });
      ctx.restore();
      ctx.fillStyle = '#c3ccd8'; ellipse(x + 40 + (state.t * 2) % (w - 60), y + 28, 8, 8); ctx.fill();
    }
    if (level.view === 'giant' && wi !== 1) { // a cargo freighter drifting by
      const fx = x + ((state.t * 9 + wi * 90) % (w + 120)) - 60, fy = y + h * 0.5;
      ctx.fillStyle = '#5b6577'; ctx.fillRect(fx - 30, fy - 6, 60, 12); ctx.fillStyle = '#2ec4b6'; ctx.fillRect(fx - 26, fy - 4, 10, 8); ctx.fillRect(fx - 12, fy - 4, 10, 8); ctx.fillRect(fx + 2, fy - 4, 10, 8);
      ctx.fillStyle = '#ffb36b'; ctx.fillRect(fx + 30, fy - 3, 6, 6);
    }
    if (level.view === 'eclipse' && wi === 1) { // the sun behind a dark moon: a burning ring and its corona
      const ex = x + w * 0.5, ey = y + h * 0.55, er = Math.min(w, h) * 0.3;
      const co = ctx.createRadialGradient(ex, ey, er * 0.9, ex, ey, er * 2.2);
      co.addColorStop(0, 'rgba(255,230,150,0.75)'); co.addColorStop(0.4, 'rgba(255,170,60,0.25)'); co.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = co; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#05060c'; ellipse(ex, ey, er, er); ctx.fill();
      lineStyle(3); ctx.strokeStyle = '#fff1c0'; ellipse(ex, ey, er, er); ctx.stroke();
    }
    if (level.view === 'eclipse' && wi !== 1) { // dim relay satellites blinking in the dark
      const fx = x + ((state.t * 5 + wi * 140) % (w + 60)) - 30, fy = y + h * (0.3 + wi * 0.15);
      ctx.fillStyle = '#3a4252'; ctx.fillRect(fx - 4, fy - 4, 8, 8); ctx.fillStyle = '#2a3a5a'; ctx.fillRect(fx - 18, fy - 2, 12, 4); ctx.fillRect(fx + 6, fy - 2, 12, 4);
      ctx.fillStyle = Math.floor(state.t * 2 + wi) % 2 ? '#ffd23f' : '#5a4a1a'; ctx.fillRect(fx - 1, fy - 8, 2, 3);
    }
    if (level.view === 'nebula') { // a pink-violet nebula and tumbling rocks
      const ng = ctx.createRadialGradient(x + w * 0.6, y + h * 0.5, 4, x + w * 0.6, y + h * 0.5, w * 0.7);
      ng.addColorStop(0, 'rgba(255,90,160,0.45)'); ng.addColorStop(0.5, 'rgba(140,70,220,0.25)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng; ctx.fillRect(x, y, w, h);
      for (let k = 0; k < 3; k++) {
        const ax = x + ((k * 97 + wi * 53 + state.t * (4 + k * 3)) % (w + 40)) - 20, ay = y + h * (0.25 + k * 0.25);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(state.t * (0.5 + k * 0.3)); ctx.fillStyle = '#7a6a5a'; ctx.beginPath();
        for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2, r = (5 + k * 2) * (0.75 + ((j * 37) % 5) * 0.08); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    ctx.restore();
    lineStyle(5); ctx.strokeStyle = '#9aa7b8'; rrect(x, y, w, h, 18); ctx.stroke(); lineStyle(2); rrect(x - 3, y - 3, w + 6, h + 6, 20); ctx.stroke();
  });
  // alarm lights
  const g2 = state.g, on = (!g2.on) || (g2.warn && Math.floor(state.t * 4) % 2 === 0);
  [[0.6], [4.85], [10.05], [14.4]].forEach(([a]) => {
    const x = sx(a), y = top + 18;
    ctx.fillStyle = '#20263a'; rrect(x - 9, y - 6, 18, 14, 4); ctx.fill(); lineStyle(2); ctx.stroke();
    ctx.fillStyle = on ? '#ff3d3d' : '#5a2a2a'; ellipse(x, y, 6, 6); ctx.fill();
    if (on) { const gl = ctx.createRadialGradient(x, y, 2, x, y, 60); gl.addColorStop(0, 'rgba(255,60,60,0.5)'); gl.addColorStop(1, 'rgba(255,60,60,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 60, y - 60, 120, 120); }
  });
}
function drawFloor(): void {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (MAP[r][c] !== '.') continue; // the floor
    ctx.fillStyle = (r + c) % 2 ? '#2f394c' : '#344056';
    ctx.fillRect(sx(c), sy(r), TS + 0.5, TD + 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(sx(c), sy(r), TS, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    [[6, 6], [TS - 8, 6], [6, TD - 7], [TS - 8, TD - 7]].forEach(([a, b]) => { ctx.fillRect(sx(c) + a, sy(r) + b, 2, 2); });
  }
  if (state.vent) { // a hazard arc on the floor in front of the hull vent
    const vx = sx(state.vent.x), vy = sy(state.vent.y - 0.5);
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, COLS * TS, vy - Y0); ctx.clip();
    ctx.strokeStyle = !state.g.on ? 'rgba(255,80,110,0.55)' : 'rgba(255,210,63,0.28)'; ctx.lineWidth = 3; ctx.setLineDash([12, 9]);
    for (const r of [1.6, 2.6]) { ctx.beginPath(); ctx.ellipse(vx, vy, r * TS, r * TD, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
  }
}
function boxFaces(c: number, r: number, top: string, front: string, h = CH): { x: number; yt: number; yf: number } {
  const x = sx(c), yt = sy(r, h), yf = sy(r + 1, h);
  ctx.fillStyle = front; ctx.fillRect(x, yf, TS, h * TZ);
  ctx.fillStyle = top; ctx.fillRect(x, yt, TS, TD);
  return { x, yt, yf };
}
function drawCounter(t: Loose, targets: Map<Loose, Loose>): void {
  const { r, c, type } = t;
  const { x, yt, yf } = boxFaces(c, r, '#c3ccd8', '#4a5468');
  // trim and edges
  ctx.fillStyle = level.trim; ctx.fillRect(x, yf + 4, TS, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, yt, TS, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + TS - 1, yt, 1, TD + CH * TZ);
  const cx = x + TS / 2, cy = yt + TD / 2;
  lineStyle(2);
  if (CRATES[type]) {
    const cr = CRATES[type], k = cr.kind, kelp = k === 'kelp';
    ctx.fillStyle = cr.box; rrect(x + 6, yt + 2, TS - 12, TD - 4, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b2a3a'; rrect(x + 11, yt + 6, TS - 22, TD - 14, 4); ctx.fill();
    if (kelp) { drawKelp(cx - 8, cy + 8, false, 0.6); drawKelp(cx + 8, cy + 8, false, 0.6); drawKelp(cx, cy + 4, false, 0.65); }
    else { drawIngr(k, cx - 8, cy + 6, false, 0.6); drawIngr(k, cx + 8, cy + 8, false, 0.6); drawIngr(k, cx, cy + 2, false, 0.65); }
    ctx.fillStyle = cr.label; ctx.fillRect(x + 8, yf + 12, TS - 16, 10);
  } else if (type === 'B') {
    ctx.fillStyle = '#d9a066'; rrect(x + 7, yt + 5, TS - 14, TD - 10, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b97f48'; ctx.fillRect(x + 10, yt + TD - 11, TS - 20, 3);
    if (!t.item) { ctx.fillStyle = '#dfe6ee'; rrect(cx - 4, cy - 10, 18, 5, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a3142'; rrect(cx - 14, cy - 10, 11, 5, 2); ctx.fill(); }
  } else if (type === 'S') {
    ctx.fillStyle = '#262c38'; rrect(x + 4, yt + 3, TS - 8, TD - 6, 6); ctx.fill(); ctx.stroke();
    const pot = t.item, hot = pot && pot.kind === 'pot' && pot.contents.length >= tune.pot_size && !pot.burnt && state.g.on;
    ctx.strokeStyle = hot ? `rgba(255,${120 + Math.sin(state.t * 10) * 30},40,1)` : '#4a5266'; ctx.lineWidth = 3;
    ellipse(cx, cy, 18, 9); ctx.stroke();
    if (hot) { const gl = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34); gl.addColorStop(0, 'rgba(255,140,40,0.55)'); gl.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - 34, cy - 34, 68, 68); }
    ctx.fillStyle = '#ff5a3d'; ellipse(x + 12, yf + 14, 3, 3); ctx.fill(); ellipse(x + 22, yf + 14, 3, 3); ctx.fill();
  } else if (type === 'W') {
    for (let i = 0; i < 3; i++) drawBowl(cx, cy + 8 - i * 5, null, 0.85);
  } else if (type === 'H') {
    ctx.fillStyle = '#141824'; rrect(x + 5, yt + 3, TS - 10, TD - 6, 4); ctx.fill();
    ctx.fillStyle = '#2a3142'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 8, yt + 6 + ((i * 9 + state.t * 20) % (TD - 12)), TS - 16, 3);
    ctx.fillStyle = '#5be37a'; ctx.fillRect(x + 6, yf + 10, TS - 12, 12);
    text('SERVE', cx, yf + 16, 10, '#10331a');
  } else if (isBelt(t)) {
    const [dx, dy] = DIRS[type];
    ctx.fillStyle = '#1b2130'; rrect(x + 3, yt + 3, TS - 6, TD - 6, 5); ctx.fill(); ctx.stroke();
    ctx.save(); rrect(x + 5, yt + 5, TS - 10, TD - 10, 4); ctx.clip();
    const ph = (state.t * tune.conveyor_speed * 2) % 1, bx = -dy, by = dx;
    ctx.strokeStyle = '#3d4860'; ctx.lineWidth = 4;
    for (let i = -1; i < 3; i++) {
      const f = (i + ph) / 2, px = cx + dx * (f - 0.5) * TS, py = cy + dy * (f - 0.5) * TD;
      ctx.beginPath(); ctx.moveTo(px - dx * 6 + bx * 10, py - dy * 4 + by * 7); ctx.lineTo(px + dx * 6, py + dy * 4); ctx.lineTo(px - dx * 6 - bx * 10, py - dy * 4 - by * 7); ctx.stroke();
    }
    ctx.restore();
    for (let k = 0; k < 4; k++) { ctx.fillStyle = '#2a3142'; ellipse(x + 8 + k * 16, yf + 18, 5, 5); ctx.fill(); ctx.fillStyle = '#7d889c'; ellipse(x + 8 + k * 16, yf + 18, 2, 2); ctx.fill(); }
  } else if (type === 'I') {
    ctx.fillStyle = '#20263a'; rrect(x + 3, yt + 2, TS - 6, TD - 4, 6); ctx.fill(); ctx.stroke();
    ctx.save(); rrect(x + 3, yt + 2, TS - 6, TD - 4, 6); ctx.clip();
    for (let i = -4; i < 7; i++) { ctx.fillStyle = i % 2 ? '#ffd23f' : '#141824'; ctx.beginPath(); ctx.moveTo(x + i * 12, yt); ctx.lineTo(x + i * 12 + 6, yt); ctx.lineTo(x + i * 12 - 6, yt + TD); ctx.lineTo(x + i * 12 - 12, yt + TD); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#060814'; rrect(x + 11, yt + 8, TS - 22, TD - 16, 4); ctx.fill();
    const open = state.intakeFlash > 0 ? state.intakeFlash / 0.4 : 0;
    ctx.fillStyle = '#5b6577'; rrect(x + 11, yt + 8, TS - 22, (TD - 16) * (1 - open), 3); ctx.fill(); lineStyle(1.5); ctx.stroke();
    ctx.fillStyle = '#2ec4b6'; ctx.fillRect(x + 6, yf + 10, TS - 12, 12);
    text('CARGO', cx, yf + 16, 10, '#0d2e2b');
    ctx.fillStyle = open ? '#5be37a' : '#24543a'; ellipse(x + TS - 10, yt + 6, 4, 4); ctx.fill();
  } else if (type === 'V') {
    const open = !state.g.on;
    ctx.fillStyle = '#141824'; rrect(x + 3, yt + 2, TS - 6, TD - 4, 6); ctx.fill(); ctx.stroke();
    ctx.save(); rrect(x + 3, yt + 2, TS - 6, TD - 4, 6); ctx.clip();
    if (open) { // the void through a torn grate, swirling
      ctx.fillStyle = '#04050c'; ctx.fillRect(x, yt, TS, TD);
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = `rgba(160,200,255,${0.25 + 0.1 * (k % 3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 6 + k * 4, 3 + k * 2, 0, state.t * 6 + k, state.t * 6 + k + 2); ctx.stroke(); }
    }
    ctx.fillStyle = open ? 'rgba(90,100,120,0.6)' : '#4a5468';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 9, yt + 6 + i * 6, TS - 18, open ? 1.5 : 3);
    ctx.restore();
    ctx.fillStyle = open ? '#ff3d5a' : '#6a2a3a'; ctx.fillRect(x + 6, yf + 10, TS - 12, 12);
    text(open ? 'BREACH' : 'VENT', cx, yf + 16, 10, '#ffffff');
  } else if (type === 'X') {
    ctx.fillStyle = '#20263a'; ellipse(cx, cy, 22, 13); ctx.fill(); ctx.stroke();
    ctx.save(); ellipse(cx, cy, 22, 13); ctx.clip();
    for (let i = -4; i < 5; i++) { ctx.fillStyle = i % 2 ? '#ffd23f' : '#141824'; ctx.beginPath(); ctx.moveTo(cx + i * 10, cy - 14); ctx.lineTo(cx + i * 10 + 6, cy - 14); ctx.lineTo(cx + i * 10 - 4, cy + 14); ctx.lineTo(cx + i * 10 - 10, cy + 14); ctx.fill(); }
    ctx.restore(); ctx.fillStyle = '#060814'; ellipse(cx, cy, 13, 7); ctx.fill();
    text('TRASH', cx, yf + 16, 10, '#ffd23f');
  }
  const tg = targets.get(t);
  if (tg) { ctx.strokeStyle = tg; ctx.lineWidth = 3; ctx.globalAlpha = 0.9; rrect(x + 2, yt + 1, TS - 4, TD - 2, 6); ctx.stroke(); ctx.globalAlpha = 1; }
}

function drawWorld(): void {
  const targets = new Map();
  for (const p of state.players) if (p.target && solid(p.target)) targets.set(p.target, COLORS[p.r.i].suit);
  drawWall(); drawFloor();
  const list = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = state.tiles[r][c];
    if (solid(t)) list.push({ k: r + 1, f: () => drawCounter(t, targets) });
  }
  for (const it of state.items) {
    if (it.at === 'counter') list.push({ k: it.tr + 1.001, f: () => { drawItem(it, sx(it.x), sy(it.y, CH) + 6); } });
    else if (it.at === 'floor') list.push({ k: it.y + 0.01, f: () => { shadow(sx(it.x), sy(it.y) + 2, 12, 0.3); drawItem(it, sx(it.x), sy(it.y) + 2); } });
  }
  for (const p of state.players) list.push({ k: p.y + R, f: () => drawAnyCook(p, sx(p.x), sy(p.y), p.z, p.r.i) });
  list.sort((a, b) => a.k - b.k);
  for (const e of list) e.f();
  // items in the air: above everything, shadows first
  const air = state.items.filter((it: Loose) => it.at === 'air').sort((a: Loose, b: Loose) => a.y - b.y);
  for (const it of air) {
    const t = tileAt(Math.floor(it.y), Math.floor(it.x)), base = solid(t) ? CH : 0;
    shadow(sx(it.x), sy(it.y, base), 11, Math.max(0.08, 0.3 - (it.z - base) * 0.12));
  }
  for (const it of air) {
    const x = sx(it.x), y = sy(it.y, it.z);
    if (!state.g.on) { ctx.fillStyle = 'rgba(140,200,255,0.18)'; ellipse(x, y - 10, 20, 20); ctx.fill(); }
    drawItem(it, x, y);
  }
  if (state.vent && !state.g.on) { // air streaming out through the breach
    const vx = sx(state.vent.x), vy = sy(state.vent.y, CH);
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const f = ((i * 0.381 + state.t * 1.4) % 1), a = Math.PI + (i * 2.399 % Math.PI), r = (1 - f) * 5.5;
      const px = vx + Math.cos(a) * r * TS, py = vy + Math.sin(a) * r * TD * 1.2, tx = vx + Math.cos(a) * (r - 0.5) * TS, ty = vy + Math.sin(a) * (r - 0.5) * TD * 1.2;
      ctx.strokeStyle = `rgba(200,225,255,${0.15 + f * 0.45})`; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    }
  }
  // item UI on top
  for (const it of state.items) {
    if (it.at === 'held') continue;
    const z = it.at === 'counter' ? CH : it.z;
    drawItemUI(it, sx(it.x), sy(it.y, z) + 6);
  }
  for (const p of state.players) if (p.held && p.held.kind === 'pot') drawItemUI(p.held, sx(p.x) + p.fx * 16, sy(p.y, p.z) - 6);
  for (const pp of state.popups) textOutlined(pp.s, sx(pp.x), sy(pp.y) - 30 - pp.t * 40, 22, pp.color);
}

function drawLight(): void {
  const g = ctx.createRadialGradient(W / 2, H * 0.55, 60, W / 2, H * 0.55, 700);
  g.addColorStop(0, 'rgba(255,190,120,0.10)'); g.addColorStop(1, 'rgba(0,0,20,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!state.g.on) {
    ctx.fillStyle = `rgba(70,120,255,${0.10 + 0.04 * Math.sin(state.t * 3)})`; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,40,40,${0.06 + 0.06 * Math.max(0, Math.sin(state.t * 8))})`; ctx.fillRect(0, 0, W, H);
  } else if (state.g.warn && Math.floor(state.t * 4) % 2 === 0) { ctx.fillStyle = 'rgba(255,40,40,0.08)'; ctx.fillRect(0, 0, W, H); }
  if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  if (level.dark && state.dark > 0.01) drawBlackout();
}

let darkLayer: HTMLCanvasElement | null = null;
/** The blackout: darkness over the galley with holes for each cook's helmet lamp and the stove and hatch glow. */
function drawBlackout(): void {
  if (!darkLayer) { darkLayer = document.createElement('canvas'); darkLayer.width = W; darkLayer.height = H; }
  const d = darkLayer.getContext('2d')!;
  d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
  const flicker = state.g.warn || state.dark < 0.98 ? 0.92 + 0.08 * Math.sin(state.t * 37) : 1;
  d.fillStyle = `rgba(2,3,10,${tune.dark_level * state.dark * flicker})`; d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x: number, y: number, r: number, k: number) => {
    const g = d.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(0.6, `rgba(0,0,0,${k * 0.7})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g; d.beginPath(); d.ellipse(x, y, r, r * TD / TS, 0, 0, Math.PI * 2); d.fill();
  };
  for (const t of state.tiles.flat()) if (t.type === 'S' || t.type === 'H') hole(sx(t.c + 0.5), sy(t.r + 0.5, CH), tune.dark_glow * TS, 0.85);
  for (const p of state.players) { // a lamp on each helmet, thrown a little ahead of the cook
    const x = sx(p.x + p.fx * 0.6), y = sy(p.y + p.fy * 0.6, p.z);
    hole(x, y - 20, tune.dark_lamp * TS, 1); hole(sx(p.x), sy(p.y, p.z) - 30, TS * 0.7, 1);
  }
  ctx.drawImage(darkLayer, 0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.12 * state.dark; // warm light where the lamps fall
  for (const p of state.players) { const x = sx(p.x + p.fx * 0.6), y = sy(p.y + p.fy * 0.6, p.z) - 20, g = ctx.createRadialGradient(x, y, 4, x, y, tune.dark_lamp * TS); g.addColorStop(0, 'rgba(255,230,160,0.9)'); g.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = g; ctx.fillRect(x - tune.dark_lamp * TS, y - tune.dark_lamp * TS, tune.dark_lamp * TS * 2, tune.dark_lamp * TS * 2); }
  ctx.restore();
}

function drawHUD(): void {
  // orders
  state.orders.forEach((o: Loose, i: number) => {
    const x = 210 + i * 150 + Math.max(0, 0.35 - (state.t - o.born)) * 1400, y = 10, w = 140, h = 78, sp = SOUPS[o.type]; // new cards slide in
    const k = Math.max(0, o.t / o.max), urgent = k < 0.25 && Math.floor(state.t * 4) % 2;
    ctx.fillStyle = urgent ? '#5a2430' : '#1d2436'; rrect(x, y, w, h, 10); ctx.fill(); lineStyle(3); ctx.stroke();
    drawBowl(x + 28, y + 44, o.type, 1.05);
    text(sp.name, x + 88, y + 18, 13, '#e8eef5');
    sp.recipe.forEach((r, j) => { const cx = x + 70 + j * 32, cy = y + 52; ctx.fillStyle = '#2a3348'; ellipse(cx, cy - 4, 14, 14); ctx.fill(); drawIngr(r, cx, cy + (r === 'kelp' ? 8 : 6), false, r === 'tomato' ? 0.85 : 0.8); });
    ctx.fillStyle = '#10141f'; rrect(x + 8, y + h - 10, w - 16, 6, 3); ctx.fill();
    ctx.fillStyle = k > 0.5 ? '#5be37a' : k > 0.25 ? '#ffd23f' : '#ff5a3d'; rrect(x + 8, y + h - 10, (w - 16) * k, 6, 3); ctx.fill();
  });
  // score and clock
  ctx.fillStyle = '#1d2436'; rrect(16, 14, 170, 70, 12); ctx.fill(); lineStyle(3); ctx.stroke();
  text('SCORE', 101, 32, 13, '#9aa7b8'); textOutlined(`${state.score}`, 101, 60, 32, '#ffe066');
  const left = Math.max(0, tune.shift_length - state.t), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  ctx.fillStyle = '#1d2436'; rrect(W - 186, 14, 170, 70, 12); ctx.fill(); lineStyle(3); ctx.stroke();
  text(`SHIFT ${LV + 1} OF ${LEVELS.length}`, W - 101, 32, 13, '#9aa7b8'); textOutlined(`${mm}:${String(ss).padStart(2, '0')}`, W - 101, 60, 32, left < 20 && Math.floor(state.t * 2) % 2 ? '#ff6b6b' : '#e8eef5');
  // gravity status
  const g = state.g, y = H - 34;
  let label, col;
  if (!g.on) { label = `ZERO-G${level.breach ? ' + BREACH' : level.dark ? ' + BLACKOUT' : ''}  ${Math.ceil(g.end - state.t)}`; col = level.breach ? '#ff8a9a' : level.dark ? '#ffd23f' : '#7ab8ff'; }
  else if (g.warn) { label = `GRAVITY FAILING  ${Math.max(0, Math.ceil(g.next - state.t))}`; col = '#ff5a3d'; }
  else { label = 'GRAVITY  ONLINE'; col = '#5be37a'; }
  ctx.fillStyle = '#1d2436'; rrect(W / 2 - 170, y - 22, 340, 44, 22); ctx.fill(); lineStyle(3); ctx.stroke();
  ctx.fillStyle = col; ellipse(W / 2 - 140, y, 8, 8); ctx.fill();
  textOutlined(label, W / 2 + 10, y, 22, col);
  const since = LT('zero_g_duration') - (g.end - state.t);
  if (!g.on && since < 1.6) {
    ctx.globalAlpha = Math.min(1, (1.6 - since) * 2); textOutlined('GRAVITY OFFLINE!', W / 2, 150 + since * 20, 54, '#9fd0ff');
    if (level.breach) textOutlined('HULL BREACH: HOLD ON TO EVERYTHING', W / 2, 200 + since * 20, 24, '#ff8a9a');
    if (level.dark) textOutlined('POWER DOWN: FOLLOW THE LAMPS', W / 2, 200 + since * 20, 24, '#ffd23f');
    ctx.globalAlpha = 1;
  }
  if (state.t < 4) { // which shift this is, and its twist
    const a = Math.min(1, (4 - state.t) * 1.5); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(16,20,31,0.88)'; rrect(W / 2 - 330, 300, 660, 104, 18); ctx.fill(); lineStyle(3); ctx.strokeStyle = level.trim; ctx.stroke();
    textOutlined(`Shift ${LV + 1}: ${level.name}`, W / 2, 334, 34, level.trim);
    text(level.twist, W / 2, 374, 17, '#e8eef5', 'center', 'normal');
    ctx.globalAlpha = 1;
  }
  // joining hint
  text('C: cheer', W - 24, H - 34, 14, '#6b7690', 'right', 'normal');
  if (roster.length < 4) text(roster.length < 2 ? 'P2: press .  to join   ·   gamepad: press A' : 'gamepad: press A to join', 24, H - 34, 14, '#6b7690', 'left', 'normal');
  if (roster.length < 4 && net.qr && net.status === 'open') { // small QR in the empty left column
    text('scan to join', 80, 438, 13, '#9aa7b8', 'center', 'normal');
    drawQr(net.qr, 20, 452, 120);
  }
}

function cheerAll(): void { // one key: every cook cheers, BOLT too
  for (const p of state.players) p.cheerT = tune.cheer_time;
  sfx.cheer(); events.push({ type: 'cheer' });
}
function anyStart(): boolean { return pressed('Enter') || pressed('Space') || net.start || padsNow.some((gp, i) => gp && (padEdge(i, 9) || padEdge(i, 0))); }
function drawMiniMap(lv: Loose, x: number, y: number, cw: number, chh: number): void { // a small plan of a galley for the select cards
  const m = LEVELS[lv].map;
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[0].length; c++) {
    const k = m[r][c], px = x + c * cw, py = y + r * chh;
    ctx.fillStyle = k === '.' ? ((r + c) % 2 ? '#2f394c' : '#344056') : DIRS[k] ? '#1b2130' : k === 'I' ? '#2ec4b6' : k === 'V' ? '#ff3d5a'
      : CRATES[k] ? CRATES[k].label : k === 'S' ? '#262c38' : k === 'H' ? '#5be37a' : k === 'B' ? '#d9a066' : k === 'W' ? '#e8eef5' : k === 'X' ? '#ffd23f' : '#c3ccd8';
    ctx.fillRect(px, py, cw - 1, chh - 1);
    if (DIRS[k]) { ctx.fillStyle = '#7d889c'; const [dx, dy] = DIRS[k]; ctx.fillRect(px + cw / 2 - 1.5 + dx * 3, py + chh / 2 - 1.5 + dy * 2, 3, 3); }
  }
}
function drawPadlock(x: number, y: number): void {
  lineStyle(3); ctx.strokeStyle = '#9aa7b8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y - 10, 14, Math.PI, 0); ctx.stroke();
  lineStyle(3); ctx.fillStyle = '#ffd23f'; rrect(x - 22, y - 10, 44, 34, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#141824'; ellipse(x, y + 4, 4, 4); ctx.fill(); ctx.fillRect(x - 2, y + 4, 4, 10);
}
function drawStarIcon(x: number, y: number, ro: number, on: boolean): void { starPath(x, y, ro, ro * 0.43); ctx.fillStyle = on ? '#ffd23f' : '#2a3142'; ctx.fill(); lineStyle(Math.max(2, ro / 10)); ctx.stroke(); }

const scenes: Record<string, { update(dt: number): void; draw(): void }> = {
  figures: {
    update(dt: number) { state.t += dt; },
    draw() {
      clear('#1a2030'); text('Figures', W / 2, 40, 36, '#e8eef5');
      const fake = (i: number, fx: number, fy: number, held: Loose, bot?: boolean) => ({ r: { i, name: bot ? 'BOLT' : 'P' + (i + 1) }, fx, fy, walk: 0, tilt: 0, held, chopping: false, cheerT: 0, bot });
      const bowlSoup = { kind: 'bowl', soup: 'red', at: 'held' };
      [fake(0, 0, 1, null), fake(1, 1, 0, bowlSoup), fake(2, 0, -1, null), fake(3, -1, 0, null), fake(4, 0, 1, null, true)].forEach((p, i) => {
        drawAnyCook(p, 170 + i * 235, 230, 0, p.r.i);
        text(['cook P1', 'cook P2 (holding soup)', 'cook P3 (back)', 'cook P4', 'BOLT, the bot partner'][i], 170 + i * 235, 262, 14, '#c3ccd8');
      });
      const pot = { kind: 'pot', contents: ['tomato', 'kelp'], cook: 3, burnt: false };
      const items: [string, () => void][] = [['tomato', () => drawTomato(0, 0, false, 1.5)], ['tomato chopped', () => drawTomato(0, 0, true, 1.5)],
        ['kelp', () => drawKelp(0, 0, false, 1.5)], ['kelp chopped', () => drawKelp(0, 0, true, 1.5)],
        ['moon shroom', () => drawShroom(0, 0, false, 1.5)], ['shroom chopped', () => drawShroom(0, 0, true, 1.5)],
        ['sun pepper', () => drawPepper(0, 0, false, 1.5)], ['pepper chopped', () => drawPepper(0, 0, true, 1.5)],
        ['bowl', () => drawBowl(0, 0, null, 1.5)], ['Red Nebula', () => drawBowl(0, 0, 'red', 1.5)],
        ['Comet Kelp', () => drawBowl(0, 0, 'green', 1.5)], ['Eclipse Mix', () => drawBowl(0, 0, 'mixed', 1.5)],
        ['Crater Stew', () => drawBowl(0, 0, 'crater', 1.5)], ['Galaxy Broth', () => drawBowl(0, 0, 'galaxy', 1.5)],
        ['Solar Flare', () => drawBowl(0, 0, 'flare', 1.5)], ['Space Slop', () => drawBowl(0, 0, 'slop', 1.5)],
        ['pot', () => drawPot(0, 0, pot, 1.4)], ['burnt pot', () => drawPot(0, 0, { contents: ['tomato', 'tomato'], burnt: true, cook: 0 }, 1.4)]];
      items.forEach(([name, f], i) => {
        const x = 100 + (i % 6) * 216, y = 318 + Math.floor(i / 6) * 100;
        ctx.save(); ctx.translate(x, y); f(); ctx.restore(); text(name, x, y + 26, 14, '#c3ccd8');
      });
      // the stations that are new in shifts 2 and 3, drawn on their own counters
      const saved = { MAP, X0 }, stations = [['conveyor belt', '>'], ['cargo bay', 'I'], ['hull vent (sealed)', 'V']];
      stations.forEach(([name, k], i) => {
        const t = { r: 0, c: 0, type: k, item: null }, x = 380 + i * 240, y = 648;
        ctx.save(); ctx.translate(x - TS / 2 - sx(0), y - 40 - sy(0, CH)); drawCounter(t, new Map()); ctx.restore();
        text(name, x, y + 46, 14, '#c3ccd8');
      });
      void saved;
    },
  },
  title: {
    update() {
      checkJoins(true);
      if (pressed('Enter') || pressed('Space') || net.start || padsNow.some((gp, i) => gp && padEdge(i, 9))) {
        if (!roster.length) join(KEYSETS[0]);
        scene = 'select'; sfx.select();
      }
      state.t += STEP;
    },
    draw() {
      clear('#0b0f1a');
      for (const s of STARS) { ctx.fillStyle = `rgba(220,230,255,${0.3 + s.sp * 0.6})`; ctx.fillRect(((s.x * W - state.t * 10 * s.sp) % W + W) % W, s.y * H, s.s * 1.4, s.s * 1.4); }
      textOutlined(TITLE, W / 2, 100, 64, '#ffb36b');
      text('three galleys · gravity that keeps failing · soup', W / 2, 150, 20, '#9fd0ff', 'center', 'normal');
      for (let i = 0; i < 4; i++) {
        const r = roster[i], x = W / 2 - 300 + i * 200, y = 330;
        ctx.fillStyle = r ? '#1d2436' : '#141a28'; rrect(x - 80, y - 110, 160, 190, 16); ctx.fill(); lineStyle(3); ctx.stroke();
        if (r) drawCook({ r, fx: 0, fy: 1, walk: 0, tilt: Math.sin(state.t * 2 + i) * 0.08, held: null, chopping: false, cheerT: 0 }, x, y + 40, 0.15 + 0.06 * Math.sin(state.t * 2 + i), i);
        else if (i === 1 && tune.bot_partner >= 1) { drawBot({ r: { name: 'BOLT' }, fx: 0, fy: 1, tilt: 0, held: null, chopping: false, cheerT: 0 }, x, y + 40, 0.1, 4); }
        else text(i === 0 ? 'press F' : i === 1 ? 'press  .' : 'gamepad A', x, y - 10, 18, '#6b7690', 'center', 'normal');
        const sub = r ? (({ pad: 'gamepad', keys: 'keyboard' } as Record<string, string>)[r.ctl.kind] || (r.ctl.conn ? 'phone' : 'phone (lost)')) : i === 1 && tune.bot_partner >= 1 ? 'helps if you play alone' : 'to join';
        text(sub, x, y + 62, 14, r ? '#c3ccd8' : '#6b7690', 'center', 'normal');
        if (!r && i === 1 && tune.bot_partner >= 1) text('press  .  to take the seat', x, y - 94, 13, '#6b7690', 'center', 'normal');
      }
      if (net.qr) { // scan to join
        const qx = 1060, qy = 226;
        text('Scan to join', qx + 90, qy - 26, 18, '#ffe066');
        const s = drawQr(net.qr, qx, qy, 180);
        if (net.status !== 'open') { ctx.fillStyle = 'rgba(11,15,26,0.8)'; ctx.fillRect(qx, qy, s, s); }
        text(roomLabel(), qx + s / 2, qy + s + 18, 14, net.status === 'error' ? '#ff6b6b' : '#9aa7b8', 'center', 'normal');
      }
      CONTROLS.forEach((c, i) => text(c, W / 2, 460 + i * 30, 18, '#c3ccd8', 'center', 'normal'));
      text('Chop, cook, serve soup. When gravity fails, everything loose floats away. Grab it!', W / 2, 600, 18, '#ffe066', 'center', 'normal');
      textOutlined('Enter to choose a galley', W / 2, 655, 30, '#ffffff');
    },
  },
  select: {
    update() {
      checkJoins(true);
      const left = pressed('KeyA') || pressed('ArrowLeft') || padsNow.some((gp, i) => gp && padEdge(i, 14));
      const right = pressed('KeyD') || pressed('ArrowRight') || padsNow.some((gp, i) => gp && padEdge(i, 15));
      if (left && LV > 0) { LV--; sfx.select(); }
      if (right && LV < LAST) { LV++; sfx.select(); }
      if (anyStart()) { if (unlocked(LV)) startShift(LV); else sfx.buzz(); return; }
      if (pressed('Escape')) scene = 'title';
      if (cheatTyped()) {
        progress.cheat = !progress.cheat; saveProgress(); cheatBanner = CHEAT_BANNER;
        if (progress.cheat) sfx.unlock(); else sfx.buzz();
        events.push({ type: 'cheat', on: progress.cheat });
      }
      cheatBanner = Math.max(0, cheatBanner - STEP);
      state.t += STEP;
    },
    draw() {
      clear('#0b0f1a');
      for (const s of STARS) { ctx.fillStyle = `rgba(220,230,255,${0.3 + s.sp * 0.6})`; ctx.fillRect(((s.x * W - state.t * 6 * s.sp) % W + W) % W, s.y * H, s.s * 1.2, s.s * 1.2); }
      textOutlined('Choose a galley', W / 2, 70, 48, '#ffb36b');
      text(progress.cheat ? 'Cheat on: every shift is open (type ZERO again to lock them)' : 'Earn 1 star in a shift to open the next one', W / 2, 112, 18, progress.cheat ? '#ffe066' : '#9fd0ff', 'center', 'normal');
      LEVELS.forEach((lv, i) => {
        const cx = W / 2 + (i - LAST / 2) * 305, x = cx - 145, y = 150, w = 290, h = 430, sel = i === LV, open = unlocked(i);
        ctx.fillStyle = sel ? '#1d2436' : '#141a28'; rrect(x, y, w, h, 18); ctx.fill();
        lineStyle(sel ? 6 : 3); if (sel) ctx.strokeStyle = lv.trim; ctx.stroke();
        textOutlined(`Shift ${i + 1}`, cx, y + 34, 22, lv.trim);
        textOutlined(lv.name, cx, y + 70, 26, '#e8eef5');
        drawMiniMap(i, cx - 127, y + 104, 17, 15);
        ctx.font = `normal 16px ${FONT}`; // wrap the twist line
        const words = lv.twist.split(' '); let line = '', ly = y + 268;
        for (const wd of words) { if (ctx.measureText(line + wd).width > 256) { text(line.trim(), cx, ly, 16, '#c3ccd8', 'center', 'normal'); line = ''; ly += 22; } line += wd + ' '; }
        text(line.trim(), cx, ly, 16, '#c3ccd8', 'center', 'normal');
        for (let k = 0; k < 3; k++) drawStarIcon(cx + (k - 1) * 52, y + 362, 20, k < progress.stars[i]);
        text(progress.best[i] ? `best ${progress.best[i]}` : 'not played yet', cx, y + 404, 15, '#9aa7b8', 'center', 'normal');
        if (!open) {
          ctx.fillStyle = 'rgba(8,10,18,0.72)'; rrect(x, y, w, h, 18); ctx.fill();
          drawPadlock(cx, y + 190);
          text(`Earn a star in ${LEVELS[i - 1].name}`, cx, y + 250, 16, '#ffe066', 'center', 'normal');
        }
        if (sel) { const b = Math.sin(state.t * 5) * 5; ctx.fillStyle = lv.trim; ctx.beginPath(); ctx.moveTo(cx - 14, y - 22 + b); ctx.lineTo(cx + 14, y - 22 + b); ctx.lineTo(cx, y - 6 + b); ctx.closePath(); ctx.fill(); lineStyle(2); ctx.stroke(); }
      });
      const who = roster.length <= 1 && tune.bot_partner >= 1 ? 'You and BOLT the robot' : `${roster.length} cooks`;
      text(`${who}  ·  A / D or arrows to pick  ·  Esc: back`, W / 2, 616, 17, '#9aa7b8', 'center', 'normal');
      textOutlined(unlocked(LV) ? `Enter to start ${LEVELS[LV].name}` : 'Locked: earn a star in the shift before it', W / 2, 664, 28, unlocked(LV) ? '#ffffff' : '#ff8a9a');
      if (cheatBanner > 0) {
        ctx.globalAlpha = Math.min(1, cheatBanner * 2);
        ctx.fillStyle = 'rgba(8,10,18,0.85)'; rrect(W / 2 - 300, 320, 600, 90, 18); ctx.fill(); lineStyle(4); ctx.strokeStyle = '#ffe066'; ctx.stroke();
        textOutlined(progress.cheat ? 'ALL SHIFTS UNLOCKED!' : 'SHIFTS LOCKED AGAIN', W / 2, 365, 40, progress.cheat ? '#ffe066' : '#ff8a9a');
        ctx.globalAlpha = 1;
      }
    },
  },
  play: {
    update(dt: number) {
      if (pressed('KeyP') || pressed('Escape')) { scene = 'pause'; return; }
      checkJoins(true);
      if (pressed('KeyC') || net.cheer || padsNow.some((gp, i) => gp && padEdge(i, 3))) cheerAll();
      updatePlay(dt);
    },
    draw() {
      clear('#0b0f1a');
      ctx.save();
      if (state.shake > 0) { const a = state.shake * 10; ctx.translate(Math.sin(state.t * 90) * a, Math.cos(state.t * 77) * a); }
      drawWorld(); drawLight();
      ctx.restore();
      drawHUD();
    },
  },
  pause: {
    update() { if (pressed('KeyP') || pressed('Escape')) scene = 'play'; if (pressed('KeyQ')) scene = 'select'; },
    draw() { scenes.play.draw(); ctx.fillStyle = 'rgba(8,10,18,0.6)'; ctx.fillRect(0, 0, W, H); textOutlined('Paused', W / 2, H / 2, 56, '#fff'); text('P to resume  ·  Q to leave the shift', W / 2, H / 2 + 50, 20, '#c3ccd8'); },
  },
  results: {
    update() {
      const next = state.stars > 0 && LV < LAST;
      if (anyStart()) { startShift(next ? LV + 1 : LV); return; }
      if (pressed('KeyR')) { startShift(LV); return; }
      if (pressed('Escape')) scene = 'select';
    },
    draw() {
      scenes.play.draw();
      ctx.fillStyle = 'rgba(8,10,18,0.8)'; ctx.fillRect(0, 0, W, H);
      const done = LV === LAST && state.stars > 0;
      textOutlined(done ? 'The station is fed!' : `${level.name}: shift over!`, W / 2, 96, 50, '#ffb36b');
      for (let i = 0; i < 3; i++) drawStarIcon(W / 2 + (i - 1) * 110, 190, 42, i < state.stars);
      textOutlined(`Score ${state.score}${state.newBest ? '  NEW BEST' : ''}`, W / 2, 272, 38, '#ffe066');
      text(`stars at ${LT('star1')} / ${LT('star2')} / ${LT('star3')}`, W / 2, 304, 16, '#9aa7b8', 'center', 'normal');
      if (state.unlockedNow) textOutlined(`${LEVELS[LV + 1].name} is open!`, W / 2, 336, 24, LEVELS[LV + 1].trim);
      else if (done) text('All four galleys cleared. Go back for three stars each.', W / 2, 336, 18, '#9fe8ff', 'center', 'normal');
      const lines = [`Soups served: ${state.delivered}${state.spaceDeliveries ? `  (${state.spaceDeliveries} floated in by themselves!)` : ''}  ·  Orders missed: ${state.missed}`,
        `Gravity failures: ${state.g.failures}  ·  Mid-air catches: ${state.catches}  ·  Dropped: ${state.drops}${level.breach ? `  ·  Lost to space: ${state.lost}` : ''}`];
      lines.forEach((l, i) => text(l, W / 2, 380 + i * 28, 18, '#e8eef5', 'center', 'normal'));
      const n = state.players.length, gap = Math.min(230, 1100 / Math.max(1, n));
      state.players.forEach((p: Loose, i: number) => { // each cook's part: every soup they touched counts for them
        const x = W / 2 + (i - (n - 1) / 2) * gap;
        textOutlined(p.r.name, x, 470, 22, COLORS[p.r.i].suit);
        text(`helped on ${p.helped} soup${p.helped === 1 ? '' : 's'}`, x, 498, 15, '#e8eef5', 'center', 'normal');
        text(`${p.delivered} served · ${p.catches} catches`, x, 520, 15, '#c3ccd8', 'center', 'normal');
      });
      const nextLine = state.stars > 0 && LV < LAST ? `Enter: next shift (${LEVELS[LV + 1].name})` : state.stars > 0 ? 'Enter: play it again' : 'Enter: try again (1 star opens the next galley)';
      textOutlined(nextLine, W / 2, 610, 26, '#ffffff');
      text('R: replay this shift   ·   Esc: choose a galley', W / 2, 652, 18, '#c3ccd8', 'center', 'normal');
    },
  },
};

// ---- Loop: fixed step, frame time clamped ---------------------------------------------
function step(): void {
  readPads();
  if (pressed('KeyM')) { setMuted(!muted); hit.delete('KeyM'); }
  scenes[scene].update(STEP); hit.clear(); savePads(); net.start = false; net.cheer = false;
  if (scene !== net.scene) { net.scene = scene; broadcast({ t: 'scene', scene }); }
}
let last = 0, acc = 0, ALPHA = 1;
function tick(): void {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now;
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP;
  drawFrame();
}
function drawFrame(): void { ctx.setTransform(baseTransform); scenes[scene].draw(); }
function frame(): void { tick(); requestAnimationFrame(frame); }
function timer(): void { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
install({
  get scene() { return scene; },
  get state() { return state; },
  press(code: string) { hit.add(code); },
  hold(code: string, on: boolean) { if (on) down.add(code); else down.delete(code); },
  get events() { return events; },
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
});
Object.defineProperties(window.game!, {
  room: { get: () => ({ id: net.id, url: net.url, status: net.status, phones: phones.size }) },
  shift: { get: () => LV + 1 },
});

openRoom();
LV = Math.max(0, Math.min(LAST, (Number(params.get('shift')) || 1) - 1));
reset();
scene = params.get('scene') || 'title';
if (scene === 'play' && !roster.length) { join(KEYSETS[0]); if (params.get('solo') !== '1') join(KEYSETS[1]); reset(); }
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
