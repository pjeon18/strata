// Voxel world. Cells are centred on integer coords; cell (x,y,z) spans ±0.5.
//
// The layer rule: the core is SEALED when no outside air can reach any core
// face. Air flows face-to-face (6-connected), so blocks that meet only at an
// edge still seal, and a shell can sit anywhere: directly on the core, two
// cells out, lumpy, built over someone else's half-shell. Exactly "you can't
// see bare core from anywhere."

export const N = 72;
const H = N / 2;
export const AIR = 0, CORE = 1, LOOSE = 2;

export const cells = new Uint8Array(N * N * N);
export const stratum = new Uint8Array(N * N * N);
// who placed each loose block (player slot 0..3); versus splits a seal by this
export const owner = new Uint8Array(N * N * N);
const outside = new Uint8Array(N * N * N);
export const exposed = new Uint8Array(N * N * N);
const queue = new Int32Array(N * N * N);

export const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const STEP = [1, -1, N, -N, N * N, -N * N];

export const idx = (x, y, z) => (x + H) + (y + H) * N + (z + H) * N * N;
export const cx = i => (i % N) - H;
export const cy = i => (((i / N) | 0) % N) - H;
export const cz = i => ((i / (N * N)) | 0) - H;
// one cell of margin so the flood region never leaves the array
export const inB = (x, y, z) => x > -H + 1 && x < H - 2 && y > -H + 1 && y < H - 2 && z > -H + 1 && z < H - 2;
export const get = (x, y, z) => (inB(x, y, z) ? cells[idx(x, y, z)] : AIR);
export const solid = (x, y, z) => get(x, y, z) !== AIR;

export let looseCount = 0;
export let coreCount = 0;

export function reset(size = 3) {
  cells.fill(0); stratum.fill(0); exposed.fill(0);
  const lo = -Math.floor(size / 2), hi = lo + size - 1;
  for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) for (let z = lo; z <= hi; z++) cells[idx(x, y, z)] = CORE;
  looseCount = 0; coreCount = size ** 3;
}

export function place(x, y, z, who = 0) {
  if (!inB(x, y, z) || cells[idx(x, y, z)] !== AIR) return false;
  // must touch something: blocks stick, they don't float
  let touching = false;
  for (const [dx, dy, dz] of D6) if (solid(x + dx, y + dy, z + dz)) { touching = true; break; }
  if (!touching) return false;
  cells[idx(x, y, z)] = LOOSE; owner[idx(x, y, z)] = who; looseCount++;
  return true;
}

export function remove(x, y, z) {
  if (get(x, y, z) !== LOOSE) return false;
  cells[idx(x, y, z)] = AIR; looseCount--;
  return true;
}

let box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
function bounds() {
  let x0 = H, y0 = H, z0 = H, x1 = -H, y1 = -H, z1 = -H;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const x = cx(i), y = cy(i), z = cz(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  // region = solids + 1 cell of air all round, which is always outside
  box = { x0: x0 - 1, x1: x1 + 1, y0: y0 - 1, y1: y1 + 1, z0: z0 - 1, z1: z1 + 1 };
  return box;
}

const inRegion = (x, y, z) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && z >= box.z0 && z <= box.z1;

// Flood outside air, then count core faces it touches.
// Returns { exposedFaces, totalFaces, faces: [[x,y,z,nx,ny,nz], ...] }
export function analyze() {
  const b = bounds();
  for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const i = idx(x, y, z); outside[i] = 0; exposed[i] = 0;
  }
  let head = 0, tail = 0;
  const s = idx(b.x0, b.y0, b.z0);
  outside[s] = 1; queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const x = cx(i), y = cy(i), z = cz(i);
    for (let d = 0; d < 6; d++) {
      const nx = x + D6[d][0], ny = y + D6[d][1], nz = z + D6[d][2];
      if (!inRegion(nx, ny, nz)) continue;
      const j = i + STEP[d];
      if (outside[j] || cells[j] !== AIR) continue;
      outside[j] = 1; queue[tail++] = j;
    }
  }
  let exposedFaces = 0, totalFaces = 0;
  const faces = [];
  for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const i = idx(x, y, z);
    if (cells[i] !== CORE) continue;
    for (let d = 0; d < 6; d++) {
      const j = i + STEP[d];
      if (cells[j] === CORE) continue;
      totalFaces++;
      if (cells[j] === AIR && outside[j]) {
        exposedFaces++; exposed[i] = 1;
        faces.push([x, y, z, D6[d][0], D6[d][1], D6[d][2]]);
      }
    }
  }
  return { exposedFaces, totalFaces, faces };
}

// Seal: every loose block and every trapped air pocket becomes core.
// made.blocks[who] counts the loose blocks each player contributed; versus
// splits the whole seal (trapped air included) in that proportion.
export function cement(layer) {
  const made = [];
  made.blocks = [0, 0, 0, 0];
  for (let z = box.z0; z <= box.z1; z++) for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = idx(x, y, z);
    const c = cells[i];
    if (c === LOOSE || (c === AIR && !outside[i])) {
      made.push(i);
      if (c === LOOSE) made.blocks[owner[i]]++;
      cells[i] = CORE; stratum[i] = layer;
    }
  }
  looseCount = 0; coreCount += made.length;
  return made;
}

export function looseCells() {
  const out = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === LOOSE) out.push(i);
  return out;
}

// Amanatides–Woo voxel walk. isHit(x,y,z) decides what stops the ray.
export function raycast(o, d, maxD, isHit = solid) {
  let x = Math.floor(o.x + 0.5), y = Math.floor(o.y + 0.5), z = Math.floor(o.z + 0.5);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  let tmx = sx > 0 ? (x + 0.5 - o.x) / d.x : sx < 0 ? (x - 0.5 - o.x) / d.x : Infinity;
  let tmy = sy > 0 ? (y + 0.5 - o.y) / d.y : sy < 0 ? (y - 0.5 - o.y) / d.y : Infinity;
  let tmz = sz > 0 ? (z + 0.5 - o.z) / d.z : sz < 0 ? (z - 0.5 - o.z) / d.z : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let k = 0; k < 400 && t <= maxD; k++) {
    if (t > 0 && isHit(x, y, z)) return { x, y, z, nx, ny, nz, t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

// ---- mirroring (versus guests apply exactly what the host decided) ----
export function forcePlace(i, ownerOf) {
  if (cells[i] !== AIR) return false;
  cells[i] = LOOSE; owner[i] = ownerOf; looseCount++;
  return true;
}
export function forceRemove(i) {
  if (cells[i] !== LOOSE) return false;
  cells[i] = AIR; looseCount--;
  return true;
}
export function applySeal(made, layer) {
  for (const i of made) {
    if (cells[i] === LOOSE) looseCount--;
    cells[i] = CORE; stratum[i] = layer;
  }
  coreCount += made.length;
}
// full picture for late sync: every non-air cell as [index, value, owner, stratum]
export function snapshot() {
  const out = [];
  for (let i = 0; i < cells.length; i++) if (cells[i]) out.push(i, cells[i], owner[i], stratum[i]);
  return out;
}
export function loadSnapshot(flat) {
  cells.fill(0); stratum.fill(0); owner.fill(0);
  looseCount = 0; coreCount = 0;
  for (let k = 0; k < flat.length; k += 4) {
    const i = flat[k];
    cells[i] = flat[k + 1]; owner[i] = flat[k + 2]; stratum[i] = flat[k + 3];
    if (cells[i] === LOOSE) looseCount++; else coreCount++;
  }
}
