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
import { buildShip, Pilot, DASH, SWOOP, flashShip, updateFlashes } from './ship.js';
import { sfx, isMuted, setMuted, startMusic, musicLevel, musicState, muffle } from './audio.js';
import { LEVELS, pickKind, starsFor, bestStars, saveStars } from './levels.js';
import { LOADOUTS, Energy, pattern, tempo } from './weapons.js';
import { createVersus, TEAM, teamOf, IMMUNE } from './versus.js';
import { prefs, onPrefs, set as setPref, reset as resetPrefs } from './settings.js';

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

// last-faces beacons: when a layer is nearly closed, show the gaps through everything.
// Same threshold as the "Almost sealed" tab, so layer 1 lights only its last two.
const beaconMat = new THREE.MeshBasicMaterial({ color: PAL.orange, depthTest: false, transparent: true });
const beaconGeo = new THREE.RingGeometry(0.28, 0.42, 24);
const beacons = Array.from({ length: 8 }, () => { const m = fxOnly(new THREE.Mesh(beaconGeo, beaconMat)); m.renderOrder = 20; m.visible = false; scene.add(m); return m; });
// "almost sealed": a quarter of the faces left, at most 8 (layer 1 has only 6)
const nearly = () => Math.min(8, Math.ceil(S.a.totalFaces / 4));
const NOWHERE = new THREE.Vector3(0, -9999, 0);
function updateBeacons(t) {
  const faces = S.mode === 'play' && S.a && S.a.exposedFaces <= nearly() ? S.a.faces : [];
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
// Shield: a soap-bubble shell, nearly clear facing you and bright at the rim,
// with faint bands drifting over it. A hit sends a ripple out from where it landed.
const shieldMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { tint: { value: new THREE.Color(0xff7ac0) }, t: { value: 0 }, hitDir: { value: new THREE.Vector3(0, 1, 0) }, hitAge: { value: 9 } },
  vertexShader: `varying vec3 vN, vWN, vV;
    void main(){ vN = normal; vec4 w = modelMatrix * vec4(position, 1.); vWN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 tint, hitDir; uniform float t, hitAge; varying vec3 vN, vWN, vV;
    void main(){
      float fres = pow(1. - abs(dot(vWN, vV)), 2.4);
      float bands = .5 + .5 * sin(vN.y * 16. + t * 2.2);
      float ang = acos(clamp(dot(normalize(vN), hitDir), -1., 1.));
      float rip = exp(-pow((ang - hitAge * 5.) * 4.5, 2.)) * max(0., 1. - hitAge / .7);
      float a = .02 + fres * .62 + bands * fres * .12 + rip * .8;
      gl_FragColor = vec4(mix(tint, vec3(1.), fres * .45 + rip * .6) * a, 1.);
    }`,
});
const shield = new THREE.Mesh(new THREE.SphereGeometry(1.45, 40, 24), shieldMat);
fxOnly(shield); shield.visible = false; scene.add(shield);
const shieldHit = from => { shieldMat.uniforms.hitDir.value.copy(from).sub(pilot.pos).normalize(); shieldMat.uniforms.hitAge.value = 0; };

const shotGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46), shotMat = paint(PAL.mine, { roughness: 0.3, rim: 0.5 }), botShotMat = paint(PAL.bot, { roughness: 0.3, rim: 0.5 });
const blastGeo = new THREE.SphereGeometry(0.24, 14, 10), blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.orange).multiplyScalar(2.2) });
const botBlastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.botGlow).multiplyScalar(1.8) });
const bombGeo = new THREE.SphereGeometry(0.34, 18, 12), bombMat = paint(0x3a2a4a, { roughness: 0.3, rim: 0.6, rimColor: PAL.mine }), bombMatB = paint(0x3a2a4a, { roughness: 0.3, rim: 0.6, rimColor: PAL.botGlow });
const bombRingGeo = new THREE.TorusGeometry(0.4, 0.05, 8, 24), bombRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(1.8) });

function resize() {
  const dpr = Math.min(devicePixelRatio, prefs.quality === 'low' ? 1 : 2), w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  post.setSize(w, h, dpr);
  camera.aspect = w / h; camera.updateProjectionMatrix(); frameOffset();
}
addEventListener('resize', resize);

