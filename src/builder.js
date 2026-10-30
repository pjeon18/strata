import * as THREE from 'three';
import * as G from './grid.js';

// AI pilots. One brain builds (title screen, ?watch, Containment's bots), one
// defends (Containment's ?watch). Both steer a Pilot; neither touches the
// camera. ctx supplies the game's shooting functions:
//   { faces, faceOpen, targetFrom, fireBuild(from, tgt, owner), fireBlast(from, dir), meteors, bots }

export function agent(pilot, o = {}) {
  return { pilot, face: null, hold: 0, orbit: Math.random() * 6, bad: new WeakSet(), blocked: 0, stuck: 0,
    fireCD: 0, blastCD: 0, rate: 0.1, owner: 0, defend: true, ...o };
}

const tmp = new THREE.Vector3();

// wish toward `to`, bending outward when the core sits between us and it
function steer(p, to, wish) {
  wish.copy(to).clampLength(0, 1);
  const k = THREE.MathUtils.clamp(-p.pos.dot(to) / to.lengthSq(), 0, 1);
  const closest = p.pos.clone().addScaledVector(to, k);
  const coreR = Math.cbrt(G.coreCount) * 0.75 + 2.5;
  if (k > 0 && k < 1 && closest.length() < coreR) wish.addScaledVector(closest.lengthSq() > 0.01 ? closest.normalize() : p.pos.clone().normalize(), 1.2).clampLength(0, 1);
  return wish;
}

function face(a, ctx) {
  const p = a.pilot;
  if (!a.face || !ctx.faceOpen(a.face) || a.hold <= 0) {
    // nearest open face to where we already are, so it paints in sweeps
    let best = null, bd = 1e9;
    for (const f of ctx.faces) {
      if (!ctx.faceOpen(f) || a.bad.has(f)) continue;
      const d = (f[0] + f[3] * 6 - p.pos.x) ** 2 + (f[1] + f[4] * 6 - p.pos.y) ** 2 + (f[2] + f[5] * 6 - p.pos.z) ** 2 + Math.random() * 4;
      if (d < bd) { bd = d; best = f; }
    }
    a.face = best; a.hold = 2.5;
  }
  return a.face;
}

export function build(a, dt, ctx) {
  const p = a.pilot;
  a.hold -= dt; a.orbit += dt * 0.4; a.fireCD -= dt; a.blastCD -= dt;
  const f = face(a, ctx);
  let aim = tmp.copy(p.fwd);
  const wish = new THREE.Vector3();
  const threat = a.defend ? ctx.meteors.reduce((b, m) => (!b || m.pos.distanceTo(m.target) < b.pos.distanceTo(b.target) ? m : b), null) : null;
  if (threat && threat.pos.distanceTo(threat.target) < 26) {
    const lead = threat.pos.clone().addScaledVector(threat.vel, threat.pos.distanceTo(p.pos) / 75);
    aim = lead.sub(p.pos).normalize();
    if (a.blastCD <= 0 && aim.dot(p.fwd) > 0.985) { ctx.fireBlast(p.nose(), p.fwd); a.blastCD = 0.22; }
  } else if (f) {
    const air = new THREE.Vector3(f[0] + f[3], f[1] + f[4], f[2] + f[5]), n = new THREE.Vector3(f[3], f[4], f[5]);
    const side = new THREE.Vector3(n.y, n.z, n.x).multiplyScalar(Math.sin(a.orbit) * 0.8);
    const to = air.clone().addScaledVector(n, 5.5).add(side).sub(p.pos);
    steer(p, to, wish);
    // wedged in a notch: back straight out and pick another face
    a.stuck = p.vel.length() < 1 && to.length() > 3 && p.stun <= 0 ? a.stuck + dt : 0;
    if (a.stuck > 0.8) { a.bad.add(f); a.face = null; a.stuck = 0; p.vel.addScaledVector(p.pos.clone().normalize(), 10); }
    aim = air.clone().sub(p.pos).normalize();
    if (to.length() < 3 && a.fireCD <= 0 && aim.dot(p.fwd) > 0.97 && p.stun <= 0) {
      // only fire when the shot lands on the chosen face, or it builds towers
      const tgt = ctx.targetFrom(p.nose(), aim);
      if (tgt && tgt.x === air.x && tgt.y === air.y && tgt.z === air.z) { ctx.fireBuild(p.nose(), tgt, a.owner, a.pattern || 'single', a.seat); a.fireCD = a.rate; a.blocked = 0; }
      else a.blocked += dt;
      if (a.blocked > 0.6) { a.blocked = 0; a.bad.add(f); a.face = null; }
    }
  }
  p.update(dt, wish, aim, new THREE.Vector3(-aim.z, 0, aim.x).normalize());
}

