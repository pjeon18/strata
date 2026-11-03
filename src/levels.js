// Survival levels: a two-minute clock, meteors in waves. Later levels send
// waves more often, bigger, and with more fast rocks. Score sets the stars.
// Star lines ≈ 3, 4, 5 sealed layers on the one-block core; checked against simulated runs (CONCEPT.md D17).
export const LEVELS = [
  { id: 1, name: 'Clear Skies', blurb: 'Meteors come in small waves, and most of them are big and slow. This is a good place to learn how to seal a layer.',
    time: 120, firstWave: 7, every: 15, size: [1, 2], mix: { slow: 0.6, normal: 0.4, fast: 0 }, speed: 5, nibblers: 0, nibbleFrom: 999,
    stars: [1500, 4000, 9000] },
  { id: 2, name: 'Crosswinds', blurb: 'The waves are bigger and include fast meteors. After 30 seconds, a nibbler starts eating your loose blocks.',
    time: 120, firstWave: 6, every: 11, size: [2, 3], mix: { slow: 0.3, normal: 0.45, fast: 0.25 }, speed: 6, nibblers: 1, nibbleFrom: 30,
    stars: [1500, 4000, 9000] },
  { id: 3, name: 'Meteor Storm', blurb: 'Each wave brings four to six meteors, and most of them are fast. Two nibblers join after 20 seconds.',
    time: 120, firstWave: 5, every: 8.5, size: [4, 6], mix: { slow: 0.15, normal: 0.35, fast: 0.5 }, speed: 7, nibblers: 2, nibbleFrom: 20,
    stars: [1500, 4000, 9000] },
];

export function pickKind(mix, rnd = Math.random) {
  let r = rnd();
  for (const [k, w] of Object.entries(mix)) { if ((r -= w) <= 0) return k; }
  return 'normal';
}

// Daily challenge: Crosswinds rules on a seed from today's date, so the
// meteors come the same way for everyone; the best score is kept per day.
export function daily(now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const label = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { ...LEVELS[1], id: 'daily', name: `Daily · ${label}`, short: label, key, seed: [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
    blurb: 'Everyone gets the same meteors today, with Crosswinds rules and its layer modifiers. Your best score today is kept.' };
}
// a small seeded random (mulberry32)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Plane colours: cosmetic, unlocked by total stars across the three levels
export const PLANES = [
  { name: 'Classic', accent: 0x1ec2d4, ring: 0x6ff3ff, stars: 0 },
  { name: 'Sunset', accent: 0xff7a3d, ring: 0xffc08a, stars: 2 },
  { name: 'Lilac', accent: 0xa98bff, ring: 0xd9ccff, stars: 4 },
  { name: 'Mint', accent: 0x2fd39a, ring: 0xa8ffd8, stars: 6 },
  { name: 'Gold', accent: 0xffb81f, ring: 0xfff0a0, stars: 9 },
];
export const totalStars = () => [1, 2, 3].reduce((n, id) => n + bestStars(id), 0);

export const starsFor = (level, score) => level.stars.filter(s => score >= s).length;

export function bestStars(id) {
  try { return Number(localStorage.getItem(`strata-stars-${id}`) || 0); } catch { return 0; }
}
export function saveStars(id, n) {
  try { if (n > bestStars(id)) localStorage.setItem(`strata-stars-${id}`, String(n)); } catch {}
}
