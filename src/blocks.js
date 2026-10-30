import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as G from './grid.js';
import { PAL, paint } from './look.js';

// Three instanced meshes:
//   core    – cemented, flat boxes, so a sealed layer reads as one carved mass
//   bare    – core still reachable by outside air; breathes softly
//   loose   – your placed blocks, rounded like toy bricks
const MAX_CORE = 40000, MAX_LOOSE = 12000;
const box = new THREE.BoxGeometry(1, 1, 1);
const brick = new RoundedBoxGeometry(0.98, 0.98, 0.98, 2, 0.12);

const mk = (geo, mat, max) => {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color());
  return m;
};

// core is matte stone with a soft sheen; loose bricks are glossy toy plastic
export const core = mk(box, paint(0xffffff, { roughness: 0.8, rim: 0.22 }), MAX_CORE);
const bareMat = paint(0xffffff, { roughness: 0.8, rim: 0.22, emissive: new THREE.Color(0xfff2c0), emissiveIntensity: 0 });
export const bare = mk(box, bareMat, MAX_CORE);
export const loose = mk(brick, paint(0xffffff, { roughness: 0.28, rim: 0.5 }), MAX_LOOSE);
export const group = new THREE.Group();
group.add(core, bare, loose);

const which = new Uint8Array(G.N ** 3);      // 0 none, 1 core, 2 bare, 3 loose
const slot = new Int32Array(G.N ** 3);
const meshOf = [null, core, bare, loose];

const hash = i => { let h = i * 2654435761 >>> 0; h ^= h >>> 15; return (h & 1023) / 1023; };
const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), white = new THREE.Color(0xffffff);

function baseColor(i, kind, out) {
  const j = (hash(i) - 0.5) * 0.05;
  if (kind === 3) out.setHex(G.owner[i] ? PAL.bot : PAL.mine);
  else out.setHex(PAL.strata[G.stratum[i] % PAL.strata.length]);
  return out.offsetHSL(0, 0, j);
}

// cell -> animation { t0, dur, kind: 'pop' | 'seal' }
const anims = new Map();
export function pop(i, t) { anims.set(i, { t0: t, dur: 0.22, kind: 'pop' }); }
export function seal(i, t, delay) { anims.set(i, { t0: t + delay, dur: 0.5, kind: 'seal' }); }

function animScale(a, t) {
  const k = (t - a.t0) / a.dur;
  if (k < 0) return a.kind === 'pop' ? 0 : 1;
  if (k >= 1) return 1;
  if (a.kind === 'pop') { // overshoot then settle
    const s = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
    return Math.max(0, s);
  }
  return 1 + Math.sin(k * Math.PI) * 0.16;
}

function write(i, t) {
  const m = meshOf[which[i]], s = slot[i];
  const a = anims.get(i);
  const sc = a ? animScale(a, t) : 1;
  tmpM.makeScale(sc, sc, sc).setPosition(G.cx(i), G.cy(i), G.cz(i));
  m.setMatrixAt(s, tmpM);
  baseColor(i, which[i], tmpC);
  if (a && a.kind === 'seal') {
    const k = (t - a.t0) / a.dur;
    if (k < 1) tmpC.lerp(white, k < 0 ? 0 : Math.max(0, 1 - k * 1.4));
  }
  m.setColorAt(s, tmpC);
}

export function sync(t) {
  core.count = bare.count = loose.count = 0;
  which.fill(0);
  const cells = G.cells, N = G.N;
  const steps = [1, -1, N, -N, N * N, -N * N];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    let kind;
    if (c === G.LOOSE) kind = 3;
    else {
      let visible = false;
      for (let d = 0; d < 6; d++) if (cells[i + steps[d]] !== G.CORE) { visible = true; break; }
      if (!visible) continue;
      kind = G.exposed[i] ? 2 : 1;
    }
    const m = meshOf[kind];
    which[i] = kind; slot[i] = m.count++;
    write(i, t);
  }
  for (const m of [core, bare, loose]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

export function update(t) {
  bareMat.emissiveIntensity = 0.12 + 0.12 * Math.sin(t * 3.4);
  if (!anims.size) return;
  for (const [i, a] of anims) {
    if (which[i]) write(i, t);
    if (t - a.t0 > a.dur) anims.delete(i);
  }
  for (const m of [core, bare, loose]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

// Aim preview: a crisp wire cube where the next block will land.
export function ghost() {
  const g = new THREE.Group();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: PAL.mine, transparent: true, opacity: 0.35, depthWrite: false }));
  edges.renderOrder = 10;
  g.add(fill, edges);
  return g;
}
