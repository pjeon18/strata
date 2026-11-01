import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@fontsource/m-plus-rounded-1c/900.css';
import * as THREE from 'three';
import * as HUD from './hud.js';
import * as G from './grid.js';
import * as B from './blocks.js';
import * as FX from './fx.js';
import * as T from './threats.js';
import * as Items from './items.js';
import * as AI from './builder.js';
import { PAL, Post, sky, sea, islands, clouds, lights, fxOnly, paint } from './look.js';
import { buildShip, Pilot } from './ship.js';
import { sfx, isMuted, setMuted, startMusic, musicLevel, musicState } from './audio.js';
import { LEVELS, pickKind, starsFor, bestStars, saveStars } from './levels.js';
import { LOADOUTS, Energy, pattern } from './weapons.js';
import { createVersus, TEAM, teamOf } from './versus.js';

// ---------- scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2000);
const post = new Post(renderer, scene, camera);

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
scene.add(sky());
const cloudLayer = clouds(rand); scene.add(cloudLayer);
const ocean = sea(); scene.add(ocean, islands(rand));
lights(scene);
scene.add(B.group, FX.group, T.group, Items.group);

// aim preview: up to nine wire cubes, enough for the 3×3 power-up
const ghosts = Array.from({ length: 9 }, () => { const g = fxOnly(B.ghost()); g.visible = false; scene.add(g); return g; });
const showGhost = cells => ghosts.forEach((g, k) => { g.visible = !!cells[k]; if (cells[k]) g.position.set(...cells[k]); });

// last-faces beacons: when a layer is nearly closed, show the gaps through everything
const beaconMat = new THREE.MeshBasicMaterial({ color: PAL.orange, depthTest: false, transparent: true });
const beaconGeo = new THREE.RingGeometry(0.28, 0.42, 24);
const beacons = Array.from({ length: 8 }, () => { const m = fxOnly(new THREE.Mesh(beaconGeo, beaconMat)); m.renderOrder = 20; m.visible = false; scene.add(m); return m; });
function updateBeacons(t) {
  const faces = S.mode === 'play' && S.a && S.a.exposedFaces <= 8 ? S.a.faces : [];
  beaconMat.opacity = 0.75 + 0.25 * Math.sin(t * 8);
  beacons.forEach((m, k) => {
    const f = faces[k];
    m.visible = !!f;
    if (!f) return;
    m.position.set(f[0] + f[3] * 0.55, f[1] + f[4] * 0.55, f[2] + f[5] * 0.55);
    m.lookAt(camera.position);
    m.scale.setScalar(1 + 0.25 * Math.sin(t * 8 + k));
  });
}
const shipMesh = buildShip(); scene.add(shipMesh);
const pilot = new Pilot(shipMesh);
const shield = new THREE.Mesh(new THREE.SphereGeometry(1.45, 28, 18), paint(0xff7ac0, { transparent: true, opacity: 0.22, rim: 1.4, rimColor: 0xffc2e2, depthWrite: false }));
shield.visible = false; scene.add(shield);

const shotGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46), shotMat = paint(PAL.mine, { roughness: 0.3, rim: 0.5 }), botShotMat = paint(PAL.bot, { roughness: 0.3, rim: 0.5 });
const blastGeo = new THREE.SphereGeometry(0.24, 14, 10), blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.orange).multiplyScalar(2.2) });
const botBlastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.botGlow).multiplyScalar(1.8) });
const bombGeo = new THREE.SphereGeometry(0.34, 18, 12), bombMat = paint(0x3a2a4a, { roughness: 0.3, rim: 0.6, rimColor: PAL.mine }), bombMatB = paint(0x3a2a4a, { roughness: 0.3, rim: 0.6, rimColor: PAL.botGlow });
const bombRingGeo = new THREE.TorusGeometry(0.4, 0.05, 8, 24), bombRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(1.8) });

function resize() {
  const dpr = Math.min(devicePixelRatio, 2), w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  post.setSize(w, h, dpr);
  camera.aspect = w / h; camera.updateProjectionMatrix(); frameOffset();
}
addEventListener('resize', resize);

// ---------- state ----------
const S = {
  mode: 'title', screen: 'splash', game: 'survival', level: LEVELS[0], loadout: 'rapid', auto: false,
  t: 0, slow: 0, shake: 0, flash: 0, ending: 0,
  score: 0, shown: 0, layer: 1, sealed: 0, integrity: 3, cemented: 0, meteorsDown: 0,
  crit: 0, time: 0, downed: 0, botT: 0, cleared: 0,
  left: 0, waveT: 0, wave: 0, queue: [], droneT: 0, itemT: 0,
  held: null, fx: { big: 0, boost: 0, shield: 0 }, seat: -1, team: 0, shipTeam: -1,
  fireCD: 0, blastCD: 0, emptyCD: 0, a: null, lastPlace: new THREE.Vector3(),
};
try { S.loadout = localStorage.getItem('strata-loadout') || 'rapid'; } catch {}
const energy = new Energy();
const shots = [];
const pending = new Set();
const $ = id => document.getElementById(id);
resize();

function reanalyze() {
  S.a = G.analyze();
  // versus guests never seal on their own: the host's seal op decides
  if (S.a.exposedFaces === 0 && G.looseCount > 0 && !(S.game === 'versus' && !V.isHost)) return sealLayer();
  B.sync(S.t);
  hudSeal();
}

function newRound(game = S.game) {
  S.game = game;
  G.reset(3);
  clearBots();
  for (const s of shots) scene.remove(s.m);
  shots.length = 0; pending.clear();
  T.clear(); FX.clear(); Items.clear();
  const L = S.level;
  Object.assign(S, { score: 0, shown: 0, layer: 1, sealed: 0, integrity: 3, slow: 0, shake: 0, flash: 0, ending: 0,
    crit: 0, time: 0, downed: 0, botT: 35, cemented: 0, meteorsDown: 0, cleared: 0,
    left: L.time, waveT: L.firstWave, wave: 0, queue: [], droneT: 0, itemT: 8,
    held: null, fx: { big: 0, boost: 0, shield: 0 } });
  energy.reset();
  if (game === 'containment') addBot();
  if (game !== 'versus') { recolorShip(-1); HUD.versusHud(false); }
  hudGame();
  yaw = 0; pitch = 0;
  pilot.reset(new THREE.Vector3(0, 1, 11), new THREE.Vector3(0, 0, -1));
  camPos.set(0, 2.5, 16);
  reanalyze(); hudIntegrity(); HUD.slot(null);
}

