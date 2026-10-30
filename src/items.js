import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as G from './grid.js';
import { paint } from './look.js';
import * as FX from './fx.js';

// Power-ups float around the core. Fly through one to hold it (one slot),
// press E to use it.
export const ITEMS = {
  big: { name: 'Big Block', color: 0xffb02e, blurb: 'Your next five shots place 3×3 blocks.', modes: ['survival'] },
  infinite: { name: 'Infinite Ammo', color: 0x33d69f, dur: 8, blurb: 'Your ammo is unlimited for 8 seconds.' },
  boost: { name: 'Super Speed', color: 0x4fb3ff, dur: 6, blurb: 'You fly almost twice as fast for 6 seconds.' },
  smoke: { name: 'Smoke', color: 0x9aa3b8, blurb: 'Anything inside the smoke stops working.' },
  shield: { name: 'Shield', color: 0xff7ac0, dur: 10, blurb: 'Meteors break against you for 10 seconds.' },
};

export const group = new THREE.Group();
export const pickups = [];
export const smokes = [];

const boxGeo = new RoundedBoxGeometry(0.95, 0.95, 0.95, 3, 0.26);
const haloGeo = new THREE.TorusGeometry(0.95, 0.04, 8, 48);
const mats = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, paint(v.color, { roughness: 0.25, rim: 0.6, emissive: v.color, emissiveIntensity: 0.25 })]));
const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5) });
const LIFE = 30, MAX = 3;

let nextId = 1;
// returns { id, kind, pos } so a host can tell guests about it
export function spawn(game) {
  if (pickups.length >= MAX) return null;
  const kinds = Object.keys(ITEMS).filter(k => !ITEMS[k].modes || ITEMS[k].modes.includes(game));
  const kind = kinds[(Math.random() * kinds.length) | 0];
  const r = Math.cbrt(G.coreCount) * 0.8 + 6 + Math.random() * 10;
  const pos = new THREE.Vector3().randomDirection().multiplyScalar(r);
  pos.y = THREE.MathUtils.clamp(pos.y, -8, 12);
  return spawnAt(nextId++, kind, pos);
}
export function spawnAt(id, kind, pos) {
  pos = new THREE.Vector3(pos.x, pos.y, pos.z);
  const g = new THREE.Group();
  const box = new THREE.Mesh(boxGeo, mats[kind]); box.castShadow = true;
  const halo = new THREE.Mesh(haloGeo, haloMat);
  g.add(box, halo); g.position.copy(pos);
  group.add(g);
  pickups.push({ id, kind, g, box, halo, pos, age: 0 });
  FX.puff(pos, 0xffffff, 6, 1, 0.6);
  return { id, kind, pos: { x: pos.x, y: pos.y, z: pos.z } };
}
// take whatever pickup is within reach of p (host side); returns { id, kind }
export function grab(p) {
  const k = pickups.findIndex(it => it.g.position.distanceTo(p) < 1.8);
  if (k < 0) return null;
  const it = pickups[k];
  take(k);
  return { id: it.id, kind: it.kind };
}
export function removeId(id) { const k = pickups.findIndex(it => it.id === id); if (k >= 0) take(k); }
function take(k) {
  const it = pickups[k];
  FX.burst(it.g.position, ITEMS[it.kind].color, 14, 8, 0.25);
  group.remove(it.g); pickups.splice(k, 1);
}

// returns the kind collected this frame, if any
export function update(dt, t, shipPos, canCollect) {
  let got = null;
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; p.age += dt;
    p.g.position.y = p.pos.y + Math.sin(t * 2 + k) * 0.25;
    p.box.rotation.set(t * 0.7, t * 1.1, 0);
    p.halo.rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 1.6, 0);
    // last five seconds: blink before vanishing
    p.g.visible = LIFE - p.age > 5 || Math.floor(t * 6) % 2 === 0;
    if (p.age > LIFE) { group.remove(p.g); pickups.splice(k, 1); continue; }
    if (!got && canCollect && p.g.position.distanceTo(shipPos) < 1.8) {
      got = p.kind;
      FX.burst(p.g.position, ITEMS[p.kind].color, 14, 8, 0.25); FX.ring(p.g.position, new THREE.Vector3(0, 1, 0), ITEMS[p.kind].color, 3, 0.35);
      group.remove(p.g); pickups.splice(k, 1);
    }
  }
  for (let k = smokes.length - 1; k >= 0; k--) {
    const s = smokes[k]; s.t -= dt;
    const grow = Math.min(1, (9 - s.t) * 3), fade = Math.min(1, s.t / 1.2);
    s.g.scale.setScalar(Math.max(0.01, grow * fade) * s.r);
    s.g.rotation.y += dt * 0.15;
    if (s.t <= 0) { group.remove(s.g); smokes.splice(k, 1); }
  }
  return got;
}

const puffGeo = new THREE.IcosahedronGeometry(1, 2);
const smokeMat = paint(0xe9edf5, { roughness: 1, rim: 0.15, emissive: 0xffffff, emissiveIntensity: 0.2, transparent: true, opacity: 0.94 });
export function throwSmoke(pos) {
  const g = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(puffGeo, smokeMat);
    const d = new THREE.Vector3().randomDirection().multiplyScalar(0.55 * Math.random());
    m.position.copy(d); m.scale.setScalar(0.35 + Math.random() * 0.3);
    g.add(m);
  }
  g.position.copy(pos); g.scale.setScalar(0.01);
  group.add(g);
  smokes.push({ g, pos: pos.clone(), r: 6.5, t: 9 });
}
export const inSmoke = p => smokes.some(s => s.t > 0.6 && p.distanceTo(s.pos) < s.r * 0.85);

export function clear() {
  for (const p of pickups) group.remove(p.g);
  for (const s of smokes) group.remove(s.g);
  pickups.length = 0; smokes.length = 0;
}