// ---------- state ----------
const S = {
  mode: 'title', screen: 'splash', game: 'survival', level: LEVELS[0], loadout: 'rapid', auto: false,
  t: 0, slow: 0, shake: 0, flash: 0, ending: 0, stop: 0, immune: 0, dodged: false, lastStop: 0, kick: new THREE.Vector3(), fovKick: 0, kills: 0, dashN: 2,
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
// Fast graphics: one pixel per CSS pixel, no shadows, no bloom
onPrefs((p, k) => {
  if (k && k !== 'quality') return;
  const low = p.quality === 'low';
  post.bloom.enabled = !low;
  if (renderer.shadowMap.enabled === low) {
    renderer.shadowMap.enabled = !low;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
  resize();
});

// ---------- feel ----------
// Hit-stop freezes the world for a few frames so a hit lands. Small ones are
// rate-limited, so a stream of breaks doesn't stutter.
function hitstop(t, minor = false) {
  const now = performance.now();
  if (minor && now - S.lastStop < 140) return;
  S.stop = Math.max(S.stop, t); S.lastStop = now;
}
// your shot connected: a tick and a marker, or a bigger one for a kill
function confirmHit(killed) {
  if (S.mode !== 'play' || S.auto) return;
  HUD.hitMark(killed ? 'killed' : 'hit');
  if (killed) sfx.kill(); else sfx.hit();
  hitstop(killed ? 0.065 : 0.035, !killed);
  S.shake = Math.max(S.shake, killed ? 0.3 : 0.12);
}
// you got hit: freeze, the plane flashes white, the screen whites out from
// that side, a shove away from it, and the sound goes underwater
function hurtMe(from, power = 1) {
  hitstop(0.1 * power);
  S.flash = Math.max(S.flash, 0.5 * power); S.shake = Math.max(S.shake, 0.85 * power);
  S.kick.addScaledVector(pilot.pos.clone().sub(from).normalize(), 0.6 * power);
  flashShip(pilot.mesh, 0.16);
  const v = from.clone().applyMatrix4(camera.matrixWorldInverse), d = Math.hypot(v.x, v.y) || 1;
  HUD.hurt(v.x / d, -v.y / d);
  FX.burst(pilot.pos, 0xffffff, 10, 8, 0.18);
  sfx.hurt(); muffle(0.5 + 0.3 * power);
}
// the gun's own kick: a white muzzle pop and a nudge of the camera
function muzzle(from, size, recoil) {
  FX.dot(from, 0xffffff, size, 0.07);
  S.kick.addScaledVector(F, -recoil);
  S.fovKick -= recoil * 6;
}
const mine = seat => seat == null || seat < 0 || seat === S.seat;

function reanalyze() {
  S.a = G.analyze();
  // versus guests never seal on their own: the host's seal op decides
  if (S.a.exposedFaces === 0 && G.looseCount > 0 && !(S.game === 'versus' && !V.isHost)) return sealLayer();
  B.sync(S.t);
  hudSeal();
}

function newRound(game = S.game) {
  S.game = game;
  G.reset(1);
  clearBots();
  for (const s of shots) scene.remove(s.m);
  shots.length = 0; pending.clear();
  T.clear(); FX.clear(); Items.clear(); B.clearCracks();
  const L = S.level;
  S.kick.set(0, 0, 0);
  pilot.mesh.visible = true;
  Object.assign(S, { score: 0, shown: 0, layer: 1, sealed: 0, integrity: 3, slow: 0, shake: 0, flash: 0, ending: 0, stop: 0, fovKick: 0, dashN: 2, immune: 0,
    crit: 0, time: 0, downed: 0, botT: 35, cemented: 0, meteorsDown: 0, cleared: 0,
    left: L.time, waveT: L.firstWave, wave: 0, queue: [], droneT: 0, itemT: game === 'tutorial' ? Infinity : 8,
    held: null, fx: { big: 0, boost: 0, shield: 0 } });
  energy.reset();
  if (game === 'containment') addBot();
  if (game !== 'versus') { recolorShip(-1); HUD.versusHud(false); }
  hudGame();
  yaw = 0; pitch = 0;
  // start close: the first core is a single block
  pilot.reset(new THREE.Vector3(0, 1, 7.5), new THREE.Vector3(0, 0, -1));
  camPos.set(0, 2.5, 12.5);
  reanalyze(); hudIntegrity(); HUD.slot(null);
  S.tut = game === 'tutorial' ? { n: 0, t: 0, cleared: 0, over: false, turned: 0, flown: 0, placed: 0, dashes: 0, swoops: 0, again: 0 } : null;
  if (S.tut) tutStep(0); else HUD.tutor(null);
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
// Build assist: if your aim is within a few degrees of an open core face you
// can see, the shot snaps to it. Building on top of your own loose blocks
// still works when you aim at them directly.
const ASSIST = Math.cos(THREE.MathUtils.degToRad(3.2));
let faceSet = null, faceSetOf = null;
function openFaceCells() {
  if (faceSetOf !== S.a) {
    faceSetOf = S.a; faceSet = new Set();
    for (const f of S.a.faces) faceSet.add(G.idx(f[0] + f[3], f[1] + f[4], f[2] + f[5]));
  }
  return faceSet;
}
const assistDir = new THREE.Vector3();
function aimTarget(origin, dir) {
  const raw = targetFrom(origin, dir);
  if (!S.a || (raw && openFaceCells().has(G.idx(raw.x, raw.y, raw.z)))) return raw;
  let best = null, bestDot = ASSIST;
  for (const f of S.a.faces) {
    const x = f[0] + f[3], y = f[1] + f[4], z = f[2] + f[5];
    if (blocked(x, y, z)) continue;
    // the face has to point at you
    if ((origin.x - x) * f[3] + (origin.y - y) * f[4] + (origin.z - z) * f[5] <= 0) continue;
    assistDir.set(x - origin.x, y - origin.y, z - origin.z).normalize();
    const d = assistDir.dot(dir);
    if (d > bestDot) { bestDot = d; best = [x, y, z]; }
  }
  if (!best) return raw;
  // only if nothing is in the way
  const t = targetFrom(origin, assistDir.set(best[0] - origin.x, best[1] - origin.y, best[2] - origin.z).normalize());
  return t && t.x === best[0] && t.y === best[1] && t.z === best[2] ? t : raw;
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
  if (seat === S.seat || (seat < 0 && !owner)) { sfx.fire(); HUD.kick(); if (S.mode === 'play') muzzle(from, kind === 'single' ? 0.26 : 0.4, 0.035); }
  if (isVersusHost() && !visual) V.shot(seat, 'build', from, { x: tgt.x, y: tgt.y, z: tgt.z, n: tgt.n }, kind);
}

function fireBlast(from, dir, area, team, seat = -1, visual = false) {
  const m = new THREE.Mesh(blastGeo, team === 1 ? botBlastMat : blastMat); m.position.copy(from); fxOnly(m); scene.add(m);
  if (area) m.scale.setScalar(1.6);
  shots.push({ kind: 'blast', m, p: from.clone(), v: dir.clone().multiplyScalar(75), life: 0.7, area, team, seat, visual });
  if (seat === S.seat || seat < 0) { sfx.blast(); HUD.kick(); if (S.mode === 'play') muzzle(from, 0.42, 0.09); }
  if (isVersusHost() && !visual) V.shot(seat, 'bolt', from, dir.toArray());
}

// Bomb: heavy, lobbed, slow. It breaks the block it hits plus the six blocks
// touching its faces, and stuns ships caught in the blast.
function fireBomb(from, dir, team, seat = -1, visual = false) {
  const m = new THREE.Mesh(bombGeo, team === 1 ? bombMatB : bombMat); m.position.copy(from); m.castShadow = true;
  const ring = new THREE.Mesh(bombRingGeo, bombRingMat); m.add(ring);
  scene.add(m);
  shots.push({ kind: 'bomb', m, p: from.clone(), v: dir.clone().multiplyScalar(36), life: 1.6, team, seat, visual });
  if (seat === S.seat || seat < 0) { sfx.blast(); HUD.kick(); if (S.mode === 'play') muzzle(from, 0.5, 0.15); }
  if (isVersusHost() && !visual) V.shot(seat, 'bomb', from, dir.toArray());
}
function explode(p, team, seat, visual) {
  FX.burst(p, 0xffd27a, 18, 11, 0.3); FX.burst(p, team === 1 ? PAL.bot : PAL.mine, 10, 8, 0.26);
  FX.puff(p, 0xffffff, 12, 1.8, 0.9, 0.55);
  FX.ring(p, camera.position.clone().sub(p).normalize(), 0xffffff, 4, 0.4);
  sfx.impact();
  S.shake = Math.max(S.shake, Math.max(0, 0.6 - camera.position.distanceTo(p) / 40));
  if (mine(seat) && S.mode === 'play') hitstop(0.06);
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
  if (seat === S.seat || seat < 0) { sfx.laser(); HUD.kick(); S.shake = Math.max(S.shake, 0.15); if (S.mode === 'play') muzzle(from, 0.5, 0.13); }
  if (isVersusHost() && !visual) V.shot(seat, 'laser', from, dir.toArray());
}

function destroyBlock(i, byPlayer, seat) {
  const theirs = G.owner[i];
  if (!G.remove(G.cx(i), G.cy(i), G.cz(i))) return;
  if (byPlayer && theirs && S.game !== 'versus') { S.score += 5; S.cleared++; }
  if (isVersusHost()) V.removed(i, seat);
  breakFX(i, theirs);
  if (byPlayer && mine(seat)) confirmHit(false);
  reanalyze();
}
function breakFX(i, team) {
  const p = new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i));
  // a white pop the size of the block, then the pieces
  FX.puff(p, 0xffffff, 1, 0, 0.85, 0.1);
  FX.burst(p, team ? PAL.bot : PAL.mine, 8, 6, 0.24); FX.puff(p, 0xffffff, 3, 0.5, 0.4);
  sfx.pop();
}

function kill(kind, p) {
  FX.burst(p, kind === 'meteor' ? PAL.plum : kind === 'bot' ? PAL.bot : 0x2d5566, 16, 10, 0.3);
  FX.puff(p, 0xffffff, 8, 1.2, 0.7);
  FX.ring(p, camera.position.clone().sub(p).normalize(), 0xffffff, 3, 0.35);
  S.score += kind === 'meteor' ? 50 : kind === 'bot' ? 100 : 25;
  if (kind === 'meteor') S.meteorsDown++;
  S.kills++;
  HUD.bump();
  S.shake = Math.max(S.shake, 0.25);
  confirmHit(true);
  sfx.pop();
}

// a bolt that clips a meteor or nibbler: kills confirm themselves
function threatHit(p, r) {
  const k = S.kills, h = T.hitTest(p, r, kill);
  if (h && S.kills === k) confirmHit(false);
  return h;
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
        if (S.tut && !s.owner) S.tut.placed += placed;
        if ((!s.owner && s.seat < 0) || (s.seat >= 0 && s.seat === S.seat)) used('place');
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
        if (s.visual) {
          if (c || (S.game === 'versus' && V.shipNear(s.p, s.team))) hit = true;
          // a guest's own bolt: confirm the break it will get from the host
          if (c === G.LOOSE && s.seat === S.seat && G.owner[G.idx(x, y, z)] !== s.team) confirmHit(false);
          continue;
        }
        if (S.game === 'versus' ? V.hitShips(s.p, 0.95, s.team, 'bolt', s.seat) : hitBot(s.p) || threatHit(s.p, s.area ? 0.6 : 0.3)) { hit = true; break; }
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
  if (e.code === 'KeyH') { const k = $('keys'); if (k.classList.contains('retired')) k.classList.remove('retired'); else k.classList.toggle('hidden'); used('hide'); }
  if (S.mode === 'play' && !S.auto) used(USE_KEYS[e.code]);
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyE' && S.mode === 'play' && !S.auto) useItem();
  if (e.code === 'KeyQ' && !e.repeat && S.mode === 'play' && !S.auto) dash();
  if (!e.repeat && S.mode === 'play' && !S.auto) doubleTap(e.code, e.timeStamp / 1000);
  if (e.code === 'Escape' && S.mode === 'play' && !locked) setMode('pause');
  if (e.code === 'Enter' && S.mode === 'play' && S.game === 'tutorial') leaveTutorial('menu');
  if (S.mode === 'title' && S.screen === 'ready') {
    if (e.code === 'Enter') playLevelOne();
    if (e.code === 'Escape') go('menu');
  }
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
  const k = 0.0021 * prefs.sens;
  yaw -= e.movementX * k;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * k * (prefs.invert ? -1 : 1), -1.45, 1.45);
  if (S.mode === 'play' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) used('aim');
  if (S.tut) S.tut.turned += (Math.abs(e.movementX) + Math.abs(e.movementY)) * k;
});
canvas.addEventListener('mousedown', e => {
  if (S.mode !== 'play') return;
  if (!locked) lock();
  if (e.button === 0) mouseL = true;
  if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', e => e.preventDefault());

function toggleMute() { setMuted(!isMuted()); HUD.mute(isMuted()); used('mute'); }

// Which controls the player has used, kept between visits, so the hint bar
// can retire itself. Item, Mute and Hide don't hold it up.
const USE_KEYS = { KeyW: 'fly', KeyA: 'fly', KeyS: 'fly', KeyD: 'fly', Space: 'up', ShiftLeft: 'down', ShiftRight: 'down' };
const CORE_KEYS = ['aim', 'fly', 'up', 'down', 'dash', 'swoop', 'place', 'blast'];
const usedSet = new Set((() => { try { return JSON.parse(localStorage.getItem('strata-used') || '[]'); } catch { return []; } })());
function used(id) {
  if (!id || usedSet.has(id) || S.auto) return;
  usedSet.add(id); HUD.usedKey(id);
  try { localStorage.setItem('strata-used', JSON.stringify([...usedSet])); } catch {}
  if (CORE_KEYS.every(k => usedSet.has(k))) setTimeout(HUD.retireKeys, 1200);
}
HUD.mute(isMuted(), toggleMute);

// ---------- screens ----------
// title screens sit over the attract loop: splash → menu → (levels) → loadout
function setMode(m, scr = S.screen) {
  S.mode = m; S.screen = scr;
  musicLevel(m === 'pause' ? 'quiet' : 'normal');
  frameOffset();
  HUD.screen(m === 'title' ? scr : m === 'pause' ? 'pause' : m === 'over' ? 'result' : null);
  if (m === 'pause') $('restart').classList.toggle('hidden', S.game === 'versus');
  showGhost([]);
  if (m !== 'play') HUD.tab(null);
  if (m === 'play') hudIntegrity(); else if (m !== 'pause') HUD.danger(false);
}
const go = scr => { sfx.select(); setMode('title', scr); };
function start(game = S.game) {
  sfx.unlock(); lock();
  HUD.wipe(() => { newRound(game); setMode('play'); if (game !== 'tutorial') HUD.callout('Go!', '', 'good'); });
}
function toMenu() { HUD.clearCallout(); HUD.wipe(() => { newRound('survival'); setMode('title', 'menu'); }); }

HUD.init();
// phones and tablets can't fly it: say so, and offer to watch instead
const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
if (touchOnly) $('pressText').textContent = 'Tap to start';
// a first visit goes straight into the tutorial; after that, the menu
$('splash').onclick = () => {
  sfx.unlock(); startMusic();
  if (touchOnly) return go('touch');
  if (!tutored()) return start('tutorial');
  go('menu');
};
$('watchIt').onclick = () => { sfx.select(); document.body.classList.add('watch'); HUD.wipe(() => { S.auto = true; newRound('survival'); setMode('play'); }); };
HUD.how(() => go('menu'));
$('howTutorial').onclick = () => { sfx.select(); start('tutorial'); };
$('readyPlay').onclick = () => playLevelOne();
$('readyMenu').onclick = () => go('menu');
// settings opens over the menu or the pause screen and goes back to whichever it was
const syncSettings = HUD.settings(prefs, setPref, () => { sfx.select(); setMode(S.mode, S.screen); });
const openSettings = () => { sfx.select(); syncSettings(); HUD.screen('settings'); };
$('setReset').onclick = () => { resetPrefs(); syncSettings(); };
addEventListener('pointerdown', startMusic, { once: true });
HUD.menu(pick => {
  if (pick === 'how') return go('how');
  if (pick === 'settings') return openSettings();
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
$('quit').onclick = () => { if (S.game === 'versus') V.leave(); if (S.game === 'tutorial') markTutored(); toMenu(); };
$('resume').onclick = () => { setMode('play'); lock(); };
$('restart').onclick = () => { sfx.select(); start(); };
$('pauseSettings').onclick = openSettings;
$('nextLevel').onclick = () => { S.level = LEVELS[S.level.id]; start(); };

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
  // a dash and recoil punch it briefly
  const fov = (S.fx.boost > 0 ? 82 : 68) + (pilot.dashing ? 9 : 0) + S.fovKick;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-12 * dt)); camera.updateProjectionMatrix(); }
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
const me = AI.agent(pilot, { dash: true });
// title + ?watch: you build in Survival, defend in Containment
const autopilot = dt => {
  me.rate = LOADOUTS[S.loadout].build.rate * tempo(S.layer);
  (S.game === 'containment' && S.mode === 'play' ? AI.defend : AI.build)(me, dt, aiCtx);
};

const V = createVersus({
  S, scene, pilot, aiCtx, notice, gotItem, stunMe, onStun, startVersus, versusOver,
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
let CRIT = 7; const MAX_BOTS = 4, BOT_HP = 5;
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
  flashShip(b.mesh, 0.12);
  if (b.hp > 0) confirmHit(false);
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
  sfx.use(); used('item');
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
  if (S.fx.boost > 0 && Math.random() < 0.45) FX.dot(pilot.pos.clone().addScaledVector(pilot.fwd, -1.1), 0xffffff, 0.05 + Math.random() * 0.08, 0.2 + Math.random() * 0.12);
  shield.visible = S.fx.shield > 0 && (S.fx.shield > 2 || Math.floor(S.t * 8) % 2 === 0);
  shield.position.copy(pilot.pos);
  shieldMat.uniforms.t.value = S.t; shieldMat.uniforms.hitAge.value += dt;
}

// ---------- play ----------
const wishV = new THREE.Vector3();
function fly(dt) {
  if (S.auto) {
    autopilot(dt);
    pitch = Math.asin(THREE.MathUtils.clamp(pilot.fwd.y, -1, 1)); yaw = Math.atan2(-pilot.fwd.x, -pilot.fwd.z);
  } else {
    swoopCamera();
    aimFwd(F); R.set(Math.cos(yaw), 0, -Math.sin(yaw));
    wishFromKeys(wishV);
    pilot.update(dt, wishV, F, R);
    swoopCamera();
  }
  chaseCamera(dt);
  aimFwd(F);
}

function wishFromKeys(out) {
  out.set(0, 0, 0);
  if (keys.has('KeyW')) out.add(F); if (keys.has('KeyS')) out.sub(F);
  if (keys.has('KeyD')) out.add(R); if (keys.has('KeyA')) out.sub(R);
  if (keys.has('Space')) out.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) out.y -= 1;
  if (out.lengthSq() > 1) out.normalize();
  return out;
}
// Dash (Q): toward the keys you're holding, or where you're looking. Hold
// Shift or Space with it to drop under or pop over the core.
function dash() {
  aimFwd(F); R.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const dir = wishFromKeys(new THREE.Vector3());
  if (dir.lengthSq() < 0.01) dir.copy(F);
  if (!pilot.tryDash(dir, R)) { if (pilot.stun <= 0) noAmmo(); return; }
  S.dodged = false;
  if (S.tut) S.tut.dashes++;
  used('dash');
  sfx.dash();
  S.fovKick += 4;
  FX.ring(pilot.pos, dir, 0xffffff, 0.8, 0.18);
  kickoff(dir);
}
// Close call: a dash that slips past a meteor or an enemy shot at close range
// gives the charge back, a beat of slow motion and a few points.
function closeCall() {
  if (!pilot.dashing || S.dodged) return;
  const p = pilot.pos;
  const near = S.game === 'versus'
    ? shots.some(s => (s.kind === 'blast' || s.kind === 'bomb') && s.team !== S.team && s.p.distanceTo(p) < 1.8)
    : T.meteors.some(o => o.pos.distanceTo(p) < 1.4 + o.K.r);
  if (!near) return;
  S.dodged = true;
  pilot.dashN = Math.min(DASH.charges, pilot.dashN + 1);
  // slow motion would slow everyone in Versus, so there it's a flash and a punch
  if (S.game !== 'versus') { S.slow = Math.max(S.slow, 0.4); S.score += 25; }
  S.fovKick -= 5;
  FX.ring(p, camera.position.clone().sub(p).normalize(), 0xbfefff, 3.2, 0.45);
  sfx.dodge(); HUD.pop('Close call');
}
// Swoop: double-tap A or D to arc round to the next face of the core, Space to
// go over the top, Shift to go underneath. You arrive square to that face and
// looking at the core. It costs a dash charge.
const TAP = { KeyA: 'left', KeyD: 'right', Space: 'up', ShiftLeft: 'down', ShiftRight: 'down' }, DOUBLE = 0.3;
const lastTap = {};
// timed from when each key went down, so a slow frame can't split a double-tap
function doubleTap(code, now) {
  const way = TAP[code];
  if (!way) return;
  if (now - (lastTap[way] || 0) < DOUBLE) { lastTap[way] = 0; swoop(way); } else lastTap[way] = now;
}
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const swoopAim = { y0: 0, dy: 0, p0: 0, p1: 0 };
function swoop(way) {
  if (pilot.swooping || pilot.dashing) return;
  aimFwd(F); R.set(Math.cos(yaw), 0, -Math.sin(yaw)); U.crossVectors(R, F);
  const want = (way === 'left' || way === 'right' ? R : U).clone().multiplyScalar(way === 'left' || way === 'down' ? -1 : 1);
  const from = pilot.pos.clone().normalize();
  // the face you're on is the axis you're most over; the next one is the
  // neighbouring face most in the direction you asked for
  const here = AXES.reduce((a, b) => (b.dot(from) > a.dot(from) ? b : a));
  let to = null, best = 0.2;
  for (const n of AXES) if (Math.abs(n.dot(here)) < 0.5 && n.dot(want) > best) { best = n.dot(want); to = n; }
  if (!to) return;
  // orbit clear of everything solid, and end at a working distance
  const b = G.solidBox(), safe = Math.hypot(Math.max(-b.x0, b.x1) + 0.5, Math.max(-b.y0, b.y1) + 0.5, Math.max(-b.z0, b.z1) + 0.5);
  const r0 = pilot.pos.length(), r1 = THREE.MathUtils.clamp(r0, safe + 1.5, safe + 9);
  // where you end up and where you look: the crosshair lands on the core
  let end = to.clone().multiplyScalar(r1), y1 = yaw, p1;
  if (Math.abs(to.y) > 0.9) {
    // over or under: keep your heading and tip almost straight down (or up);
    // the camera can't look quite vertical, so the plane stops a little off
    // centre to put the core in the crosshair
    p1 = -Math.sign(to.y) * 1.45;
    const f = aimFwd(new THREE.Vector3(), y1, p1), r = new THREE.Vector3(Math.cos(y1), 0, -Math.sin(y1)), u = new THREE.Vector3().crossVectors(r, f);
    const s = (r1 + 1.75 * u.dot(to) + 1.25 * r.dot(to)) / -f.dot(to);
    end = f.multiplyScalar(-s).addScaledVector(u, -1.75).addScaledVector(r, -1.25);
  } else [y1, p1] = aimAtCore(end, yaw);
  if (!pilot.trySwoop(from, end.clone().normalize(), r0, end.length(), way === 'left' ? 1 : -1)) { if (pilot.stun <= 0) noAmmo(); return; }
  Object.assign(swoopAim, { y0: yaw, dy: THREE.MathUtils.euclideanModulo(y1 - yaw + Math.PI, Math.PI * 2) - Math.PI, p0: pitch, p1 });
  if (S.tut) S.tut.swoops++;
  used('swoop');
  sfx.swoop();
  S.fovKick += 6;
  kickoff(to.clone().sub(from));
}
// the heading and pitch whose chase camera, from a plane at p, looks through the
// core's centre; looking straight up or down keeps the heading you had
function aimAtCore(p, y) {
  let pt = 0;
  const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), d = new THREE.Vector3();
  for (let k = 0; k < 5; k++) {
    aimFwd(f, y, pt); r.set(Math.cos(y), 0, -Math.sin(y)); u.crossVectors(r, f);
    d.copy(p).addScaledVector(f, -5.6).addScaledVector(u, 1.75).addScaledVector(r, 1.25).negate().normalize();
    pt = THREE.MathUtils.clamp(Math.asin(d.y), -1.45, 1.45);
    if (Math.abs(d.y) < 0.9) y = Math.atan2(-d.x, -d.z);
  }
  return [y, pt];
}
function swoopCamera() {
  if (!pilot.swooping) return;
  const k = pilot.swoopK;
  yaw = swoopAim.y0 + swoopAim.dy * k; pitch = swoopAim.p0 + (swoopAim.p1 - swoopAim.p0) * k;
}
// the push-off for a dash or swoop: a small, uneven scatter of puffs left
// behind you, sizes mixed so it reads as air, not a row of balls
function kickoff(dir) {
  const back = pilot.pos.clone().addScaledVector(dir.clone().normalize(), -0.7);
  for (let k = 0; k < 5; k++) FX.puff(back, 0xffffff, 1, 0.5, 0.08 + Math.random() * 0.16, 0.2 + Math.random() * 0.15);
}
// Wingtip streaks while dashing or swooping: fine, mixed sizes, set just
// behind the wing so they never sit between you and the camera. A dash adds
// a few sparse puffs off the tail.
function dashTrail() {
  if (!pilot.dashing && !pilot.swooping) return;
  const b = pilot.mesh.userData.body;
  for (const s of [-1, 1]) FX.dot(b.localToWorld(tmp.set(s * 1.05, 0, -0.35)), 0xffffff, 0.04 + Math.random() * 0.05, pilot.swooping ? 0.38 : 0.26);
  if (pilot.dashing && Math.random() < 0.4) FX.dot(b.localToWorld(tmp.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, -0.9)), 0xdff6ff, 0.06 + Math.random() * 0.1, 0.16);
}

