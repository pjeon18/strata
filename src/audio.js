// Tiny synth for feedback sounds only. The place blip climbs in pitch as the
// layer fills, so you can hear yourself closing in on a seal.
let ctx = null, master = null;
let muted = false;
try { muted = localStorage.getItem('strata-muted') === '1'; } catch {}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('strata-muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
  music.muted = m;
}

// Music: "Slam" by Shane Ivers (CC BY 4.0, credit on the pause screen).
// Browsers only allow audio after a click, so it starts on the first one.
const music = new Audio(`${import.meta.env.BASE_URL}music/slam.mp3`);
music.loop = true; music.preload = 'auto'; music.muted = muted;
const LEVEL = { normal: 0.32, quiet: 0.1 };
let target = LEVEL.normal, fade = 0;
export const musicState = () => ({ playing: !music.paused, volume: +music.volume.toFixed(2), muted: music.muted });
export function startMusic() {
  if (!music.paused) return;
  music.volume = 0;
  music.play().then(() => musicLevel('normal')).catch(() => {});
}
// glide the volume instead of jumping: pause ducks it, resume brings it back
export function musicLevel(which) {
  target = LEVEL[which];
  clearInterval(fade);
  fade = setInterval(() => {
    const v = music.volume + (target - music.volume) * 0.18;
    music.volume = Math.abs(v - target) < 0.005 ? target : v;
    if (music.volume === target) clearInterval(fade);
  }, 30);
}
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'triangle', vol = 0.2, when = 0, slide = 0) {
  const c = ac(), t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, freq = 1200, when = 0) {
  const c = ac(), t = c.currentTime + when;
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start(t);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
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
  impact: () => { noise(0.4, 0.3, 700); tone(90, 0.35, 'sine', 0.25, 0, 0.5); },
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
};
