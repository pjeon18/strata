// Loadouts and the ammo pool. One energy bar feeds both guns; it refills
// fast once you've held fire for a moment, so it caps spam without nagging.
export const LOADOUTS = {
  rapid: {
    name: 'Rapid', role: 'All-rounder', blurb: 'Places one block at a time and fires very quickly. It is the most balanced choice.',
    build: { rate: 0.085, cost: 1.5, pattern: 'single' }, blast: { kind: 'bolt', rate: 0.16, cost: 2.5 },
    stats: { 'Fire rate': 5, 'Blocks per shot': 1, Blaster: 3 },
  },
  cross: {
    name: 'Cross', role: 'Builder', blurb: 'Fires more slowly, but every shot places five blocks in a plus shape. It is the fastest way to cover a layer.',
    build: { rate: 0.34, cost: 6, pattern: 'cross' }, blast: { kind: 'bolt', rate: 0.22, cost: 2.5 },
    stats: { 'Fire rate': 2, 'Blocks per shot': 5, Blaster: 2 },
  },
  laser: {
    name: 'Laser', role: 'Sniper', blurb: 'Places blocks one at a time. The blaster is a laser that fires slowly but cuts through every loose block and enemy in a straight line.',
    build: { rate: 0.11, cost: 1.5, pattern: 'single' }, blast: { kind: 'laser', rate: 0.55, cost: 10 },
    stats: { 'Fire rate': 4, 'Blocks per shot': 1, Blaster: 5 },
  },
  bomber: {
    name: 'Bomber', role: 'Breaker', blurb: 'Places blocks a little slowly. The blaster lobs a bomb that breaks the block it hits and every block touching its six faces, and it stuns anyone caught in the blast.',
    build: { rate: 0.13, cost: 1.5, pattern: 'single' }, blast: { kind: 'bomb', rate: 0.9, cost: 14 },
    stats: { 'Fire rate': 3, 'Blocks per shot': 1, Blaster: 5 },
  },
};

// how long a hit ship stays stunned, by what hit it (versus)
export const STUN = { bolt: 0.6, laser: 1.2, bomb: 1.5 };

export const MAX_ENERGY = 120, RECHARGE_DELAY = 1.8, RECHARGE_RATE = 95;

export class Energy {
  constructor() { this.reset(); }
  reset() { this.v = MAX_ENERGY; this.idle = 9; this.infinite = 0; this.empty = 0; }
  use(cost) {
    if (this.infinite > 0) return true;
    if (this.v < cost) { this.empty = 0.4; return false; }
    this.v -= cost; this.idle = 0;
    return true;
  }
  update(dt) {
    this.idle += dt; this.infinite = Math.max(0, this.infinite - dt); this.empty = Math.max(0, this.empty - dt);
    if (this.idle > RECHARGE_DELAY) this.v = Math.min(MAX_ENERGY, this.v + RECHARGE_RATE * dt);
  }
  get frac() { return this.infinite > 0 ? 1 : this.v / MAX_ENERGY; }
  get charging() { return this.infinite <= 0 && this.idle > RECHARGE_DELAY && this.v < MAX_ENERGY; }
}

// cells a build shot fills, in the plane facing the hit normal
export function pattern(kind, n) {
  const [a, b] = n[0] ? [[0, 1, 0], [0, 0, 1]] : n[1] ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
  const at = (u, v) => [a[0] * u + b[0] * v, a[1] * u + b[1] * v, a[2] * u + b[2] * v];
  if (kind === 'cross') return [[0, 0, 0], at(1, 0), at(-1, 0), at(0, 1), at(0, -1)];
  if (kind === 'big') { const out = []; for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) out.push(at(u, v)); return out.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) - Math.abs(q[0]) - Math.abs(q[1]) - Math.abs(q[2])); }
  return [[0, 0, 0]];
}
