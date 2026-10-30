import * as THREE from 'three';
import * as G from './grid.js';
import { PAL, paint, fxOnly } from './look.js';
import * as FX from './fx.js';

// Meteors come in three kinds. A thin ring sits still on the target and
// starts blinking once impact is close. They smash loose blocks; hitting bare
// core cracks it. Nibblers: drones that perch on loose blocks and eat them.

export const KINDS = {
  slow: { r: 1.3, speed: 0.62, hp: 3, smash: 2.5, color: 0x7d5f9c, trail: 0.55 },
  normal: { r: 0.95, speed: 1, hp: 2, smash: 1.9, color: 0x8a6aa6, trail: 0.4 },
  fast: { r: 0.6, speed: 1.8, hp: 1, smash: 1.4, color: 0xd2644a, trail: 0.28 },
};
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const rockMats = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, paint(v.color, { roughness: 0.75, rim: 0.3 })]));
const markGeo = new THREE.RingGeometry(0.5, 0.6, 40);
const BLINK_ETA = 1.6; // seconds out when the ring starts blinking

export const group = new THREE.Group();
export const meteors = [];
export const drones = [];

function surfaceTarget() {
  // prefer loose blocks (they're what you'd lose), else a bare core face
  const loose = G.looseCells();
  const a = G.analyze();
  if (loose.length && Math.random() < 0.6) {
    const i = loose[(Math.random() * loose.length) | 0];
    return new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i));
  }
  if (a.faces.length) {
    const f = a.faces[(Math.random() * a.faces.length) | 0];
    return new THREE.Vector3(f[0] + f[3] * 0.5, f[1] + f[4] * 0.5, f[2] + f[5] * 0.5);
  }
  return new THREE.Vector3();
}

export function spawnMeteor(speed, kind = 'normal') {
  const K = KINDS[kind];
  const target = surfaceTarget();
  const dir = new THREE.Vector3().randomDirection();
  dir.y = Math.abs(dir.y) * 0.8 + 0.1; dir.normalize();
  const pos = target.clone().addScaledVector(dir, 42);
  const m = new THREE.Mesh(rockGeo, rockMats[kind]); m.castShadow = true; m.position.copy(pos); m.scale.setScalar(K.r);
  const mark = fxOnly(new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.coral).multiplyScalar(1.3), transparent: true, opacity: 0.9, depthTest: false })));
  mark.scale.setScalar(K.r * 1.15); mark.renderOrder = 15;
  mark.position.copy(target).addScaledVector(dir, 0.6); mark.lookAt(target.clone().add(dir.clone().multiplyScalar(2)));
  group.add(m, mark);
  meteors.push({ m, mark, kind, K, pos, vel: dir.clone().multiplyScalar(-speed * K.speed), target, hp: K.hp, spin: new THREE.Vector3().randomDirection(), age: 0 });
}

const droneBody = new THREE.SphereGeometry(0.38, 18, 12), droneEye = new THREE.SphereGeometry(0.13, 12, 8);
export function spawnDrone() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(droneBody, paint(0x2d5566)); b.castShadow = true; g.add(b);
  const e = new THREE.Mesh(droneEye, paint(PAL.coral, { emissive: new THREE.Color(PAL.coral), emissiveIntensity: 0.5 })); e.position.z = 0.32; g.add(e);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36), paint(0x2d5566)); a.position.set(s * 0.18, 0.42, 0); a.rotation.z = -s * 0.4; g.add(a);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.06), paint(PAL.sand)); t.position.set(s * 0.26, 0.6, 0); g.add(t);
  }
  const pos = new THREE.Vector3().randomDirection().multiplyScalar(38);
  g.position.copy(pos);
  group.add(g);
  drones.push({ g, pos, vel: new THREE.Vector3(), target: -1, perch: null, chew: 0, hp: 1, bob: Math.random() * 6 });
}

function kill(list, k) {
  const o = list[k];
  if (o.m) group.remove(o.m, o.mark); else group.remove(o.g);
  list.splice(k, 1);
}