// ---------- the big beat ----------
function sealBeat(made) {
  const o = S.lastPlace;
  for (const i of made) B.seal(i, S.t, Math.hypot(G.cx(i) - o.x, G.cy(i) - o.y, G.cz(i) - o.z) * 0.02);
  S.a = G.analyze();
  B.sync(S.t);
  const R0 = Math.cbrt(G.coreCount) * 1.1;
  FX.ring(new THREE.Vector3(), camera.position.clone().normalize(), 0xffffff, R0 * 2.6, 0.8);
  FX.ring(new THREE.Vector3(), camera.position.clone().normalize(), PAL.strata[S.layer % PAL.strata.length], R0 * 1.8, 0.65);
}
function sealLayer() {
  const made = G.cement(S.layer);
  sealBeat(made);
  if (S.game === 'versus') return versusSeal(made, V.sealed(made, S.layer));
  if (S.game === 'containment') {
    // their seal: same beat, but it counts toward critical mass
    S.crit++; S.sealed++; S.layer++;
    S.slow = 0.25; S.flash = 0.35; S.shake = Math.max(S.shake, 0.7);
    sfx.crit();
    hudSeal(); hudIntegrity();
    if (S.crit >= CRIT) return critical();
    HUD.callout('They sealed it', CRIT - S.crit === 1 ? 'One more and it goes critical' : `${CRIT - S.crit} more and it goes critical`, 'bad');
    return;
  }
  const pts = made.length * 10 * S.layer;
  S.score += pts; S.sealed++; S.layer++; S.cemented += made.length;
  HUD.bump();
  S.integrity = Math.min(3, S.integrity + 1);
  S.slow = 0.32; S.flash = 0.55; S.shake = Math.max(S.shake, 0.55);
  // the shockwave knocks nibblers off
  for (const d of [...T.drones]) T.hitTest(d.pos, 1, kill);
  sfx.seal();
  if (S.mode === 'play') HUD.callout('Sealed!', `+${pts.toLocaleString()}`, 'good');
  hudSeal(); hudIntegrity();
}
// versus: the layer's points split by who built it
function versusSeal(made, pts) {
  S.sealed++; S.layer++;
  S.slow = 0.3; S.flash = 0.5; S.shake = Math.max(S.shake, 0.55);
  sfx.seal();
  const mine = pts[S.team], theirs = pts[1 - S.team];
  HUD.callout('Sealed!', `${TEAM[0].name} +${pts[0].toLocaleString()} · ${TEAM[1].name} +${pts[1].toLocaleString()}`, mine >= theirs ? 'good' : 'bad');
  HUD.bump();
  hudSeal();
}

// ---------- shooting ----------
// Every fire function takes the shooter's team and seat. `visual` shots (a
// versus guest's own prediction, or another player's shot mirrored from the
// host) fly and burst but change nothing; only the host's shots have effects.
const blocked = (x, y, z) => G.solid(x, y, z) || pending.has(G.idx(x, y, z));

function targetFrom(origin, dir) {
  const h = G.raycast(origin, dir, 42, blocked);
  if (!h || (!h.nx && !h.ny && !h.nz)) return null;
  const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
  if (!G.inB(x, y, z) || blocked(x, y, z)) return null;
  return { x, y, z, n: [h.nx, h.ny, h.nz] };
}
// the cells a shot of this pattern would fill
const cellsFor = (tgt, kind) => pattern(kind, tgt.n).map(([a, b, c]) => [tgt.x + a, tgt.y + b, tgt.z + c]).filter(([x, y, z]) => G.inB(x, y, z) && !blocked(x, y, z));
const isVersusHost = () => S.game === 'versus' && V.isHost;

function fireBuild(from, tgt, owner = 0, kind = 'single', seat = -1, visual = false) {
  const cells = kind === 'single' ? [[tgt.x, tgt.y, tgt.z]] : cellsFor(tgt, kind);
  if (!cells.length) return;
  for (const [x, y, z] of cells) pending.add(G.idx(x, y, z));
  const to = new THREE.Vector3(tgt.x, tgt.y, tgt.z);
  const m = new THREE.Mesh(shotGeo, owner ? botShotMat : shotMat); m.position.copy(from); m.castShadow = true;
  m.scale.setScalar(kind === 'big' ? 2 : kind === 'cross' ? 1.5 : 1);
  scene.add(m);
  shots.push({ kind: 'build', m, from: from.clone(), to, cells, owner, seat, visual, t: 0, dur: Math.max(0.05, from.distanceTo(to) / 80) });
  if (seat === S.seat || (seat < 0 && !owner)) { sfx.fire(); HUD.kick(); }
  if (isVersusHost() && !visual) V.shot(seat, 'build', from, { x: tgt.x, y: tgt.y, z: tgt.z, n: tgt.n }, kind);
}

function fireBlast(from, dir, area, team, seat = -1, visual = false) {
  const m = new THREE.Mesh(blastGeo, team === 1 ? botBlastMat : blastMat); m.position.copy(from); fxOnly(m); scene.add(m);
  if (area) m.scale.setScalar(1.6);
  shots.push({ kind: 'blast', m, p: from.clone(), v: dir.clone().multiplyScalar(75), life: 0.7, area, team, seat, visual });
  if (seat === S.seat || seat < 0) { sfx.blast(); HUD.kick(); }
  if (isVersusHost() && !visual) V.shot(seat, 'bolt', from, dir.toArray());
}

// Bomb: heavy, lobbed, slow. It breaks the block it hits plus the six blocks
// touching its faces, and stuns ships caught in the blast.
function fireBomb(from, dir, team, seat = -1, visual = false) {
  const m = new THREE.Mesh(bombGeo, team === 1 ? bombMatB : bombMat); m.position.copy(from); m.castShadow = true;
  const ring = new THREE.Mesh(bombRingGeo, bombRingMat); m.add(ring);
  scene.add(m);
  shots.push({ kind: 'bomb', m, p: from.clone(), v: dir.clone().multiplyScalar(36), life: 1.6, team, seat, visual });
  if (seat === S.seat || seat < 0) { sfx.blast(); HUD.kick(); }
  if (isVersusHost() && !visual) V.shot(seat, 'bomb', from, dir.toArray());
}
function explode(p, team, seat, visual) {
  FX.burst(p, 0xffd27a, 18, 11, 0.3); FX.burst(p, team === 1 ? PAL.bot : PAL.mine, 10, 8, 0.26);
  FX.puff(p, 0xffffff, 12, 1.8, 0.9, 0.55);
  FX.ring(p, camera.position.clone().sub(p).normalize(), 0xffffff, 4, 0.4);
  sfx.impact();
  S.shake = Math.max(S.shake, Math.max(0, 0.6 - camera.position.distanceTo(p) / 40));
  if (visual) return;
  const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z);
  for (const [a, b, c] of [[0, 0, 0], ...G.D6]) {
    const i = G.idx(x + a, y + b, z + c);
    if (G.get(x + a, y + b, z + c) === G.LOOSE && (team == null || G.owner[i] !== team)) destroyBlock(i, true, seat);
  }
  if (S.game === 'versus') V.hitShips(p, 2.6, team, 'bomb', seat);
  else {
    T.areaHit(p, 2.4, 2, kill);
    for (const b of bots) if (!b.dead && b.pilot.pos.distanceTo(p) < 2.6) damageBot(b, 3, p);
  }
}