// Defender: shoot the nearest live bot (with lead); otherwise clear the
// nearest enemy block. Hovers ~9 units off whatever it's working on.
export function defend(a, dt, ctx) {
  const p = a.pilot;
  a.blastCD -= dt;
  let target = null, vel = null;
  let bd = 1e9;
  for (const b of ctx.bots) {
    if (b.dead) continue;
    const d = b.pilot.pos.distanceTo(p.pos);
    if (d < bd) { bd = d; target = b.pilot.pos; vel = b.pilot.vel; }
  }
  if (!target || bd > 24) {
    const loose = G.looseCells();
    let ld = 1e9;
    for (const i of loose) {
      const d = (G.cx(i) - p.pos.x) ** 2 + (G.cy(i) - p.pos.y) ** 2 + (G.cz(i) - p.pos.z) ** 2;
      if (d < ld) { ld = d; target = new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i)); vel = null; }
    }
  }
  const wish = new THREE.Vector3();
  let aim = tmp.copy(p.fwd);
  if (target) {
    const lead = vel ? target.clone().addScaledVector(vel, target.distanceTo(p.pos) / 75) : target.clone();
    // skill < 1 models a person: aim wanders and settles, resampled a few times a second
    a.wobbleT = (a.wobbleT || 0) - dt;
    if (a.wobbleT <= 0) { a.wobble = new THREE.Vector3().randomDirection().multiplyScalar((1 - (a.skill ?? 1)) * 2.2 * Math.random()); a.wobbleT = 0.25; }
    if (a.wobble) lead.addScaledVector(a.wobble, target.distanceTo(p.pos) / 10);
    const hover = target.clone().add(target.clone().normalize().multiplyScalar(8));
    steer(p, hover.sub(p.pos), wish);
    aim = lead.sub(p.pos).normalize();
    if (a.blastCD <= 0 && aim.dot(p.fwd) > 0.99 && p.stun <= 0) { ctx.fireBlast(p.nose(), p.fwd); a.blastCD = a.blastRate || 0.16; }
  }
  p.update(dt, wish, aim, new THREE.Vector3(-aim.z, 0, aim.x).normalize());
}

// Versus bot: spends most of its time building for its team, and every few
// seconds switches to attacking: the other team's loose blocks, or an enemy
// ship that comes close. Breakers and snipers attack more often.
// ctx adds: enemyBlocks(team), enemyShips(team), fireBlastAs(agent, from, dir)
export function brawl(a, dt, ctx) {
  const p = a.pilot;
  a.modeT = (a.modeT ?? 0) - dt;
  if (a.modeT <= 0) {
    a.mode = Math.random() < (a.aggro ?? 0.35) ? 'attack' : 'build';
    a.modeT = a.mode === 'attack' ? 2.5 + Math.random() * 2 : 4 + Math.random() * 3;
  }
  if (a.mode === 'build' || p.stun > 0) return build(a, dt, ctx);
  a.blastCD -= dt;
  // nearest enemy ship within 18, else nearest enemy block within 26
  let target = null, vel = null, bd = 18;
  for (const s of ctx.enemyShips(a.owner)) { const d = s.pos.distanceTo(p.pos); if (d < bd) { bd = d; target = s.pos; vel = s.vel; } }
  if (!target) {
    let ld = 26 * 26;
    for (const i of ctx.enemyBlocks(a.owner)) {
      const d = (G.cx(i) - p.pos.x) ** 2 + (G.cy(i) - p.pos.y) ** 2 + (G.cz(i) - p.pos.z) ** 2;
      if (d < ld) { ld = d; target = new THREE.Vector3(G.cx(i), G.cy(i), G.cz(i)); }
    }
  }
  if (!target) { a.mode = 'build'; return build(a, dt, ctx); }
  const lead = vel ? target.clone().addScaledVector(vel, target.distanceTo(p.pos) / 60) : target.clone();
  const hover = target.clone().add(target.clone().normalize().multiplyScalar(7));
  const wish = steer(p, hover.sub(p.pos), new THREE.Vector3());
  const aim = lead.sub(p.pos).normalize();
  if (a.blastCD <= 0 && aim.dot(p.fwd) > 0.985) { ctx.fireBlastAs(a, p.nose(), p.fwd); a.blastCD = a.blastRate; }
  p.update(dt, wish, aim, new THREE.Vector3(-aim.z, 0, aim.x).normalize());
}