// hooks: { impact(point, crackedCore), destroyBlock(i), inSmoke(pos) }
export function update(dt, t, hooks, shipPos, onShipHit) {
  for (let k = meteors.length - 1; k >= 0; k--) {
    const o = meteors[k]; o.age += dt;
    o.pos.addScaledVector(o.vel, dt);
    o.m.position.copy(o.pos);
    o.m.rotateOnAxis(o.spin, dt * 2.5);
    // still while far; blinks once impact is close
    const eta = o.pos.distanceTo(o.target) / o.vel.length();
    o.eta = eta;
    o.mark.visible = eta > BLINK_ETA || Math.floor(t * 9) % 2 === 0;
    if (Math.random() < 0.7) FX.dot(o.pos.clone().addScaledVector(o.vel, -0.06), Math.random() < 0.5 ? PAL.orange : PAL.sand, o.K.trail, 0.35);
    if (o.pos.distanceTo(shipPos) < 0.9 + o.K.r) { onShipHit(o.pos, o); FX.burst(o.pos, o.K.color, 14, 9, 0.3); kill(meteors, k); continue; }
    const cell = [Math.round(o.pos.x), Math.round(o.pos.y), Math.round(o.pos.z)];
    if (G.solid(...cell) || o.pos.distanceTo(o.target) < 0.4) {
      // smash loose blocks in radius; a bare core cell nearby takes a crack
      let cracked = false;
      const R = Math.ceil(o.K.smash);
      for (let x = cell[0] - R; x <= cell[0] + R; x++) for (let y = cell[1] - R; y <= cell[1] + R; y++) for (let z = cell[2] - R; z <= cell[2] + R; z++) {
        const d = Math.hypot(x - o.pos.x, y - o.pos.y, z - o.pos.z);
        if (d > o.K.smash + 0.2) continue;
        if (G.get(x, y, z) === G.LOOSE && d < o.K.smash) hooks.destroyBlock(G.idx(x, y, z));
        else if (G.get(x, y, z) === G.CORE && G.exposed[G.idx(x, y, z)] && d < 1.3) cracked = true;
      }
      hooks.impact(o.pos.clone(), cracked);
      kill(meteors, k);
    }
  }

  for (let k = drones.length - 1; k >= 0; k--) {
    const d = drones[k];
    d.bob += dt;
    if (d.target < 0 || G.cells[d.target] !== G.LOOSE) {
      const loose = G.looseCells();
      d.target = -1; d.perch = null; d.chew = 0;
      if (loose.length) {
        // nearest loose block, so they work along your shell
        let best = 1e9;
        for (const i of loose) { const q = (G.cx(i) - d.pos.x) ** 2 + (G.cy(i) - d.pos.y) ** 2 + (G.cz(i) - d.pos.z) ** 2; if (q < best) { best = q; d.target = i; } }
        const i = d.target, c = new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i));
        // perch on an open side
        for (const [x, y, z] of G.D6) if (!G.solid(G.cx(i) + x, G.cy(i) + y, G.cz(i) + z)) { d.perch = c.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(0.9)); break; }
      }
    }
    const blind = hooks.inSmoke?.(d.pos);
    if (blind) { d.vel.multiplyScalar(Math.exp(-3 * dt)); d.pos.addScaledVector(d.vel, dt); d.g.position.copy(d.pos); d.g.rotation.y += dt * 4; continue; }
    const goal = d.perch || d.pos.clone().normalize().multiplyScalar(14).applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.5);
    const to = goal.clone().sub(d.pos);
    const dist = to.length();
    d.vel.lerp(to.normalize().multiplyScalar(Math.min(7, dist * 3)), 1 - Math.exp(-3 * dt));
    d.pos.addScaledVector(d.vel, dt);
    d.g.position.copy(d.pos); d.g.position.y += Math.sin(d.bob * 4) * 0.06;
    if (d.target >= 0) d.g.lookAt(G.cx(d.target), G.cy(d.target), G.cz(d.target));
    if (d.perch && dist < 0.35) {
      d.chew += dt;
      d.g.rotation.z = Math.sin(t * 40) * 0.15;
      if (Math.random() < 0.25) FX.dot(d.pos.clone().lerp(new THREE.Vector3(G.cx(d.target), G.cy(d.target), G.cz(d.target)), 0.6), PAL.mine, 0.1, 0.3);
      if (d.chew > 2.2) { hooks.destroyBlock(d.target); d.target = -1; }
    }
  }
}

// projectile hit test against threats; returns true if something was hit
export function hitTest(p, r, onKill) {
  for (let k = meteors.length - 1; k >= 0; k--) {
    const o = meteors[k];
    if (o.pos.distanceTo(p) < r + o.K.r) {
      o.hp--; FX.burst(p, o.K.color, 6, 6, 0.25); o.m.scale.setScalar(o.K.r * (0.65 + 0.35 * o.hp / o.K.hp));
      if (o.hp <= 0) { onKill('meteor', o.pos.clone()); kill(meteors, k); }
      return true;
    }
  }
  for (let k = drones.length - 1; k >= 0; k--) {
    const d = drones[k];
    if (d.pos.distanceTo(p) < r + 0.5) { onKill('drone', d.pos.clone()); kill(drones, k); return true; }
  }
  return false;
}

// laser: everything within reach of segment a→b takes `dmg`
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
export function laserHits(a, b, dmg, onKill) {
  for (let k = meteors.length - 1; k >= 0; k--) {
    const o = meteors[k];
    if (segDist(o.pos, a, b) > o.K.r + 0.35) continue;
    o.hp -= dmg; FX.burst(o.pos, o.K.color, 8, 7, 0.25);
    if (o.hp <= 0) { onKill('meteor', o.pos.clone()); kill(meteors, k); } else o.m.scale.setScalar(o.K.r * (0.65 + 0.35 * o.hp / o.K.hp));
  }
  for (let k = drones.length - 1; k >= 0; k--) {
    const d = drones[k];
    if (segDist(d.pos, a, b) < 0.8) { onKill('drone', d.pos.clone()); kill(drones, k); }
  }
}
export { segDist };

// bomb: everything within r takes dmg
export function areaHit(p, r, dmg, onKill) {
  for (let k = meteors.length - 1; k >= 0; k--) {
    const o = meteors[k];
    if (o.pos.distanceTo(p) > r + o.K.r) continue;
    o.hp -= dmg;
    if (o.hp <= 0) { onKill('meteor', o.pos.clone()); kill(meteors, k); } else o.m.scale.setScalar(o.K.r * (0.65 + 0.35 * o.hp / o.K.hp));
  }
  for (let k = drones.length - 1; k >= 0; k--) {
    if (drones[k].pos.distanceTo(p) < r + 0.5) { onKill('drone', drones[k].pos.clone()); kill(drones, k); }
  }
}

export function clear() { while (meteors.length) kill(meteors, 0); while (drones.length) kill(drones, 0); }