// Laser: instant, cuts through every loose block and threat on the line until
// it reaches cemented core.
function fireLaser(from, dir, team, seat = -1, visual = false) {
  const h = G.raycast(from, dir, 46, (x, y, z) => G.get(x, y, z) === G.CORE);
  const end = from.clone().addScaledVector(dir, h ? h.t : 46);
  if (!visual) {
    const seen = new Set();
    for (let d = 0, len = from.distanceTo(end); d < len; d += 0.25) {
      const p = from.clone().addScaledVector(dir, d);
      const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z), i = G.idx(x, y, z);
      if (G.get(x, y, z) === G.LOOSE && (team == null || G.owner[i] !== team)) seen.add(i);
    }
    [...seen].slice(0, 10).forEach(i => destroyBlock(i, true, seat));
    if (S.game === 'versus') V.hitSegment(from, end, team, 'laser', seat, T.segDist);
    else {
      T.laserHits(from, end, 3, kill);
      for (const b of bots) if (!b.dead && T.segDist(b.pilot.pos, from, end) < 1) damageBot(b, 3, b.pilot.pos);
    }
  }
  FX.beam(from, end, team === 1 ? PAL.bot : PAL.mine);
  FX.burst(end, 0xffffff, 6, 5, 0.18);
  if (seat === S.seat || seat < 0) { sfx.laser(); HUD.kick(); S.shake = Math.max(S.shake, 0.15); }
  if (isVersusHost() && !visual) V.shot(seat, 'laser', from, dir.toArray());
}

function destroyBlock(i, byPlayer, seat) {
  const theirs = G.owner[i];
  if (!G.remove(G.cx(i), G.cy(i), G.cz(i))) return;
  if (byPlayer && theirs && S.game !== 'versus') { S.score += 5; S.cleared++; }
  if (isVersusHost()) V.removed(i, seat);
  breakFX(i, theirs);
  reanalyze();
}
function breakFX(i, team) {
  const p = new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i));
  FX.burst(p, team ? PAL.bot : PAL.mine, 8, 6, 0.24); FX.puff(p, 0xffffff, 3, 0.5, 0.4);
  sfx.pop();
}

function kill(kind, p) {
  FX.burst(p, kind === 'meteor' ? PAL.plum : kind === 'bot' ? PAL.bot : 0x2d5566, 16, 10, 0.3);
  FX.puff(p, 0xffffff, 8, 1.2, 0.7);
  FX.ring(p, camera.position.clone().sub(p).normalize(), 0xffffff, 3, 0.35);
  S.score += kind === 'meteor' ? 50 : kind === 'bot' ? 100 : 25;
  if (kind === 'meteor') S.meteorsDown++;
  HUD.bump();
  S.shake = Math.max(S.shake, 0.25);
  sfx.pop();
}

function updateShots(dt) {
  for (let k = shots.length - 1; k >= 0; k--) {
    const s = shots[k];
    if (s.kind === 'build') {
      s.t += dt;
      const e = Math.min(1, s.t / s.dur);
      s.m.position.lerpVectors(s.from, s.to, e);
      s.m.rotation.set(s.t * 14, s.t * 9, 0);
      FX.dot(s.m.position, 0xffffff, 0.12, 0.16);
      if (e < 1) continue;
      scene.remove(s.m); shots.splice(k, 1);
      for (const [x, y, z] of s.cells) pending.delete(G.idx(x, y, z));
      if (s.visual) { FX.puff(s.to, 0xffffff, 3, 0.6, 0.3, 0.25); continue; }
      let placed = 0;
      // centre first so the arms have something to hold on to
      for (const [x, y, z] of s.cells) {
        const i = G.idx(x, y, z);
        if (G.place(x, y, z, s.owner)) {
          B.pop(i, S.t + placed * 0.02);
          if (++placed === 1) S.lastPlace.set(x, y, z);
          if (isVersusHost()) V.placed(i, s.owner, s.seat);
        }
      }
      if (placed) {
        const prog = S.a.totalFaces ? 1 - S.a.exposedFaces / S.a.totalFaces : 0;
        // theirs climbs too, lower and quieter: you can hear them closing in
        if (S.game === 'versus' ? s.seat !== S.seat : s.owner) sfx.botPlace(prog); else sfx.place(prog);
        FX.puff(s.to, 0xffffff, 3 + placed, 0.7, 0.32, 0.3);
        reanalyze();
      } else if (s.seat === S.seat || (s.seat < 0 && !s.owner)) { sfx.fizzle(); FX.puff(s.to, 0xffffff, 2, 0.3, 0.25, 0.2); }
    } else if (s.kind === 'bomb') {
      s.life -= dt;
      s.v.y -= 16 * dt;
      let boom = s.life <= 0;
      const steps = Math.ceil(s.v.length() * dt / 0.3);
      for (let n = 0; n < steps && !boom; n++) {
        s.p.addScaledVector(s.v, dt / steps);
        if (G.solid(Math.round(s.p.x), Math.round(s.p.y), Math.round(s.p.z))) boom = true;
        else if (!s.visual && (S.game === 'versus' ? V.hitShips(s.p, 1, s.team, 'bomb', s.seat) : T.hitTest(s.p, 0.5, () => {}) || hitBot(s.p))) boom = true;
      }
      s.m.position.copy(s.p); s.m.rotation.x += dt * 8;
      FX.dot(s.p, 0xffd27a, 0.2, 0.25);
      if (boom) { scene.remove(s.m); shots.splice(k, 1); explode(s.p, s.team, s.seat, s.visual); }
    } else {
      s.life -= dt;
      let hit = s.life <= 0;
      const steps = Math.ceil(s.v.length() * dt / 0.35);
      for (let n = 0; n < steps && !hit; n++) {
        s.p.addScaledVector(s.v, dt / steps);
        const x = Math.round(s.p.x), y = Math.round(s.p.y), z = Math.round(s.p.z);
        const c = G.get(x, y, z);
        if (s.visual) { if (c || (S.game === 'versus' && V.shipNear(s.p, s.team))) hit = true; continue; }
        if (S.game === 'versus' ? V.hitShips(s.p, 0.95, s.team, 'bolt', s.seat) : hitBot(s.p) || T.hitTest(s.p, s.area ? 0.6 : 0.3, kill)) { hit = true; break; }
        if (c === G.LOOSE) {
          const i = G.idx(x, y, z);
          // your own team's blocks stop the bolt but don't break
          if (s.team != null && G.owner[i] === s.team) { FX.puff(s.p, 0xffffff, 3, 0.3, 0.3, 0.25); hit = true; continue; }
          const hitCells = s.area ? [[0, 0, 0], ...G.D6] : [[0, 0, 0]];
          for (const [a, b, cc] of hitCells) {
            const j = G.idx(x + a, y + b, z + cc);
            if (G.get(x + a, y + b, z + cc) === G.LOOSE && (s.team == null || G.owner[j] !== s.team)) destroyBlock(j, true, s.seat);
          }
          hit = true;
        } else if (c === G.CORE) { FX.puff(s.p, 0xffffff, 3, 0.3, 0.3, 0.25); if (s.seat === S.seat || s.seat < 0) sfx.fizzle(); hit = true; }
      }
      s.m.position.copy(s.p);
      FX.dot(s.p, PAL.sand, 0.16, 0.18);
      if (hit) { scene.remove(s.m); shots.splice(k, 1); }
    }
  }
}

