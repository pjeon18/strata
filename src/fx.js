import * as THREE from 'three';
import { fxOnly } from './look.js';

// Cartoon FX: tumbling chunks, puffs that shrink away (no alpha fades, so
// they stay crisp), and shock rings for the big beats.
const MAX = 900;
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
const puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
for (const m of [chunkMesh, puffMesh]) { m.frustumCulled = false; m.count = 0; m.setColorAt(0, new THREE.Color()); }

export const group = fxOnly(new THREE.Group());
group.add(chunkMesh, puffMesh);

const chunks = [], puffs = [], rings = [];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

export function burst(p, color, n = 10, speed = 7, size = 0.22) {
  for (let i = 0; i < n && chunks.length < MAX; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    chunks.push({ p: p.clone(), v, r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), life: 0.5 + Math.random() * 0.45, age: 0, s: size * (0.6 + Math.random() * 0.8), c: new THREE.Color(color) });
  }
}

export function puff(p, color = 0xffffff, n = 6, spread = 0.8, size = 0.5, life = 0.45) {
  for (let i = 0; i < n && puffs.length < MAX; i++) {
    const o = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread);
    puffs.push({ p: p.clone().add(o), v: o.clone().multiplyScalar(2.5), life: life * (0.7 + Math.random() * 0.6), age: 0, s: size * (0.6 + Math.random() * 0.7), c: new THREE.Color(color) });
  }
}

// trail dots: one small puff, no spread
export function dot(p, color, size = 0.14, life = 0.22) {
  if (puffs.length < MAX) puffs.push({ p: p.clone(), v: new THREE.Vector3(), life, age: 0, s: size, c: new THREE.Color(color) });
}

export function ring(p, normal, color = 0xffffff, radius = 9, life = 0.7) {
  // thin additive ring: reads as light, not as a solid hoop across the sky
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(p);
  m.lookAt(p.clone().add(normal));
  fxOnly(m); group.add(m);
  rings.push({ m, age: 0, life, radius });
}

// laser beam: a hot core inside a soft coloured sleeve, collapsing fast
const beams = [];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
beamGeo.rotateX(Math.PI / 2);
export function beam(a, b, color) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true }));
  const sleeve = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.set(0.06, 0.06, len); sleeve.scale.set(0.2, 0.2, len);
  g.add(core, sleeve);
  g.position.copy(a).lerp(b, 0.5); g.lookAt(b);
  fxOnly(g); group.add(g);
  beams.push({ g, core, sleeve, age: 0, life: 0.22, len });
}

export function update(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.age += dt;
    const k = 1 - b.age / b.life;
    if (k <= 0) { group.remove(b.g); beams.splice(i, 1); continue; }
    b.core.scale.set(0.06 * k, 0.06 * k, b.len); b.sleeve.scale.set(0.2 * (0.5 + k), 0.2 * (0.5 + k), b.len);
    b.sleeve.material.opacity = 0.55 * k;
  }
  let n = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i]; c.age += dt;
    if (c.age > c.life) { chunks.splice(i, 1); continue; }
    c.v.multiplyScalar(Math.exp(-2.2 * dt)); c.p.addScaledVector(c.v, dt);
    const k = 1 - (c.age / c.life) ** 2;
    tmpE.set(c.r.x * c.age, c.r.y * c.age, 0); tmpQ.setFromEuler(tmpE);
    tmpM.compose(c.p, tmpQ, tmpS.setScalar(c.s * k));
    chunkMesh.setMatrixAt(n, tmpM); chunkMesh.setColorAt(n, c.c); n++;
  }
  chunkMesh.count = n; chunkMesh.instanceMatrix.needsUpdate = true; chunkMesh.instanceColor.needsUpdate = true;
  n = 0;
  for (let i = puffs.length - 1; i >= 0; i--) {
    const c = puffs[i]; c.age += dt;
    if (c.age > c.life) { puffs.splice(i, 1); continue; }
    c.v.multiplyScalar(Math.exp(-4 * dt)); c.p.addScaledVector(c.v, dt);
    const k = c.age / c.life;
    const s = c.s * (k < 0.2 ? 0.6 + k * 2 : 1 - (k - 0.2) / 0.8);
    tmpM.compose(c.p, tmpQ.identity(), tmpS.setScalar(Math.max(0.001, s)));
    puffMesh.setMatrixAt(n, tmpM); puffMesh.setColorAt(n, c.c); n++;
  }
  puffMesh.count = n; puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor.needsUpdate = true;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt;
    const k = r.age / r.life;
    if (k >= 1) { group.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); continue; }
    const e = 1 - (1 - k) ** 3;
    r.m.scale.setScalar(0.5 + e * r.radius);
    r.m.material.opacity = (1 - k) * (1 - k);
  }
}

export function clear() { chunks.length = 0; puffs.length = 0; }