// the blaster: bolt, cross bolt or laser, by loadout; costs energy
function trySecondary(dt, aimHit) {
  const L = LOADOUTS[S.loadout].blast;
  S.blastCD -= dt;
  if (S.blastCD > 0 || pilot.stun > 0) return;
  if (!energy.use(L.cost)) return noAmmo();
  used('blast');
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
  closeCall();
  dashTrail();
  blinkImmune(dt);
  if (pilot.dashN > S.dashN && dt > 0) sfx.dashReady();
  S.dashN = pilot.dashN;
  HUD.dash(pilot.dashN, pilot.dashCD / DASH.recharge);
  energy.update(dt); S.emptyCD -= dt;
  updateItems(dt);
  if (S.game === 'versus') versusPlay(dt);
  else if (S.game === 'containment') contain(dt);
  else if (S.game === 'tutorial') tutor(dt);
  else survive(dt);
  HUD.ammo(energy.frac, { charging: energy.charging, empty: energy.empty > 0, infinite: energy.infinite > 0 });
}

// left click builds, right click blasts (Survival and the tutorial)
function buildGuns(dt) {
  const L = LOADOUTS[S.loadout];
  const kind = S.fx.big > 0 ? 'big' : L.build.pattern;
  const tgt = aimTarget(camera.position, F);
  HUD.cross(!!tgt);
  showGhost(tgt && !S.auto ? (kind === 'single' ? [[tgt.x, tgt.y, tgt.z]] : cellsFor(tgt, kind)) : []);
  if (!S.auto) {
    S.fireCD -= dt;
    if (mouseL && S.fireCD <= 0 && tgt && pilot.stun <= 0) {
      const cost = kind === 'big' ? 6 : L.build.cost;
      if (energy.use(cost)) {
        fireBuild(pilot.nose(), tgt, 0, kind);
        S.fireCD = kind === 'big' ? 0.3 : L.build.rate * tempo(S.layer);
        if (kind === 'big' && --S.fx.big <= 0) notice('Your big blocks are used up.', 'lilac');
      } else noAmmo();
    }
    if (mouseR) trySecondary(dt, G.raycast(camera.position, F, 60));
    else S.blastCD -= dt;
  }
}