// ---------- input ----------
// refused locks (embedded panes, no gesture) are fine: the game still runs
const lock = () => { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {} };
const keys = new Set();
let yaw = 0, pitch = 0, mouseL = false, mouseR = false, locked = false;
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyH') $('keys').classList.toggle('hidden');
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyE' && S.mode === 'play' && !S.auto) useItem();
  if (e.code === 'Escape' && S.mode === 'play' && !locked) setMode('pause');
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseL = mouseR = false; });
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  if (was && !locked && S.mode === 'play') setMode('pause');
});
addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0021;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0021, -1.45, 1.45);
});
canvas.addEventListener('mousedown', e => {
  if (S.mode !== 'play') return;
  if (!locked) lock();
  if (e.button === 0) mouseL = true;
  if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', e => e.preventDefault());

function toggleMute() { setMuted(!isMuted()); HUD.mute(isMuted()); }
HUD.mute(isMuted(), toggleMute);

// ---------- screens ----------
// title screens sit over the attract loop: splash → menu → (levels) → loadout
function setMode(m, scr = S.screen) {
  S.mode = m; S.screen = scr;
  musicLevel(m === 'pause' ? 'quiet' : 'normal');
  frameOffset();
  HUD.screen(m === 'title' ? scr : m === 'pause' ? 'pause' : m === 'over' ? 'result' : null);
  showGhost([]);
  if (m !== 'play') HUD.tab(null);
  if (m === 'play') hudIntegrity(); else if (m !== 'pause') HUD.danger(false);
}
const go = scr => { sfx.select(); setMode('title', scr); };
function start(game = S.game) {
  sfx.unlock(); lock();
  HUD.wipe(() => { newRound(game); setMode('play'); HUD.callout('Go!', '', 'good'); });
}
function toMenu() { HUD.clearCallout(); HUD.wipe(() => { newRound('survival'); setMode('title', 'menu'); }); }

HUD.init();
$('splash').onclick = () => { sfx.unlock(); startMusic(); go('menu'); };
addEventListener('pointerdown', startMusic, { once: true });
HUD.menu(pick => {
  if (pick === 'how') return;
  if (pick === 'versus') return go('rooms');
  S.game = pick;
  if (pick === 'survival') go('levels'); else go('loadout');
}, sfx.select);
HUD.levels(LEVELS, bestStars, id => { S.level = LEVELS[id - 1]; go('loadout'); }, () => go('menu'), sfx.select).select(0, true);
const loadPicker = HUD.loadouts(LOADOUTS, k => {
  S.loadout = k;
  try { localStorage.setItem('strata-loadout', k); } catch {}
  start(S.game);
}, () => go(S.game === 'survival' ? 'levels' : 'menu'), sfx.select);
loadPicker.select(Math.max(0, Object.keys(LOADOUTS).indexOf(S.loadout)), true);
$('again').onclick = () => {
  if (S.game !== 'versus') return start();
  if (V.isHost) { V.rematch(); toLobby(); } else toLobby();
};
$('modes').onclick = () => { if (S.game === 'versus') V.leave(); toMenu(); };
$('quit').onclick = () => { if (S.game === 'versus') V.leave(); toMenu(); };
$('resume').onclick = () => { setMode('play'); lock(); };

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 6, 20);
const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), tmp = new THREE.Vector3();
const aimFwd = (out, y = yaw, p = pitch) => out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));

function chaseCamera(dt) {
  aimFwd(F); R.set(Math.cos(yaw), 0, -Math.sin(yaw)); U.crossVectors(R, F);
  const want = pilot.pos.clone().addScaledVector(F, -5.6).addScaledVector(U, 1.75).addScaledVector(R, 1.25);
  const dir = want.clone().sub(pilot.pos), dist = dir.length(); dir.normalize();
  const h = G.raycast(pilot.pos, dir, dist);
  if (h) want.copy(pilot.pos).addScaledVector(dir, Math.max(0.9, h.t - 0.45));
  camPos.lerp(want, 1 - Math.exp(-24 * dt));
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(tmp.copy(camPos).add(F));
  // super speed pulls the lens wide
  const fov = S.fx.boost > 0 ? 82 : 68;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * dt)); camera.updateProjectionMatrix(); }
}

function frameOffset() {
  const W = innerWidth, Hh = innerHeight;
  // splash: core sits above the logo band; menus: core sits right of the panel
  if (S.mode === 'title' && S.screen === 'splash') camera.setViewOffset(W, Hh, 0, Hh * 0.08, W, Hh);
  else if (S.mode === 'title' && S.screen === 'menu' && W > 800) camera.setViewOffset(W, Hh, -W * 0.14, Hh * 0.05, W, Hh);
  else camera.clearViewOffset();
}

// intro: after loading, the camera falls from high above the sea into the title shot
const INTRO = 2.2;
function orbitCamera(rdt = 0) {
  const a = S.t * 0.11, r = 15 + G.coreCount ** (1 / 3) * 0.9;
  camPos.set(Math.sin(a) * r, 5 + Math.sin(S.t * 0.23) * 3, Math.cos(a) * r);
  if (S.intro > 0) {
    S.intro = Math.max(0, S.intro - rdt);
    const k = 1 - S.intro / INTRO, e = 1 - (1 - k) ** 4;
    const from = camPos.clone().multiplyScalar(3.4).setY(70);
    camera.position.lerpVectors(from, camPos, e);
  } else camera.position.copy(camPos);
  camera.lookAt(0, -1.5, 0);
  if (camera.fov !== 68) { camera.fov = 68; camera.updateProjectionMatrix(); }
}

// ---------- AI ----------
function faceOpen(f) {
  const x = f[0] + f[3], y = f[1] + f[4], z = f[2] + f[5];
  return G.get(x, y, z) === G.AIR && !pending.has(G.idx(x, y, z)) && G.exposed[G.idx(f[0], f[1], f[2])];
}
const aiCtx = {
  get faces() { return S.a.faces; }, faceOpen, targetFrom, fireBuild, fireBlast, meteors: T.meteors, get bots() { return bots; },
  enemyBlocks: team => G.looseCells().filter(i => G.owner[i] !== team),
  enemyShips: team => versusShips().filter(s => s.team !== team),
  fireBlastAs: fireAs,
};
const me = AI.agent(pilot);
// title + ?watch: you build in Survival, defend in Containment
const autopilot = dt => (S.game === 'containment' && S.mode === 'play' ? AI.defend : AI.build)(me, dt, aiCtx);

const V = createVersus({
  S, scene, pilot, aiCtx, notice, gotItem, stunMe, startVersus, versusOver,
  mirrorPlace, mirrorRemove, mirrorSeal, mirrorShot, remoteBuild, remoteBlast,
  lobbyChanged: note => { if (S.screen === 'lobby') HUD.lobby(V, LOADOUTS, note); },
  toLobby: () => toLobby(), backToMenu: () => toMenu(),
});
function toLobby() { HUD.versusHud(false); recolorShip(-1); newRound('survival'); setMode('title', 'lobby'); HUD.lobby(V, LOADOUTS); }
HUD.rooms({
  name: V.name, onName: n => V.setName(n),
  onCreate: () => { sfx.select(); V.host(); toLobby(); },
  onJoin: code => { sfx.select(); V.join(code); toLobby(); },
  onBack: () => go('menu'),
});
$('leaveRoom').onclick = () => { V.leave(); go('rooms'); };
$('startMatch').onclick = () => V.start();
$('fillBots').onclick = () => V.fillBots();

