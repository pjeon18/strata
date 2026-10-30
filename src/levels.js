// Survival levels: a two-minute clock, meteors in waves. Later levels send
// waves more often, bigger, and with more fast rocks. Score sets the stars.
// Star lines ≈ 1, 2, 3 sealed layers; checked against simulated runs (CONCEPT.md D11).
export const LEVELS = [
  { id: 1, name: 'Clear Skies', blurb: 'Meteors come in small waves, and most of them are big and slow. This is a good place to learn how to seal a layer.',
    time: 120, firstWave: 7, every: 15, size: [1, 2], mix: { slow: 0.6, normal: 0.4, fast: 0 }, speed: 5, nibblers: 0, nibbleFrom: 999,
    stars: [500, 2000, 6500] },
  { id: 2, name: 'Crosswinds', blurb: 'The waves are bigger and include fast meteors. After 30 seconds, a nibbler starts eating your loose blocks.',
    time: 120, firstWave: 6, every: 11, size: [2, 3], mix: { slow: 0.3, normal: 0.45, fast: 0.25 }, speed: 6, nibblers: 1, nibbleFrom: 30,
    stars: [500, 2000, 6500] },
  { id: 3, name: 'Meteor Storm', blurb: 'Each wave brings four to six meteors, and most of them are fast. Two nibblers join after 20 seconds.',
    time: 120, firstWave: 5, every: 8.5, size: [4, 6], mix: { slow: 0.15, normal: 0.35, fast: 0.5 }, speed: 7, nibblers: 2, nibbleFrom: 20,
    stars: [500, 2000, 6500] },
];

export function pickKind(mix) {
  let r = Math.random();
  for (const [k, w] of Object.entries(mix)) { if ((r -= w) <= 0) return k; }
  return 'normal';
}

export const starsFor = (level, score) => level.stars.filter(s => score >= s).length;

export function bestStars(id) {
  try { return Number(localStorage.getItem(`strata-stars-${id}`) || 0); } catch { return 0; }
}
export function saveStars(id, n) {
  try { if (n > bestStars(id)) localStorage.setItem(`strata-stars-${id}`, String(n)); } catch {}
}
