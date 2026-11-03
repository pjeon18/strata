// Tiny synth for feedback sounds only. The place blip climbs in pitch as the
// layer fills, so you can hear yourself closing in on a seal.
import { onPrefs } from './settings.js';

let ctx = null, master = null, muffler = null;
let muted = false, sfxVol = 0.8, musicVol = 0.8;
try { muted = localStorage.getItem('strata-muted') === '1'; } catch {}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('strata-muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5 * sfxVol, ctx.currentTime, 0.02);
  music.muted = m;
}

// Music: "Slam" by Shane Ivers (CC BY 4.0, credit on the pause screen).
// Browsers only allow audio after a click, so it starts on the first one.
const music = new Audio(`${import.meta.env.BASE_URL}music/slam.mp3`);
music.loop = true; music.preload = 'auto'; music.muted = muted;
const LEVEL = { normal: 0.32, quiet: 0.1 };
let target = LEVEL.normal, level = 'normal', fade = 0;
export const musicState = () => ({ playing: !music.paused, volume: +music.volume.toFixed(2), muted: music.muted });
export function startMusic() {
  if (!music.paused) return;
  music.volume = 0;
  music.play().then(() => musicLevel('normal')).catch(() => {});
}
// glide the volume instead of jumping: pause ducks it, resume brings it back
export function musicLevel(which) {
  level = which; target = LEVEL[which] * musicVol;
  clearInterval(fade);
  fade = setInterval(() => {
    const v = music.volume + (target - music.volume) * 0.18;
    music.volume = Math.abs(v - target) < 0.005 ? target : v;
    if (music.volume === target) clearInterval(fade);
  }, 30);
}
// a hit ducks the music and muffles the effects, then both come back
export function muffle(dur = 0.6) {
  const c = ac(), t = c.currentTime;
  muffler.frequency.cancelScheduledValues(t);
  muffler.frequency.setValueAtTime(480, t);
  muffler.frequency.setTargetAtTime(20000, t + dur * 0.4, dur * 0.35);
  if (music.paused) return;
  const back = target;
  music.volume = Math.min(music.volume, back * 0.35);
  setTimeout(() => { if (target === back) musicLevel(level); }, dur * 600);
}
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5 * sfxVol;
    // getting hit closes this filter for a moment: everything sounds underwater
    muffler = ctx.createBiquadFilter(); muffler.type = 'lowpass'; muffler.frequency.value = 20000;
    master.connect(muffler).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// where one-shot sounds go: the master, or a panner for sounds with a side
let out = null;
const dest = () => out || master;
function panned(pan, fn) { const c = ac(), p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master); out = p; fn(); out = null; }