// ---------- containment: builder bots ----------
const CRIT = 4, MAX_BOTS = 4, BOT_HP = 5;
const bots = [];
function addBot() {
  const mesh = buildShip(PAL.bot, PAL.botGlow, 0x4a2140); scene.add(mesh);
  const p = new Pilot(mesh);
  const b = { pilot: p, mesh, hp: BOT_HP, dead: 0, ai: AI.agent(p, { owner: 1, rate: 0.3, defend: false }) };
  spawnBot(b); bots.push(b);
  return b;
}
// Bots warp in close, on the far side of the core from you, so you have to
// fly round to them. They get quicker the longer you hold.
const botRate = () => Math.max(0.15, 0.3 - S.time / 1200);
const botRespawn = () => Math.max(2.5, 7 - S.time / 50);
function spawnBot(b) {
  const dir = new THREE.Vector3().randomDirection();
  const away = pilot.pos.clone().normalize();
  if (dir.dot(away) > -0.2) dir.addScaledVector(away, -1.4).normalize();
  b.pilot.reset(dir.clone().multiplyScalar(Math.cbrt(G.coreCount) * 0.7 + 9), dir.clone().negate());
  b.pilot.update(0, new THREE.Vector3(), b.pilot.fwd, null);
  b.hp = BOT_HP; b.dead = 0; b.mesh.visible = true; b.ai.face = null; b.ai.rate = botRate();
  FX.puff(b.pilot.pos, 0xffffff, 8, 1.2, 0.7);
}
function clearBots() { for (const b of bots) scene.remove(b.mesh); bots.length = 0; }
function damageBot(b, dmg, p) {
  b.hp -= dmg; b.pilot.stun = 0.45;
  b.pilot.vel.add(b.pilot.pos.clone().sub(p).setLength(6));
  FX.burst(p, PAL.bot, 6, 6, 0.25); sfx.pop();
  if (b.hp <= 0) { b.dead = botRespawn(); b.mesh.visible = false; S.downed++; kill('bot', b.pilot.pos.clone()); }
}
// a bolt that reaches a bot: each hit knocks it off its line
function hitBot(p) {
  for (const b of bots) {
    if (b.dead || b.pilot.pos.distanceTo(p) > 0.95) continue;
    damageBot(b, 1, p);
    return true;
  }
  return false;
}
function updateBots(dt) {
  for (const b of bots) {
    if (b.dead > 0) { b.dead -= dt; if (b.dead <= 0) spawnBot(b); continue; }
    // smoke blinds them: they drift and spin instead of building
    if (Items.inSmoke(b.pilot.pos)) { b.pilot.update(dt, new THREE.Vector3(), b.pilot.fwd.clone().applyAxisAngle(U.set(0, 1, 0), dt * 3), null); continue; }
    AI.build(b.ai, dt, aiCtx);
  }
  S.botT -= dt;
  if (S.botT <= 0 && bots.length < MAX_BOTS) { addBot(); notice(`Another builder arrived. There are ${bots.length} now.`); S.botT = 35; }
}

// ---------- power-ups ----------
function gotItem(k) { S.held = k; HUD.slot(k, Items.ITEMS[k]); sfx.pickup(); notice(`You picked up ${Items.ITEMS[k].name}. Press E to use it.`, 'lilac'); }
function useItem() {
  const k = S.held;
  if (!k) return;
  if (S.game === 'versus' && !V.isHost) V.send({ k: 'use' });
  const it = Items.ITEMS[k];
  if (k === 'big') S.fx.big = 5;
  if (k === 'infinite') energy.infinite = it.dur;
  if (k === 'boost') S.fx.boost = it.dur;
  if (k === 'shield') S.fx.shield = it.dur;
  if (k === 'smoke') {
    aimFwd(F);
    const h = G.raycast(camera.position, F, 22);
    const at = camera.position.clone().addScaledVector(F, h ? Math.max(4, h.t - 2) : 16);
    if (S.game === 'versus') V.smoke(at); else Items.throwSmoke(at);
  }
  S.held = null; HUD.slot(null);
  sfx.use();
  notice(it.blurb, 'lilac');
}
function updateItems(dt) {
  if (S.game === 'versus') Items.update(dt, S.t, null, false);
  else {
    S.itemT -= dt;
    if (S.itemT <= 0) { Items.spawn(S.game); S.itemT = 10 + Math.random() * 4; }
    const got = Items.update(dt, S.t, pilot.pos, !S.held);
    if (got) gotItem(got);
  }
  S.fx.boost = Math.max(0, S.fx.boost - dt); S.fx.shield = Math.max(0, S.fx.shield - dt);
  pilot.boost = S.fx.boost > 0 ? 1.9 : 1;
  if (S.fx.boost > 0 && Math.random() < 0.6) FX.dot(pilot.pos.clone().addScaledVector(pilot.fwd, -0.9), 0xffffff, 0.18, 0.25);
  shield.visible = S.fx.shield > 0 && (S.fx.shield > 2 || Math.floor(S.t * 8) % 2 === 0);
  shield.position.copy(pilot.pos);
}

// ---------- play ----------
const wishV = new THREE.Vector3();
function fly(dt) {
  if (S.auto) {
    autopilot(dt);
    pitch = Math.asin(THREE.MathUtils.clamp(pilot.fwd.y, -1, 1)); yaw = Math.atan2(-pilot.fwd.x, -pilot.fwd.z);
  } else {
    aimFwd(F); R.set(Math.cos(yaw), 0, -Math.sin(yaw));
    wishV.set(0, 0, 0);
    if (keys.has('KeyW')) wishV.add(F); if (keys.has('KeyS')) wishV.sub(F);
    if (keys.has('KeyD')) wishV.add(R); if (keys.has('KeyA')) wishV.sub(R);
    if (keys.has('Space')) wishV.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) wishV.y -= 1;
    if (wishV.lengthSq() > 1) wishV.normalize();
    pilot.update(dt, wishV, F, R);
  }
  chaseCamera(dt);
  aimFwd(F);
}

// the blaster: bolt, cross bolt or laser, by loadout; costs energy
function trySecondary(dt, aimHit) {
  const L = LOADOUTS[S.loadout].blast;
  S.blastCD -= dt;
  if (S.blastCD > 0 || pilot.stun > 0) return;
  if (!energy.use(L.cost)) return noAmmo();
  const aimPt = camera.position.clone().addScaledVector(F, aimHit ? aimHit.t : 60);
  const from = pilot.nose(), dir = aimPt.sub(from).normalize();
  const vs = S.game === 'versus', team = vs ? S.team : undefined, seat = vs ? S.seat : -1, guest = vs && !V.isHost;
  if (L.kind === 'laser') fireLaser(from, dir, team, seat, guest);
  else if (L.kind === 'bomb') fireBomb(from, dir, team, seat, guest);
  else fireBlast(from, dir, L.area, team, seat, guest);
  if (guest) V.send({ k: 'blast', kind: L.kind, from: from.toArray(), dir: dir.toArray(), area: !!L.area });
  S.blastCD = L.rate;
}
function noAmmo() { if (S.emptyCD <= 0) { sfx.empty(); S.emptyCD = 0.25; } }

function play(dt) {
  fly(dt);
  energy.update(dt); S.emptyCD -= dt;
  updateItems(dt);
  if (S.game === 'versus') versusPlay(dt);
  else if (S.game === 'containment') contain(dt); else survive(dt);
  HUD.ammo(energy.frac, { charging: energy.charging, empty: energy.empty > 0, infinite: energy.infinite > 0 });
}

