// Sound: synthesised tones, started on the first input, muted on M.
import { tune } from './config';
import { audioContext } from './hook';

let audio: { ac: AudioContext; out: GainNode } | null = null;
/** True while the sound is muted. */
export let muted = false;

/** Creates the audio graph on first use and resumes a suspended context. */
export function startAudio(): void {
  if (!audio) {
    const ac = audioContext();
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out };
  }
  if (audio.ac.state === 'suspended') audio.ac.resume();
}
/** Mutes or unmutes; unmuted, the volume is the live tuning value. */
export function setMuted(m: boolean): void { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
addEventListener('tune', () => setMuted(muted));

/** One note that fades out over dur seconds. */
export function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, delay = 0): void {
  if (!audio || muted) return;
  const t = audio.ac.currentTime + delay, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}
/** A pitch glide from f0 to f1 over dur seconds. */
export function sweep(f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.25): void {
  if (!audio || muted) return;
  const t = audio.ac.currentTime, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}

/** The game's sound effects, by event. */
export const sfx = {
  pick: () => tone(560, 0.06, 'triangle', 0.25),
  place: () => tone(360, 0.07, 'triangle', 0.25),
  chop: () => { tone(170, 0.04, 'square', 0.15); tone(90, 0.05, 'triangle', 0.2); },
  chopped: () => { tone(660, 0.06, 'triangle', 0.2); tone(880, 0.08, 'triangle', 0.2, 0.06); },
  plop: () => sweep(300, 600, 0.12, 'sine', 0.25),
  serve: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.22, i * 0.07)); },
  buzz: () => tone(110, 0.18, 'sawtooth', 0.15),
  dash: () => sweep(500, 180, 0.15, 'sine', 0.2),
  toss: () => sweep(300, 700, 0.1, 'sine', 0.18),
  alarm: () => { tone(880, 0.12, 'square', 0.12); tone(660, 0.12, 'square', 0.12, 0.13); },
  gravOff: () => { sweep(400, 60, 0.9, 'sawtooth', 0.18); sweep(800, 1600, 1.2, 'sine', 0.1); },
  gravOn: () => { sweep(80, 300, 0.4, 'square', 0.15); tone(60, 0.3, 'sine', 0.35, 0.35); },
  land: () => tone(140, 0.05, 'triangle', 0.12),
  done: () => { tone(988, 0.1, 'sine', 0.2); tone(1318, 0.14, 'sine', 0.2, 0.1); },
  missed: () => { tone(300, 0.15, 'sawtooth', 0.12); tone(200, 0.25, 'sawtooth', 0.12, 0.15); },
  burn: () => tone(70, 0.4, 'sawtooth', 0.15),
  cheer: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.12, i * 0.05)); sweep(600, 1200, 0.3, 'triangle', 0.1); },
  thunk: () => { tone(90, 0.08, 'square', 0.12); tone(180, 0.05, 'triangle', 0.12, 0.05); },
  lost: () => sweep(900, 60, 0.6, 'sawtooth', 0.14),
  unlock: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, i * 0.08)); },
  select: () => tone(440, 0.05, 'triangle', 0.2),
};