function tone(freq, dur, type = 'triangle', vol = 0.2, when = 0, slide = 0) {
  const c = ac(), t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest()); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, freq = 1200, when = 0) {
  const c = ac(), t = c.currentTime + when;
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(dest()); s.start(t);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
// the settings sliders: effects scale the synth's master, music scales both duck levels
onPrefs((p, k) => {
  sfxVol = p.sfx; musicVol = p.music;
  if (master && !muted) master.gain.setTargetAtTime(0.5 * sfxVol, ctx.currentTime, 0.02);
  if (k === 'music' && !music.paused) musicLevel(level);
});

const note = (root, step) => root * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export const sfx = {
  unlock: () => ac(),
  fire: () => tone(880, 0.04, 'square', 0.03, 0, 0.6),
  place: progress => { const n = note(330, Math.floor(progress * 10)); tone(n, 0.09, 'triangle', 0.16); tone(n * 2, 0.05, 'sine', 0.05); },
  botPlace: progress => tone(note(110, Math.floor(progress * 10)), 0.07, 'square', 0.03),
  crit: () => [7, 5, 2, 0].forEach((s, i) => tone(note(196, s), 0.45, 'sawtooth', 0.07, i * 0.08)),
  fizzle: () => tone(220, 0.06, 'triangle', 0.06, 0, 0.7),
  blast: () => { noise(0.12, 0.12, 2400); tone(160, 0.12, 'square', 0.05, 0, 0.5); },
  pop: () => { noise(0.08, 0.1, 3000); tone(520, 0.08, 'triangle', 0.08, 0, 0.5); },
  seal: () => [0, 2, 4, 5, 7].forEach((s, i) => tone(note(392, s), 0.4, 'triangle', 0.14, i * 0.06)),
  impact: () => { noise(0.4, 0.3, 700); tone(90, 0.35, 'sine', 0.25, 0, 0.5); tone(48, 0.55, 'sine', 0.3, 0.02, 0.6); },
  crack: () => { noise(0.5, 0.35, 500); tone(70, 0.6, 'sawtooth', 0.12, 0, 0.6); },
  warn: () => { tone(660, 0.08, 'square', 0.04); tone(660, 0.08, 'square', 0.04, 0.12); },
  stun: () => tone(600, 0.4, 'triangle', 0.1, 0, 0.3),
  laser: () => { tone(1400, 0.22, 'sawtooth', 0.06, 0, 0.25); tone(700, 0.2, 'square', 0.04, 0, 0.3); },
  empty: () => tone(140, 0.05, 'square', 0.05),
  pickup: () => [0, 4, 7].forEach((s, i) => tone(note(523, s), 0.12, 'triangle', 0.12, i * 0.05)),
  use: () => { noise(0.25, 0.08, 4000); tone(300, 0.25, 'triangle', 0.1, 0, 2.2); },
  star: k => tone(note(660, k * 2), 0.5, 'triangle', 0.16),
  tick: () => tone(1046, 0.05, 'sine', 0.08),
  select: () => tone(880, 0.04, 'triangle', 0.06),
  // hit confirm: a dry tick; a kill adds a bright second note
  hit: () => tone(1900, 0.035, 'square', 0.035, 0, 0.8),
  kill: () => { tone(1900, 0.04, 'square', 0.04, 0, 0.8); tone(2600, 0.09, 'triangle', 0.06, 0.035); },
  // you got hit: a body thud, a crunch and a thin ringing tone
  hurt: () => { noise(0.3, 0.4, 900); tone(80, 0.3, 'sine', 0.35, 0, 0.45); tone(3100, 0.7, 'sine', 0.025, 0.04); },
  dash: () => { noise(0.22, 0.16, 5200); tone(240, 0.2, 'sawtooth', 0.04, 0, 2.6); },
  // pan: -1 left, 1 right, so a swoop sweeps across with you
  swoop: (pan = 0) => panned(pan, () => { noise(0.45, 0.12, 3600); tone(300, 0.5, 'triangle', 0.06, 0, 2); }),
  dashReady: () => tone(1320, 0.05, 'sine', 0.035),
  dodge: () => { tone(988, 0.12, 'triangle', 0.1); tone(1480, 0.22, 'triangle', 0.08, 0.06); noise(0.18, 0.05, 6000); },
};

// ---------- continuous sounds ----------
// Engine: a soft two-oscillator hum whose pitch and level follow your speed.
// Whistle: one voice for the nearest meteor, rising and panning as it closes.
let eng = null, whi = null;
function voices() {
  const c = ac();
  if (eng) return c;
  const mk = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  eng = { a: mk('sawtooth', 70), b: mk('triangle', 140), lp, g: c.createGain() };
  eng.g.gain.value = 0; eng.a.connect(lp); eng.b.connect(lp); lp.connect(eng.g).connect(master);
  whi = { o: mk('sine', 900), p: c.createStereoPanner(), g: c.createGain() };
  whi.g.gain.value = 0; whi.o.connect(whi.g).connect(whi.p).connect(master);
  return c;
}
// speed01: 0 still to 1 flat out (more while dashing); on: false fades it out
export function engine(speed01, on) {
  if (!ctx && !on) return;
  const c = voices(), t = c.currentTime, k = Math.min(1.6, speed01);
  eng.a.frequency.setTargetAtTime(62 + k * 48, t, 0.08); eng.b.frequency.setTargetAtTime(124 + k * 96, t, 0.08);
  eng.lp.frequency.setTargetAtTime(500 + k * 900, t, 0.1);
  eng.g.gain.setTargetAtTime(on ? 0.035 + k * 0.035 : 0, t, on ? 0.12 : 0.05);
}
// close01: 0 far to 1 about to land; pan: where it is on screen
export function whistle(close01, pan, on) {
  if (!ctx && !on) return;
  const c = voices(), t = c.currentTime, k = Math.max(0, Math.min(1, close01));
  whi.o.frequency.setTargetAtTime(700 + k * 900, t, 0.06);
  whi.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.06);
  whi.g.gain.setTargetAtTime(on ? k * k * 0.045 : 0, t, 0.08);
}
// Music that builds: brighter (pitched up a touch) and a little louder in the
// last 20 seconds or on your last life. k from 0 to 1.
let lift = 0;
export function musicLift(k) {
  if (Math.abs(k - lift) < 0.01) return;
  lift = k;
  music.preservesPitch = false; music.mozPreservesPitch = false; music.webkitPreservesPitch = false;
  music.playbackRate = 1 + 0.06 * k;
  LEVEL.normal = 0.32 * (1 + 0.3 * k);
  if (level === 'normal') musicLevel('normal');
}