function survive(dt) {
  const L = LOADOUTS[S.loadout];
  const kind = S.fx.big > 0 ? 'big' : L.build.pattern;
  const tgt = targetFrom(camera.position, F);
  HUD.cross(!!tgt);
  showGhost(tgt && !S.auto ? (kind === 'single' ? [[tgt.x, tgt.y, tgt.z]] : cellsFor(tgt, kind)) : []);
  if (!S.auto) {
    S.fireCD -= dt;
    if (mouseL && S.fireCD <= 0 && tgt && pilot.stun <= 0) {
      const cost = kind === 'big' ? 6 : L.build.cost;
      if (energy.use(cost)) {
        fireBuild(pilot.nose(), tgt, 0, kind);
        S.fireCD = kind === 'big' ? 0.3 : L.build.rate;
        if (kind === 'big' && --S.fx.big <= 0) notice('Your big blocks are used up.', 'lilac');
      } else noAmmo();
    }
    if (mouseR) trySecondary(dt, G.raycast(camera.position, F, 60));
    else S.blastCD -= dt;
  }

  // the level: a clock and waves of meteors
  const LV = S.level;
  S.left -= dt; S.time += dt;
  const sec = Math.ceil(S.left);
  if (sec <= 5 && sec > 0 && Math.ceil(S.left + dt) !== sec) sfx.tick();
  HUD.clock(clock(Math.max(0, S.left)), S.left < 10);
  if (S.left <= 0 && !S.ending) return timeUp();
  S.waveT -= dt;
  if (S.waveT <= 0) {
    S.wave++;
    const n = LV.size[0] + Math.floor(Math.random() * (LV.size[1] - LV.size[0] + 1));
    for (let k = 0; k < n; k++) S.queue.push({ at: k * 0.45, kind: pickKind(LV.mix) });
    S.waveT = LV.every;
    sfx.warn();
    notice(n > 1 ? `Wave ${S.wave} · ${n} meteors` : `Wave ${S.wave} · 1 meteor`, 'lilac');
  }
  for (let k = S.queue.length - 1; k >= 0; k--) {
    const q = S.queue[k]; q.at -= dt;
    if (q.at <= 0) { T.spawnMeteor(LV.speed + S.time * 0.012, q.kind); S.queue.splice(k, 1); }
  }
  if (LV.nibblers && S.time > LV.nibbleFrom) {
    S.droneT -= dt;
    if (S.droneT <= 0 && T.drones.length < LV.nibblers) { T.spawnDrone(); S.droneT = 9; }
  }
  T.update(dt, S.t, { destroyBlock, impact, inSmoke: Items.inSmoke }, pilot.pos, (p, o) => {
    // a shield breaks the rock instead of you
    if (S.fx.shield > 0) { kill('meteor', p); return; }
    pilot.stun = 1.1; pilot.vel.add(pilot.pos.clone().sub(p).setLength(12));
    S.shake = Math.max(S.shake, 0.6); sfx.stun();
  });
}

// ---------- versus ----------
function buildMine(tgt, kind) {
  if (S.game !== 'versus') return fireBuild(pilot.nose(), tgt, 0, kind);
  const guest = !V.isHost;
  fireBuild(pilot.nose(), tgt, S.team, kind, S.seat, guest);
  if (guest) V.send({ k: 'build', from: pilot.nose().toArray(), tgt, kind });
}
function versusPlay(dt) {
  const L = LOADOUTS[S.loadout];
  const kind = S.fx.big > 0 ? 'big' : L.build.pattern;
  const tgt = targetFrom(camera.position, F);
  HUD.cross(!!tgt);
  showGhost(tgt ? (kind === 'single' ? [[tgt.x, tgt.y, tgt.z]] : cellsFor(tgt, kind)) : []);
  if (V.phase === 'playing') {
    S.fireCD -= dt;
    if (mouseL && S.fireCD <= 0 && tgt && pilot.stun <= 0) {
      const cost = kind === 'big' ? 6 : L.build.cost;
      if (energy.use(cost)) {
        buildMine(tgt, kind);
        S.fireCD = kind === 'big' ? 0.3 : L.build.rate;
        if (kind === 'big' && --S.fx.big <= 0) notice('Your big blocks are used up.', 'lilac');
      } else noAmmo();
    }
    if (mouseR) trySecondary(dt, G.raycast(camera.position, F, 60)); else S.blastCD -= dt;
  }
  V.update(dt);
  HUD.board(V.score, clock(Math.max(0, V.left)), S.team, V.left < 10);
}
function recolorShip(team) {
  if (S.shipTeam === team) return;
  scene.remove(pilot.mesh);
  pilot.mesh = team < 0 ? buildShip() : buildShip(TEAM[team].color, TEAM[team].glow, 0x22406e);
  scene.add(pilot.mesh);
  S.shipTeam = team;
}
function startVersus(seat, role) {
  S.seat = seat; S.team = teamOf(seat); S.loadout = role;
  newRound('versus');
  recolorShip(S.team);
  const sp = V.spawnPoint(seat), fwd = sp.clone().negate().normalize();
  pilot.reset(sp, fwd);
  yaw = Math.atan2(-fwd.x, -fwd.z); pitch = -0.1;
  camPos.copy(sp).addScaledVector(fwd, -6);
  HUD.versusHud(true, `${V.seats[seat].name} · ${LOADOUTS[role].role}`, TEAM[S.team]);
  setMode('play');
  HUD.callout('Go!', `You're on ${TEAM[S.team].name}`, 'good');
  lock();
}
function versusOver(res) {
  HUD.callout('Finish!', '', 'good');
  S.slow = 1;
  setTimeout(() => {
    HUD.clearCallout();
    HUD.versusResult(res, S.team, V.isHost, LOADOUTS);
    HUD.wipe(() => setMode('over'));
    document.exitPointerLock?.();
  }, 1500);
}
function stunMe(dur, from) {
  if (S.fx.shield > 0) return;
  pilot.stun = dur; pilot.vel.add(pilot.pos.clone().sub(from).setLength(10));
  S.shake = Math.max(S.shake, 0.5); sfx.stun();
}
// guests: apply exactly what the host decided
function mirrorPlace(i, team) {
  if (!G.forcePlace(i, team)) return;
  B.pop(i, S.t); S.lastPlace.set(G.cx(i), G.cy(i), G.cz(i));
  if (team === S.team) sfx.place(S.a.totalFaces ? 1 - S.a.exposedFaces / S.a.totalFaces : 0); else sfx.botPlace(0.5);
  reanalyze();
}
function mirrorRemove(i) { const team = G.owner[i]; if (G.forceRemove(i)) { breakFX(i, team); reanalyze(); } }
function mirrorSeal(made, layer, pts) { G.applySeal(made, layer); S.layer = layer; sealBeat(made); versusSeal(made, pts); }
function mirrorShot(seat, kind, from, a, pat) {
  const team = teamOf(seat), p = new THREE.Vector3(...from);
  if (kind === 'build') fireBuild(p, a, team, pat || 'single', seat, true);
  else if (kind === 'laser') fireLaser(p, new THREE.Vector3(...a), team, seat, true);
  else if (kind === 'bomb') fireBomb(p, new THREE.Vector3(...a), team, seat, true);
  else fireBlast(p, new THREE.Vector3(...a), false, team, seat, true);
}
// host: a guest's intent becomes a real shot
function remoteBuild(seat, m) { fireBuild(new THREE.Vector3(...m.from), m.tgt, teamOf(seat), m.kind || 'single', seat, false); }
function remoteBlast(seat, m) {
  const team = teamOf(seat), from = new THREE.Vector3(...m.from), dir = new THREE.Vector3(...m.dir);
  if (m.kind === 'laser') fireLaser(from, dir, team, seat); else if (m.kind === 'bomb') fireBomb(from, dir, team, seat); else fireBlast(from, dir, m.area, team, seat);
}
function fireAs(agent, from, dir) {
  const k = LOADOUTS[V.seats[agent.seat]?.role || 'rapid'].blast.kind;
  if (k === 'laser') fireLaser(from, dir, agent.owner, agent.seat); else if (k === 'bomb') fireBomb(from, dir, agent.owner, agent.seat); else fireBlast(from, dir, false, agent.owner, agent.seat);
}
function versusShips() {
  const me = { seat: S.seat, team: S.team, pos: pilot.pos, fwd: pilot.fwd, vel: pilot.vel };
  return [me, ...V.shipList()];
}