function survive(dt) {
  buildGuns(dt);
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
    // waves start small and grow to full size over the first 50 seconds
    const ramp = Math.min(1, 0.3 + S.time / 70), lo = Math.max(1, Math.round(LV.size[0] * ramp)), hi = Math.max(lo, Math.round(LV.size[1] * ramp));
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
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
  threats(dt);
}
function threats(dt) {
  // a dash slips straight through a meteor
  T.update(dt, S.t, { destroyBlock, impact, inSmoke: Items.inSmoke }, pilot.dashing ? NOWHERE : pilot.pos, (p, o) => {
    // a shield breaks the rock instead of you
    if (S.fx.shield > 0) { shieldHit(p); kill('meteor', p); return; }
    pilot.stun = 1.1; pilot.vel.add(pilot.pos.clone().sub(p).setLength(12));
    sfx.stun(); hurtMe(p, 1);
  });
}

// ---------- tutorial ----------
// First flight: one instruction at a time, each cleared by doing it. Nothing
// can be lost here: there's no clock and meteors don't crack the core.
const TUTORIAL = [
  { text: 'Move the mouse to look around.', keys: ['Mouse'], done: u => u.turned > 1.4 },
  { text: 'Fly with W, A, S and D. Space climbs and Shift drops.', keys: ['W', 'A', 'S', 'D', 'Space', 'Shift'], done: u => u.flown > 7 },
  { text: 'Point at the core and left-click to stick a block on it.', keys: ['Left click'], done: u => u.placed > 0 || S.sealed > 0 },
  { text: 'Cover all six faces of the core. When no sky can reach it, the layer seals. Orange rings mark the last gaps.', keys: ['Left click'], done: () => S.sealed > 0 },
  { text: 'Press Q to dash. While you dash, meteors and shots pass straight through you.', keys: ['Q'], done: u => u.dashes > 0 },
  { text: 'Double-tap D to swoop round to the next face. Double-tap Space to swoop over the top.', keys: ['D D', 'Space Space'], done: u => u.swoops > 0 },
  { text: 'A meteor is falling toward the core. Follow the arrow and right-click to blast it.', keys: ['Right click'], enter: () => T.spawnMeteor(5, 'slow'), done: () => S.meteorsDown > 0 },
];
const tutored = () => { try { return !!localStorage.getItem('strata-tutored'); } catch { return true; } };
const markTutored = () => { try { localStorage.setItem('strata-tutored', '1'); } catch {} };
function tutStep(n) {
  const u = S.tut, st = TUTORIAL[n];
  Object.assign(u, { n, t: 0, cleared: 0 });
  st.enter?.();
  HUD.tutor({ n, total: TUTORIAL.length, text: st.text, keys: st.keys });
}
function tutor(dt) {
  buildGuns(dt);
  threats(dt);
  const u = S.tut, st = TUTORIAL[u.n];
  if (u.over) return;
  u.t += dt;
  u.flown += pilot.vel.length() * dt;
  // the meteor landed before you got it: send another
  if (st.enter && !T.meteors.length && !st.done(u) && (u.again += dt) > 1.2) {
    u.again = 0; st.enter(); notice('That one landed. Here comes another.', 'lilac');
  }
  // a beat on screen before it can clear, then a beat to see the tick
  if (!u.cleared && u.t > 0.8 && st.done(u)) {
    u.cleared = 1e-4; sfx.pickup();
    HUD.tutor({ n: u.n, total: TUTORIAL.length, text: st.text, keys: st.keys, done: true });
  } else if (u.cleared && (u.cleared += dt) > 1.1) {
    if (u.n + 1 < TUTORIAL.length) tutStep(u.n + 1); else tutDone();
  }
}
function tutDone() {
  S.tut.over = true; markTutored();
  HUD.tutor(null);
  HUD.callout('Ready!', 'Tutorial complete', 'good'); sfx.seal();
  setTimeout(() => S.game === 'tutorial' && leaveTutorial('ready'), 2400);
}
// skip (Enter) goes to the menu; finishing goes to the Ready card
function leaveTutorial(to) {
  markTutored();
  HUD.clearCallout();
  HUD.wipe(() => { newRound('survival'); setMode('title', to); document.exitPointerLock?.(); });
}
function playLevelOne() { S.level = LEVELS[0]; start('survival'); }

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
  const tgt = aimTarget(camera.position, F);
  HUD.cross(!!tgt);
  showGhost(tgt ? (kind === 'single' ? [[tgt.x, tgt.y, tgt.z]] : cellsFor(tgt, kind)) : []);
  if (V.phase === 'playing') {
    S.fireCD -= dt;
    if (mouseL && S.fireCD <= 0 && tgt && pilot.stun <= 0) {
      const cost = kind === 'big' ? 6 : L.build.cost;
      if (energy.use(cost)) {
        buildMine(tgt, kind);
        S.fireCD = kind === 'big' ? 0.3 : L.build.rate * tempo(S.layer);
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
  if (S.fx.shield > 0) return shieldHit(from);
  if (pilot.dashing) return;
  pilot.stun = dur; pilot.vel.add(pilot.pos.clone().sub(from).setLength(10));
  S.immune = dur + IMMUNE;
  sfx.stun(); hurtMe(from, 0.6 + dur * 0.25);
}
// after a stun you blink for a second and can't be stunned again (the host enforces it)
function blinkImmune(dt) {
  if (S.immune <= 0) return;
  S.immune = Math.max(0, S.immune - dt);
  pilot.mesh.visible = S.immune > IMMUNE || S.immune === 0 || Math.floor(S.t * 14) % 2 === 0;
}
// any stun in versus: the hit plane flashes; if it was your shot, confirm it
function onStun(seat, bySeat, mesh) {
  if (mesh) flashShip(mesh, 0.14);
  if (bySeat === S.seat && seat !== S.seat) confirmHit(true);
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

// A meteor landing: a flash, a ring of dust spreading flat along the face it
// struck, dark rock chips and a few embers, then dust that hangs a moment.
const axisOf = p => { const a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)], k = a.indexOf(Math.max(...a)); const n = new THREE.Vector3(); n.setComponent(k, Math.sign(p.getComponent(k)) || 1); return n; };
function impact(p, cracked) {
  const n = axisOf(p);
  FX.puff(p, 0xffffff, 3, 0.5, 0.7, 0.16);
  FX.ring(p, n, 0xf3e2b5, 3.2, 0.5); FX.ring(p, n, 0xffffff, 1.8, 0.3);
  FX.burst(p, 0x3e2f4f, 12, 9, 0.2); FX.burst(p, PAL.plum, 6, 7, 0.26); FX.burst(p, PAL.orange, 6, 10, 0.1);
  for (let k = 0; k < 9; k++) FX.puff(p.clone().addScaledVector(n, 0.3), k % 3 ? 0xeee6dc : 0xd9cfc4, 1, 2.4, 0.22 + Math.random() * 0.3, 0.6 + Math.random() * 0.4);
  sfx.impact();
  if (cracked) {
    // mark the bare face nearest the hit
    let best = null, bd = 2.2;
    for (const f of S.a.faces) { const d = Math.hypot(f[0] + f[3] * 0.5 - p.x, f[1] + f[4] * 0.5 - p.y, f[2] + f[5] * 0.5 - p.z); if (d < bd) { bd = d; best = f; } }
    if (best) { B.crack(best); FX.burst(new THREE.Vector3(best[0] + best[3] * 0.55, best[1] + best[4] * 0.55, best[2] + best[5] * 0.55), 0x2a1a2e, 8, 5, 0.12); }
  }
  const near = Math.max(0, 1 - camera.position.distanceTo(p) / 30);
  S.shake = Math.max(S.shake, 0.25 + near * 0.5);
  if (cracked && !S.ending && S.game !== 'tutorial') {
    S.integrity--; sfx.crack(); S.shake = 0.9;
    hitstop(0.14); S.flash = Math.max(S.flash, 0.45); muffle(0.6);
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
    const ORD = ['first', 'second', 'third'];
    const next = stars < 3 ? `You needed ${(L.stars[stars] - Math.round(S.score)).toLocaleString()} more points for the ${ORD[stars]} star.` : 'You earned all three stars on this level.';
    HUD.result({ big: total, unit: `Level ${L.id} · ${L.name}`, record: best(`survival-${L.id}`, Math.round(S.score)), stars,
      next, nextLevel: !S.auto && L.id < LEVELS.length && bestStars(L.id) >= 1,
      cols: [['Layers', S.sealed], ['Blocks', S.cemented], ['Meteors', S.meteorsDown]], total });
    for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 900 + k * 280);
  }
  HUD.wipe(() => setMode('over'));
  document.exitPointerLock?.();
}

