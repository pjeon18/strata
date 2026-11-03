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

// Contact shading: each block knows which of its 12 edge-neighbours (the
// cells diagonal to it across an edge) are solid, as a 12-bit mask. Where one
// is, the face beside that edge darkens toward it, so steps and inside
// corners read as depth instead of one flat colour. The bit order here and in
// the shader is: xy pairs 0-3, xz 4-7, yz 8-11; within a pair the first
// axis's sign is the 2 bit and the second's is the 1 bit.
const EDGES = [];
for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
  const o = [0, 0, 0]; o[a] = sa; o[b] = sb; EDGES.push(o);
}
const aoVert = [
  ['#include <common>', '#include <common>\nattribute float aoMask; varying float vAoMask; varying vec3 vLoc; varying vec3 vNrmO;'],
  ['#include <begin_vertex>', '#include <begin_vertex>\nvAoMask = aoMask; vLoc = position; vNrmO = normal;'],
];
const aoFrag = [
  ['#include <common>', `#include <common>
    varying float vAoMask; varying vec3 vLoc; varying vec3 vNrmO;
    float aoEdge(vec3 n, vec3 e) {
      vec3 o = n + e; int idx;
      if (o.z == 0.) idx = (o.x > 0. ? 2 : 0) + (o.y > 0. ? 1 : 0);
      else if (o.y == 0.) idx = 4 + (o.x > 0. ? 2 : 0) + (o.z > 0. ? 1 : 0);
      else idx = 8 + (o.y > 0. ? 2 : 0) + (o.z > 0. ? 1 : 0);
      if (((int(vAoMask + .5) >> idx) & 1) == 0) return 1.;
      return mix(.52, 1., smoothstep(0., .45, .5 - dot(vLoc, e)));
    }`],
  ['#include <color_fragment>', `#include <color_fragment>
    vec3 an = abs(vNrmO);
    vec3 fn = an.x > an.y && an.x > an.z ? vec3(sign(vNrmO.x), 0., 0.) : an.y > an.z ? vec3(0., sign(vNrmO.y), 0.) : vec3(0., 0., sign(vNrmO.z));
    vec3 t1 = fn.x != 0. ? vec3(0., 1., 0.) : vec3(1., 0., 0.), t2 = fn.z != 0. ? vec3(0., 1., 0.) : vec3(0., 0., 1.);
    diffuseColor.rgb *= aoEdge(fn, t1) * aoEdge(fn, -t1) * aoEdge(fn, t2) * aoEdge(fn, -t2);`],
];
function withAO(mat) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = sh => {
    prev(sh);
    for (const [a, b] of aoVert) sh.vertexShader = sh.vertexShader.replace(a, b);
    for (const [a, b] of aoFrag) sh.fragmentShader = sh.fragmentShader.replace(a, b);
  };
  mat.customProgramCacheKey = () => `ao${key}`;
  return mat;
}
function aoMaskOf(i) {
  const x = G.cx(i), y = G.cy(i), z = G.cz(i);
  let m = 0;
  for (let k = 0; k < 12; k++) { const o = EDGES[k]; if (G.solid(x + o[0], y + o[1], z + o[2])) m |= 1 << k; }
  return m;
}

const mk = (geo, mat, max) => {
  geo.setAttribute('aoMask', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
  const m = new THREE.InstancedMesh(geo, withAO(mat), max);
  m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color());
  return m;
};

// core is matte stone with a soft sheen; loose bricks are glossy toy plastic
export const core = mk(box, paint(0xffffff, { roughness: 0.8, rim: 0.22 }), MAX_CORE);
const bareMat = paint(0xffffff, { roughness: 0.8, rim: 0.22, emissive: new THREE.Color(0xfff2c0), emissiveIntensity: 0 });
export const bare = mk(box.clone(), bareMat, MAX_CORE);
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

// ---------- cracks ----------
// A meteor that reaches bare core leaves a dark crack on the face it hit. A
// crack hides while something sits in front of it and goes for good once the
// face is sealed under a new layer, which is also when the life comes back.
const crackTex = Array.from({ length: 3 }, (_, v) => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 97 + v * 31; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.lineCap = g.lineJoin = 'round';
  const branch = (x, y, a, len, w) => {
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5 && len > 4; k++) {
      a += (r() - 0.5) * 1.1; const step = len / 5;
      x += Math.cos(a) * step; y += Math.sin(a) * step; g.lineTo(x, y);
      if (r() < 0.35 && w > 1.6) { g.stroke(); branch(x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * 0.45, w * 0.6); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  // a pale rim under the dark line reads as a broken edge
  for (const [col, extra] of [['rgba(255,255,255,.6)', 4], ['#2a1a2e', 0]]) {
    g.strokeStyle = col; s = 97 + v * 31;
    const arms = 4 + Math.floor(r() * 2);
    for (let k = 0; k < arms; k++) branch(64, 64, (k / arms) * Math.PI * 2 + r() * 0.8, 50 + r() * 16, 9 + extra - k * 0.7);
  }
  g.fillStyle = '#2a1a2e'; g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
const crackGeo = new THREE.PlaneGeometry(0.98, 0.98);
const crackMats = crackTex.map(map => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const cracks = [];
// f: [x, y, z, nx, ny, nz], an open face of a core cell
export function crack(f) {
  const m = new THREE.Mesh(crackGeo, crackMats[(Math.random() * 3) | 0]);
  const n = new THREE.Vector3(f[3], f[4], f[5]);
  m.position.set(f[0], f[1], f[2]).addScaledVector(n, 0.502);
  m.lookAt(m.position.clone().add(n));
  m.rotateZ(Math.random() * Math.PI * 2);
  m.renderOrder = 2;
  group.add(m);
  cracks.push({ m, front: [f[0] + f[3], f[1] + f[4], f[2] + f[5]] });
}
function pruneCracks() {
  for (let k = cracks.length - 1; k >= 0; k--) {
    const c = cracks[k], front = G.get(...c.front);
    if (front === G.CORE) { group.remove(c.m); cracks.splice(k, 1); continue; }
    c.m.visible = front === G.AIR;
  }
}
export function clearCracks() { for (const c of cracks) group.remove(c.m); cracks.length = 0; }

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
  m.geometry.attributes.aoMask.setX(s, aoMaskOf(i));
}

export function sync(t) {
  pruneCracks();
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
  for (const m of [core, bare, loose]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.geometry.attributes.aoMask.needsUpdate = true; }
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