// You can't build here: both buttons fire the blaster. Time held is the score's floor.
function contain(dt) {
  const h = G.raycast(camera.position, F, 60);
  HUD.cross(!!h && G.get(h.x, h.y, h.z) === G.LOOSE);
  if (!S.auto && (mouseL || mouseR)) trySecondary(dt, h); else S.blastCD -= dt;
  S.time += dt; S.score += dt * 5;
  updateBots(dt);
  HUD.clock(clock(S.time));
}
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function critical() {
  // slow-motion bloom, then the end screen
  S.slow = 1.4; S.flash = 1; S.shake = 1; S.ending = 1.6;
  for (let k = 0; k < 3; k++) FX.ring(new THREE.Vector3(), camera.position.clone().normalize(), k === 1 ? PAL.coral : 0xffffff, 30 + k * 12, 1.2 + k * 0.3);
  HUD.callout('Critical!', 'The core got too big', 'bad');
}

function impact(p, cracked) {
  FX.burst(p, PAL.plum, 14, 9, 0.32); FX.burst(p, PAL.orange, 10, 7, 0.22); FX.puff(p, 0xffffff, 10, 1.6, 0.8, 0.5);
  sfx.impact();
  const near = Math.max(0, 1 - camera.position.distanceTo(p) / 30);
  S.shake = Math.max(S.shake, 0.25 + near * 0.5);
  if (cracked && !S.ending) {
    S.integrity--; sfx.crack(); S.shake = 0.9;
    hudIntegrity();
    if (S.integrity <= 0) return finish('Cracked!', 'bad');
    HUD.callout('Cracked!', S.integrity === 1 ? 'One left' : `${S.integrity} left`, 'bad');
  }
}
function timeUp() { finish('Finish!', 'good'); }

// slow motion and the callout, then the result screen
function finish(word, tone) {
  S.slow = 1; S.shake = Math.max(S.shake, 0.5); S.ending = 1.7;
  HUD.callout(word, '', tone);
}

function best(key, v) {
  try {
    const k = `strata-best-${key}`, old = Number(localStorage.getItem(k) || 0);
    if (v > old) { localStorage.setItem(k, String(v)); return old > 0; }
  } catch {}
  return false;
}

function gameOver() {
  S.ending = 0;
  HUD.clearCallout();
  if (S.auto) setTimeout(() => { newRound(); setMode('play'); }, 4000);
  const total = Math.round(S.score).toLocaleString();
  if (S.game === 'containment') {
    HUD.result({ big: clock(S.time), unit: 'held off', record: best('containment', Math.floor(S.time)),
      cols: [['Bots downed', S.downed], ['Blocks cleared', S.cleared], ['Their layers', S.crit]], total });
  } else {
    const L = S.level, stars = starsFor(L, S.score);
    saveStars(L.id, stars);
    HUD.refreshLevelStars(LEVELS, bestStars);
    HUD.result({ big: total, unit: `Level ${L.id} · ${L.name}`, record: best(`survival-${L.id}`, Math.round(S.score)), stars,
      cols: [['Layers', S.sealed], ['Blocks', S.cemented], ['Meteors', S.meteorsDown]], total });
    for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 900 + k * 280);
  }
  HUD.wipe(() => setMode('over'));
  document.exitPointerLock?.();
}

// ---------- hud ----------
function hudGame() {
  HUD.keys(S.game);
  HUD.clock(clock(S.game === 'containment' ? 0 : S.level.time));
  HUD.tab(null);
}
function hudSeal() {
  if (!S.a) return;
  const covered = S.a.totalFaces - S.a.exposedFaces, c = S.game === 'containment';
  if (S.game === 'versus') return HUD.meter(covered, S.a.totalFaces, S.team === 1);
  HUD.meter(covered, S.a.totalFaces, c);
  HUD.tag(c ? `Layer ${S.layer}` : `Level ${S.level.id} · Layer ${S.layer}`);
  if (S.mode !== 'play' || noticeT > 0) return;
  // the left-edge tab names the moment: nearly sealed, or one from critical
  if (c) HUD.tab(S.crit === CRIT - 1 ? 'One more and it goes critical' : null, 'violet');
  else HUD.tab(S.a.exposedFaces <= 8 && S.a.exposedFaces > 0 ? 'Almost sealed' : null, 'lilac');
}
function hudIntegrity() {
  if (S.game === 'containment') HUD.gems(S.crit, CRIT, 'crit');
  else HUD.gems(S.integrity, 3, 'core');
  // one hit from losing: last core life, or one seal from critical
  HUD.danger(S.mode === 'play' && (S.game === 'containment' ? S.crit >= CRIT - 1 : S.game === 'survival' && S.integrity <= 1));
}
let noticeT = 0;
function notice(text, tone = 'violet') { noticeT = Math.max(2.4, text.length * 0.06); HUD.tab(null); requestAnimationFrame(() => HUD.tab(text, tone)); }
function hudArrows() {
  const W = innerWidth, Hh = innerHeight, list = [];
  const marks = S.game === 'containment' ? bots.filter(b => !b.dead).map(b => b.pilot.pos) : T.meteors.map(m => m.pos);
  for (const pos of marks) {
    const v = pos.clone().applyMatrix4(camera.matrixWorldInverse);
    const ndc = pos.clone().project(camera);
    if (v.z < 0 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95) continue;
    const a = Math.atan2(v.y, v.x);
    list.push({ x: W / 2 + Math.cos(a) * W * 0.42, y: Hh / 2 - Math.sin(a) * Hh * 0.4, a: Math.PI / 2 - a });
  }
  HUD.arrows(list, S.game === 'containment');
}
let hudTick = 0;
function hudSlow() {
  const fx = [];
  if (S.fx.big > 0) fx.push({ kind: 'big', color: Items.ITEMS.big.color, label: `${S.fx.big} big shots`, frac: S.fx.big / 5 });
  if (energy.infinite > 0) fx.push({ kind: 'infinite', color: Items.ITEMS.infinite.color, label: 'Infinite ammo', frac: energy.infinite / Items.ITEMS.infinite.dur });
  if (S.fx.boost > 0) fx.push({ kind: 'boost', color: Items.ITEMS.boost.color, label: 'Super speed', frac: S.fx.boost / Items.ITEMS.boost.dur });
  if (S.fx.shield > 0) fx.push({ kind: 'shield', color: Items.ITEMS.shield.color, label: 'Shield', frac: S.fx.shield / Items.ITEMS.shield.dur });
  HUD.effects(fx);
  HUD.radar({
    yaw, me: pilot.pos, core: Math.cbrt(G.coreCount) * 0.62,
    coreColor: `#${PAL.strata[(S.layer - 1) % PAL.strata.length].toString(16).padStart(6, '0')}`,
    items: Items.pickups.map(p => ({ pos: p.g.position, color: `#${Items.ITEMS[p.kind].color.toString(16).padStart(6, '0')}` })),
    meteors: T.meteors.map(m => ({ pos: m.pos, eta: m.eta ?? 9 })),
    drones: T.drones.map(d => ({ pos: d.pos })),
    ships: S.game === 'versus' ? V.shipList().map(s => ({ pos: s.pos, fwd: s.fwd, color: TEAM[s.team].css })) : bots.filter(b => !b.dead).map(b => ({ pos: b.pilot.pos, fwd: b.pilot.fwd })),
    meColor: S.game === 'versus' ? TEAM[S.team].css : '#ff6a3d',
  });
}