// ---------- hud ----------
function hudGame() {
  HUD.keys(S.game, usedSet);
  if (CORE_KEYS.every(k => usedSet.has(k))) HUD.retireKeys();
  HUD.clock(S.game === 'tutorial' ? null : clock(S.game === 'containment' ? 0 : S.level.time));
  HUD.tab(null);
}
function hudSeal() {
  if (!S.a) return;
  const covered = S.a.totalFaces - S.a.exposedFaces, c = S.game === 'containment';
  if (S.game === 'versus') return HUD.meter(covered, S.a.totalFaces, S.team === 1);
  HUD.meter(covered, S.a.totalFaces, c);
  HUD.tag(c ? `Layer ${S.layer}` : S.game === 'tutorial' ? `Tutorial · Layer ${S.layer}` : `Level ${S.level.id} · Layer ${S.layer}`);
  if (S.mode !== 'play' || noticeT > 0) return;
  // the left-edge tab names the moment: nearly sealed, or one from critical
  if (c) HUD.tab(S.crit === CRIT - 1 ? 'One more and it goes critical' : null, 'violet');
  else HUD.tab(S.a.exposedFaces <= nearly() && S.a.exposedFaces > 0 ? 'Almost sealed' : null, 'lilac');
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
  if (S.stop > 0) { S.stop -= rdt; dt = 0; }
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
    updateFlashes(dt);
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
  const s = S.shake * S.shake * 0.35 * prefs.shake;
  camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
  // directional kick (recoil, getting hit) springs back
  camera.position.addScaledVector(S.kick, prefs.shake); S.kick.multiplyScalar(Math.exp(-11 * rdt));
  S.fovKick *= Math.exp(-9 * rdt);
  S.flash = Math.max(0, S.flash - rdt * 2.2);
  HUD.flash(S.flash * S.flash);
  ocean.material.uniforms.t.value = S.t;
  // balance sims step thousands of frames: skip drawing them
  if (!S.headless) post.render(scene, camera);
}
function tick(now) {
  requestAnimationFrame(tick);
  // an old rAF timestamp can land after the watchdog moved `last` forward;
  // a negative step would run every decay backwards, so clamp at zero
  frame(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = Math.max(last, now);
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
  shield.visible = true; ghosts[0].visible = true; B.crack([0, 0, 0, 0, 0, 1]);
  renderer.compile(scene, camera);
  post.render(scene, camera);
  shield.visible = false; ghosts[0].visible = false;
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
  S, G, pilot, camera, T, Items, energy, music: musicState, pause: () => setMode('pause'),
  step: (dt = 1 / 60, n = 1) => { for (let k = 0; k < n; k++) frame(dt); },
  start: (game = 'survival', level = 1, loadout) => { S.level = LEVELS[level - 1]; if (loadout) S.loadout = loadout; newRound(game); setMode('play'); },
  screen: scr => setMode('title', scr), over: () => gameOver(),
  skill: k => { me.skill = k; },
  get bots() { return bots; }, addBot, hitBot,
  aim: (y, p) => { yaw = y; pitch = p; },
  target: () => { aimFwd(F); camera.position.copy(camPos); return { assisted: aimTarget(camera.position, F), raw: targetFrom(camera.position, F) }; },
  fire: () => { aimFwd(F); const t = targetFrom(camera.position, F); if (t) fireBuild(pilot.nose(), t, 0, LOADOUTS[S.loadout].build.pattern); return t; },
  blast: () => { aimFwd(F); trySecondary(1, G.raycast(camera.position, F, 60)); },
  give: k => { S.held = k; HUD.slot(k, Items.ITEMS[k]); }, use: () => useItem(), V,
  auto: on => { S.auto = on; },
  crit: n => { CRIT = n; },
  meteor: (kind = 'normal') => T.spawnMeteor(6, kind),
  // debug: cover every open face except `leave` of them
  cover: (leave = 0) => { for (const f of S.a.faces.slice(leave)) { G.place(f[0] + f[3], f[1] + f[4], f[2] + f[5]); S.lastPlace.set(f[0] + f[3], f[1] + f[4], f[2] + f[5]); } reanalyze(); return S.a.exposedFaces; },
  drone: () => T.spawnDrone(),
};