// ---------- loop ----------
let last = performance.now(), lastStep = 0, attractReset = 0;
function frame(rdt) {
  lastStep = performance.now();
  let dt = rdt;
  if (S.slow > 0) { S.slow -= rdt; dt *= 0.15; }
  if (S.ending > 0) { S.ending -= rdt; if (S.ending <= 0) gameOver(); }
  if (S.mode !== 'pause' || S.game === 'versus') {
    S.t += dt;
    cloudLayer.rotation.y += dt * 0.006;
    if (S.mode === 'title') {
      // the attract loop seals two layers, lets the second land, then starts over
      if (S.sealed >= 2) { attractReset += dt; if (attractReset > 3) { attractReset = 0; newRound('survival'); } }
      autopilot(dt); orbitCamera(rdt);
    } else if (S.mode === 'play' || (S.mode === 'pause' && S.game === 'versus')) play(dt);
    else orbitCamera(rdt);
    updateShots(dt);
    FX.update(dt);
    B.update(S.t);
    updateBeacons(S.t);
  }
  S.shown += (S.score - S.shown) * (1 - Math.exp(-8 * rdt));
  HUD.score(S.shown);
  if (S.mode === 'play') {
    if (S.game === 'versus') HUD.labels(V.shipList(), camera, TEAM, LOADOUTS); else hudArrows();
    if ((hudTick += rdt) > 1 / 30) { hudTick = 0; hudSlow(); }
  }
  if (noticeT > 0 && (noticeT -= rdt) <= 0) { HUD.tab(null); hudSeal(); }

  S.shake = Math.max(0, S.shake - rdt * 1.8);
  const s = S.shake * S.shake * 0.35;
  camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
  S.flash = Math.max(0, S.flash - rdt * 2.2);
  HUD.flash(S.flash * S.flash);
  ocean.material.uniforms.t.value = S.t;
  post.render(scene, camera);
}
function tick(now) {
  requestAnimationFrame(tick);
  frame(Math.min(0.05, (now - last) / 1000)); last = now;
}
// the embedded preview throttles rAF; keep stepping if it stalls
setInterval(() => { if (performance.now() - lastStep > 250) { frame(0.05); last = performance.now(); } }, 60);

// ---------- boot ----------
// The loading screen covers shader compilation: put one of everything in the
// scene, compile, render once, clear. No hitch the first time a meteor,
// pickup, bot or laser appears.
function warmUp() {
  for (const k of Object.keys(T.KINDS)) T.spawnMeteor(5, k);
  T.spawnDrone();
  for (let k = 0; k < 3; k++) Items.spawn('survival');
  Items.throwSmoke(new THREE.Vector3(0, 0, 8));
  addBot();
  fireBuild(new THREE.Vector3(0, 0, 10), { x: 0, y: 0, z: 2 }, 1);
  FX.beam(new THREE.Vector3(0, 0, 12), new THREE.Vector3(0, 0, 3), PAL.mine);
  shield.visible = true; ghosts[0].visible = true;
  renderer.compile(scene, camera);
  post.render(scene, camera);
  shield.visible = false;
  newRound('survival');
}

const params = new URLSearchParams(location.search);
const startGame = params.get('mode') === 'containment' ? 'containment' : 'survival';
if (params.has('level')) S.level = LEVELS[Math.min(2, Math.max(0, Number(params.get('level')) - 1))];
newRound();
if (params.has('watch')) { S.auto = true; newRound(startGame); setMode('play'); $('loading').classList.add('hidden'); }
else {
  setMode('title', 'splash');
  // The letters run on their own fixed beat (CSS), so a busy main thread
  // can't bunch them up. Shader warm-up happens behind them; the exit waits
  // for both the beat and the warm-up. Timers, not rAF, so a backgrounded
  // tab still finishes.
  const L = $('loading'), BEAT = 2050;
  let warm = false;
  setTimeout(() => {
    L.classList.add('go');
    setTimeout(() => { warmUp(); warm = true; }, 160);
  }, 30);
  const exit = () => {
    if (!warm) return setTimeout(exit, 40);
    L.classList.add('exit');
    S.intro = INTRO;
    setTimeout(() => $('splash').classList.add('enter'), 750);
    setTimeout(() => L.classList.add('hidden'), 1150);
    // an invite link drops you straight into the room
    if (params.get('room')) { V.join(params.get('room')); toLobby(); }
  };
  setTimeout(exit, BEAT);
}
requestAnimationFrame(tick);

window.__strata = {
  S, G, pilot, T, Items, energy, music: musicState, pause: () => setMode('pause'),
  step: (dt = 1 / 60, n = 1) => { for (let k = 0; k < n; k++) frame(dt); },
  start: (game = 'survival', level = 1, loadout) => { S.level = LEVELS[level - 1]; if (loadout) S.loadout = loadout; newRound(game); setMode('play'); },
  screen: scr => setMode('title', scr), over: () => gameOver(),
  skill: k => { me.skill = k; },
  get bots() { return bots; }, addBot, hitBot,
  aim: (y, p) => { yaw = y; pitch = p; },
  fire: () => { aimFwd(F); const t = targetFrom(camera.position, F); if (t) fireBuild(pilot.nose(), t, 0, LOADOUTS[S.loadout].build.pattern); return t; },
  blast: () => { aimFwd(F); trySecondary(1, G.raycast(camera.position, F, 60)); },
  give: k => { S.held = k; HUD.slot(k, Items.ITEMS[k]); }, use: () => useItem(), V,
  auto: on => { S.auto = on; },
  meteor: (kind = 'normal') => T.spawnMeteor(6, kind),
  // debug: cover every open face except `leave` of them
  cover: (leave = 0) => { for (const f of S.a.faces.slice(leave)) { G.place(f[0] + f[3], f[1] + f[4], f[2] + f[5]); S.lastPlace.set(f[0] + f[3], f[1] + f[4], f[2] + f[5]); } reanalyze(); return S.a.exposedFaces; },
  drone: () => T.spawnDrone(),
};
