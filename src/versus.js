/* Versus: up to four pilots, Coral (seats 0-1) against Violet (seats 2-3),
   empty seats filled with bots. Everyone builds on the same core; when a
   layer seals its points split between the teams by the loose blocks each
   placed (D8). Blasts only break the other team's blocks, and hitting an
   enemy ship stuns it.

   The room creator HOSTS: it owns the grid, every shot's outcome, the bots,
   the items, the clock and the score. Each player flies their own ship
   locally and streams its pose; shots fire locally for feel, and the host's
   ops decide what actually lands. Guests never seal layers themselves, they
   apply the host's list of cemented cells, so the grids cannot drift. */
import * as THREE from 'three';
import * as G from './grid.js';
import * as Items from './items.js';
import * as FX from './fx.js';
import * as AI from './builder.js';
import { connect, makeRoomCode } from './net.js';
import { LOADOUTS, STUN } from './weapons.js';
import { buildShip, Pilot } from './ship.js';

export const TEAM = [
  { name: 'Coral', color: 0xff6a3d, glow: 0xffb08a, css: '#ff6a3d' },
  { name: 'Violet', color: 0x7a5cf0, glow: 0xb9a8ff, css: '#7a5cf0' },
];
export const teamOf = seat => (seat < 2 ? 0 : 1);
const ROUND = 180, POSE_HZ = 20, STATE_HZ = 15, OPS_HZ = 25;

export function createVersus(game) {
  const V = {
    net: null, code: null, isHost: false, phase: 'off', // off | lobby | playing | over
    seats: [null, null, null, null], seat: -1, name: randomName(), role: 'rapid',
    left: ROUND, score: [0, 0], stats: {}, ships: new Map(), hostId: null,
  };
  let ops = [], opsT = 0, poseT = 0, stateT = 0;
  const local = new URLSearchParams(location.search).has('local');

  // ---------------- room ----------------
  V.host = () => {
    V.code = makeRoomCode(); V.isHost = true; V.phase = 'lobby';
    V.seats = [null, null, null, null];
    V.seat = 0; V.seats[0] = { kind: 'human', id: 'host', name: V.name, role: V.role };
    open();
    pushLobby();
  };
  V.join = code => {
    V.code = code.toUpperCase(); V.isHost = false; V.phase = 'lobby'; V.seat = -1;
    open();
    // say hello until the host answers with a lobby
    const hi = setInterval(() => { if (V.seat >= 0 || !V.net) return clearInterval(hi); V.net.sendHello({ name: V.name, role: V.role }); }, 700);
    game.lobbyChanged();
  };
  V.leave = () => {
    V.net?.leave(); V.net = null; V.phase = 'off'; V.seat = -1; V.isHost = false;
    clearShips();
  };

  function open() {
    const net = V.net = connect(V.code, { local });
    net.onHello((m, from) => {
      if (!V.isHost) return;
      if (V.phase !== 'lobby') return net.sendLobby(lobbyMsg(), from);
      if (!V.seats.some(s => s && s.id === from)) {
        // prefer the team with fewer people, then any open or bot seat
        const order = [0, 2, 1, 3].sort((a, b) => humans(teamOf(a)) - humans(teamOf(b)));
        const k = order.find(i => !V.seats[i]) ?? order.find(i => V.seats[i]?.kind === 'bot');
        if (k == null) return net.sendLobby(lobbyMsg(), from);
        V.seats[k] = { kind: 'human', id: from, name: String(m.name).slice(0, 14), role: LOADOUTS[m.role] ? m.role : 'rapid' };
      }
      pushLobby();
    });
    net.onLobby(m => { if (!V.isHost) applyLobby(m); });
    net.onPeerLeave(id => {
      if (V.isHost) {
        const k = V.seats.findIndex(s => s && s.id === id);
        // a player who drops mid-match is replaced by a bot so the round stays fair
        if (k >= 0) {
          V.seats[k] = V.phase === 'playing' ? { kind: 'bot', name: `Bot ${k + 1}`, role: V.seats[k].role } : null;
          if (V.phase === 'playing') makeShip(k);
          pushLobby(); game.notice(`A player left. A bot took their seat.`);
        }
      } else if (id === V.hostId) {
        game.notice('The host left the room.');
        V.leave(); game.backToMenu();
      }
    });
    net.onAct((m, from) => V.isHost && onAct(m, from));
    net.onPose((m, from) => {
      if (!V.isHost) return;
      const k = m[0];
      if (V.seats[k]?.id !== from) return;
      const sh = V.ships.get(k);
      if (sh) setTarget(sh, m);
    });
    net.onOps(list => { if (!V.isHost) for (const op of list) applyOp(op); });
    net.onState(m => { if (!V.isHost) applyState(m); });
  }

  const humans = team => V.seats.filter((s, i) => s && s.kind === 'human' && teamOf(i) === team).length;
  const lobbyMsg = () => ({ code: V.code, phase: V.phase, seats: V.seats, hostId: V.net?.selfId });
  function pushLobby() { V.net?.sendLobby(lobbyMsg()); game.lobbyChanged(); }
  function applyLobby(m) {
    V.hostId = m.hostId; V.seats = m.seats;
    const mine = V.seats.findIndex(s => s && s.id === V.net.selfId);
    V.seat = mine;
    if (mine >= 0) V.role = V.seats[mine].role;
    if (m.phase === 'lobby' && V.phase !== 'lobby') { V.phase = 'lobby'; game.toLobby(); }
    game.lobbyChanged(m.phase === 'playing' && mine < 0 ? 'A match is in progress. You will get a seat when it ends.' : null);
  }

  // host controls in the lobby
  V.toggleBot = k => {
    if (!V.isHost || V.phase !== 'lobby') return;
    const s = V.seats[k];
    if (!s) V.seats[k] = { kind: 'bot', name: `Bot ${k + 1}`, role: ['rapid', 'cross', 'laser', 'bomber'][k] };
    else if (s.kind === 'bot') V.seats[k] = null;
    pushLobby();
  };
  V.botRole = (k, role) => { if (V.isHost && V.seats[k]?.kind === 'bot') { V.seats[k].role = role; pushLobby(); } };
  V.fillBots = () => { for (let k = 0; k < 4; k++) if (!V.seats[k]) V.seats[k] = { kind: 'bot', name: `Bot ${k + 1}`, role: ['rapid', 'cross', 'laser', 'bomber'][k] }; pushLobby(); };
  V.setRole = role => {
    V.role = role;
    if (V.isHost) { V.seats[V.seat].role = role; pushLobby(); } else V.net?.sendAct({ k: 'role', role });
  };
  V.switchTeam = () => {
    if (V.isHost) { swapTeam(V.seat, 'host'); pushLobby(); } else V.net?.sendAct({ k: 'team' });
  };
  function swapTeam(from, id) {
    const other = teamOf(from) ? [0, 1] : [2, 3];
    const k = other.find(i => !V.seats[i]) ?? other.find(i => V.seats[i]?.kind === 'bot');
    if (k == null) return;
    const me = V.seats[from]; V.seats[from] = V.seats[k]?.kind === 'bot' ? V.seats[k] : null; V.seats[k] = me;
    if (id === 'host') V.seat = k;
  }
  V.setName = name => {
    V.name = name.trim().slice(0, 14) || V.name;
    try { localStorage.setItem('strata-name', V.name); } catch {}
    if (V.isHost && V.seat >= 0) { V.seats[V.seat].name = V.name; pushLobby(); } else V.net?.sendAct({ k: 'name', name: V.name });
  };
  V.canStart = () => V.isHost && V.phase === 'lobby' && V.seats.slice(0, 2).some(Boolean) && V.seats.slice(2).some(Boolean);

  // ---------------- match ----------------
  V.start = () => {
    if (!V.canStart()) return;
    V.phase = 'playing';
    op(['start', V.seats, ROUND]);
    flush();
    begin(V.seats, ROUND);
    pushLobby();
  };
  function begin(seats, round) {
    V.seats = seats; V.left = round; V.score = [0, 0]; V.stats = {};
    if (!V.isHost) V.seat = seats.findIndex(s => s && s.id === V.net?.selfId);
    // joined while a match was already running: watch from the lobby until it ends
    if (V.seat < 0) { V.phase = 'playing'; return game.lobbyChanged('A match is in progress. You will get a seat when it ends.'); }
    seats.forEach((s, k) => { if (s) V.stats[k] = { pts: 0, blocks: 0, stuns: 0, breaks: 0 }; });
    V.phase = 'playing';
    game.startVersus(V.seat, seats[V.seat]?.role || V.role);
    clearShips();
    seats.forEach((s, k) => { if (s && k !== V.seat) makeShip(k); });
  }

  function makeShip(k) {
    V.ships.get(k)?.mesh && game.scene.remove(V.ships.get(k).mesh);
    const t = TEAM[teamOf(k)], s = V.seats[k];
    const mesh = buildShip(t.color, t.glow, 0x22406e);
    game.scene.add(mesh);
    const pilot = new Pilot(mesh);
    const spawn = spawnPoint(k);
    pilot.reset(spawn, spawn.clone().negate().normalize());
    pilot.update(0, new THREE.Vector3(), pilot.fwd, null);
    const L = LOADOUTS[s.role];
    const sh = { seat: k, mesh, pilot, target: null, stun: 0, shield: false };
    if (s.kind === 'bot' && V.isHost) {
      sh.ai = AI.agent(pilot, { owner: teamOf(k), seat: k, pattern: L.build.pattern, rate: L.build.rate * 2.6,
        blastRate: L.blast.rate * 1.8, aggro: s.role === 'bomber' || s.role === 'laser' ? 0.5 : 0.3, defend: false });
    }
    V.ships.set(k, sh);
  }
  function clearShips() { for (const sh of V.ships.values()) game.scene.remove(sh.mesh); V.ships.clear(); }
  V.spawnPoint = spawnPoint;
  function spawnPoint(k) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    return new THREE.Vector3(Math.cos(a) * 12, 1 + (k % 2) * 2, Math.sin(a) * 12);
  }

  // every frame while playing
  V.update = dt => {
    // remote ships glide toward their latest pose
    for (const sh of V.ships.values()) {
      if (sh.ai) {
        if (Items.inSmoke(sh.pilot.pos)) sh.pilot.update(dt, new THREE.Vector3(), sh.pilot.fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 3), null);
        else AI.brawl(sh.ai, dt, game.aiCtx);
        continue;
      }
      if (!sh.target) continue;
      const k = 1 - Math.exp(-14 * dt);
      sh.pilot.pos.lerp(sh.target.pos, k); sh.pilot.fwd.lerp(sh.target.fwd, k).normalize();
      sh.pilot.vel.copy(sh.target.vel);
      sh.pilot.stun = sh.target.stun ? 0.2 : 0;
      sh.mesh.position.copy(sh.pilot.pos);
      sh.mesh.lookAt(sh.pilot.pos.clone().add(sh.pilot.fwd));
      sh.mesh.userData.body.rotation.z = sh.target.stun ? performance.now() * 0.014 : 0;
      for (const pr of sh.mesh.userData.props) pr.rotation.z += dt * 22;
    }
    // my pose out
    if ((poseT += dt) > 1 / POSE_HZ) {
      poseT = 0;
      const p = game.pilot;
      const m = [V.seat, ...p.pos.toArray().map(r2), ...p.fwd.toArray().map(r3), ...p.vel.toArray().map(r2), p.stun > 0 ? 1 : 0, game.S.fx.shield > 0 ? 1 : 0];
      if (!V.isHost) V.net?.sendPose(m);
    }
    if (!V.isHost) return;

    // host: clock, items, state, ops
    V.left -= dt;
    if (V.left <= 0 && V.phase === 'playing') return finish();
    hostItems(dt);
    if ((stateT += dt) > 1 / STATE_HZ) {
      stateT = 0;
      const ships = [[V.seat, ...game.pilot.pos.toArray().map(r2), ...game.pilot.fwd.toArray().map(r3), ...game.pilot.vel.toArray().map(r2), game.pilot.stun > 0 ? 1 : 0, game.S.fx.shield > 0 ? 1 : 0]];
      for (const sh of V.ships.values()) ships.push([sh.seat, ...sh.pilot.pos.toArray().map(r2), ...sh.pilot.fwd.toArray().map(r3), ...sh.pilot.vel.toArray().map(r2), sh.pilot.stun > 0 ? 1 : 0, sh.shield ? 1 : 0]);
      V.net?.sendState({ t: r2(V.left), sc: V.score, ships });
    }
    if ((opsT += dt) > 1 / OPS_HZ) flush();
  };
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  function setTarget(sh, m) {
    sh.target = { pos: new THREE.Vector3(m[1], m[2], m[3]), fwd: new THREE.Vector3(m[4], m[5], m[6]), vel: new THREE.Vector3(m[7], m[8], m[9]), stun: m[10], shield: m[11] };
    sh.shield = !!m[11];
  }
  function applyState(m) {
    V.left = m.t; V.score = m.sc;
    for (const s of m.ships) {
      if (s[0] === V.seat) continue;
      const sh = V.ships.get(s[0]);
      if (sh) setTarget(sh, s);
    }
  }

  let itemT = 6;
  function hostItems(dt) {
    itemT -= dt;
    if (itemT <= 0) { itemT = 9 + Math.random() * 4; const it = Items.spawn('versus'); if (it) op(['is', it.id, it.kind, it.pos]); }
    // anyone without an item can grab one; the host decides who got there first
    const grabbers = [[V.seat, game.pilot.pos, !game.S.held], ...[...V.ships.values()].map(sh => [sh.seat, sh.pilot.pos, !sh.ai && !sh.held])];
    for (const [seat, pos, free] of grabbers) {
      if (!free) continue;
      const got = Items.grab(pos);
      if (!got) continue;
      op(['it', got.id, seat, got.kind]);
      if (seat === V.seat) game.gotItem(got.kind); else V.ships.get(seat).held = got.kind;
    }
  }

  // ---------------- host hooks from the game ----------------
  V.placed = (i, team, seat) => { op(['p', i, team]); if (V.stats[seat]) V.stats[seat].blocks++; placer[i] = seat + 1; };
  V.removed = (i, bySeat) => { op(['r', i]); if (bySeat != null && V.stats[bySeat]) V.stats[bySeat].breaks++; placer[i] = 0; };
  const placer = new Uint8Array(G.N ** 3);
  V.sealed = (made, layer) => {
    // points for the layer, split by blocks each team (and each pilot) placed
    const total = made.length * 10 * layer;
    const byTeam = [0, 0], bySeat = {};
    for (const i of made) {
      const s = placer[i] - 1;
      if (s < 0) continue;
      byTeam[teamOf(s)]++; bySeat[s] = (bySeat[s] || 0) + 1;
      placer[i] = 0;
    }
    const n = byTeam[0] + byTeam[1] || 1;
    const pts = byTeam.map(b => Math.round(total * b / n));
    V.score[0] += pts[0]; V.score[1] += pts[1];
    for (const [s, b] of Object.entries(bySeat)) if (V.stats[s]) V.stats[s].pts += Math.round(total * b / n);
    op(['s', layer, made, pts]);
    return pts;
  };
  V.shot = (seat, kind, from, a, pattern) => op(['shot', seat, kind, from.toArray().map(r2), a, pattern]);
  // does something of `team` hitting point p within r hit an enemy ship? stun it
  V.hitShips = (p, r, team, kind, bySeat) => {
    let hit = false;
    for (const [seat, pos, shielded] of allShips()) {
      if (teamOf(seat) === team || pos.distanceTo(p) > r) continue;
      hit = true;
      if (shielded) continue;
      stun(seat, STUN[kind], p, bySeat);
    }
    return hit;
  };
  V.shipNear = (p, team) => allShips().some(([seat, pos]) => teamOf(seat) !== team && pos.distanceTo(p) < 0.95);
  V.hitSegment = (a, b, team, kind, bySeat, segDist) => {
    for (const [seat, pos, shielded] of allShips()) if (teamOf(seat) !== team && segDist(pos, a, b) < 1 && !shielded) stun(seat, STUN[kind], pos, bySeat);
  };
  function allShips() {
    return [[V.seat, game.pilot.pos, game.S.fx.shield > 0], ...[...V.ships.values()].map(sh => [sh.seat, sh.pilot.pos, sh.shield])];
  }
  function stun(seat, dur, from, bySeat) {
    if (V.stats[bySeat]) V.stats[bySeat].stuns++;
    op(['stun', seat, dur, from.toArray().map(r2)]);
    applyStun(seat, dur, from);
  }
  function applyStun(seat, dur, from) {
    if (seat === V.seat) return game.stunMe(dur, new THREE.Vector3(...(from.toArray ? from.toArray() : from)));
    const sh = V.ships.get(seat);
    if (sh) { sh.pilot.stun = dur; sh.pilot.vel.add(sh.pilot.pos.clone().sub(new THREE.Vector3(...(from.toArray ? from.toArray() : from))).setLength(10)); }
  }
  V.smoke = pos => { if (V.isHost) { Items.throwSmoke(pos); op(['smoke', pos.toArray().map(r2)]); } else V.net?.sendAct({ k: 'smoke', pos: pos.toArray() }); };

  function op(o) { ops.push(o); }
  function flush() { opsT = 0; if (ops.length && V.net) V.net.sendOps(ops); ops = []; }

  // guest intents
  function onAct(m, from) {
    const k = V.seats.findIndex(s => s && s.id === from);
    if (m.k === 'role' && k >= 0 && LOADOUTS[m.role]) { V.seats[k].role = m.role; return pushLobby(); }
    if (m.k === 'name' && k >= 0) { V.seats[k].name = String(m.name).slice(0, 14); return pushLobby(); }
    if (m.k === 'team' && k >= 0 && V.phase === 'lobby') { swapTeam(k, from); return pushLobby(); }
    if (V.phase !== 'playing' || k < 0) return;
    if (m.k === 'build') game.remoteBuild(k, m);
    if (m.k === 'blast') game.remoteBlast(k, m);
    if (m.k === 'smoke') { const p = new THREE.Vector3(...m.pos); Items.throwSmoke(p); op(['smoke', m.pos]); }
    if (m.k === 'use') { const sh = V.ships.get(k); if (sh) sh.held = null; }
  }
  V.send = m => V.net?.sendAct(m);

  // guest: apply what the host decided
  function applyOp(o) {
    switch (o[0]) {
      case 'start': begin(o[1], o[2]); break;
      case 'p': game.mirrorPlace(o[1], o[2]); break;
      case 'r': game.mirrorRemove(o[1]); break;
      case 's': game.mirrorSeal(o[2], o[1], o[3]); V.score[0] += o[3][0]; V.score[1] += o[3][1]; break;
      case 'shot': if (o[1] !== V.seat) game.mirrorShot(o[1], o[2], o[3], o[4], o[5]); break;
      case 'stun': applyStun(o[1], o[2], o[3]); break;
      case 'is': Items.spawnAt(o[1], o[2], o[3]); break;
      case 'it': Items.removeId(o[1]); if (o[2] === V.seat) game.gotItem(o[3]); break;
      case 'smoke': Items.throwSmoke(new THREE.Vector3(...o[1])); break;
      case 'end': V.phase = 'over'; game.versusOver(o[1]); break;
    }
  }

  function finish() {
    V.phase = 'over';
    const res = { score: V.score, seats: V.seats, stats: V.stats };
    op(['end', res]); flush();
    game.versusOver(res);
  }
  // host: everyone back to the room for another round
  V.rematch = () => {
    if (!V.isHost) return;
    V.phase = 'lobby'; clearShips();
    pushLobby();
  };

  // for HUD, radar and bots
  V.shipList = () => [...V.ships.values()].map(sh => ({ seat: sh.seat, team: teamOf(sh.seat), pos: sh.pilot.pos, fwd: sh.pilot.fwd, vel: sh.pilot.vel, name: V.seats[sh.seat]?.name, role: V.seats[sh.seat]?.role, stun: sh.pilot.stun > 0 }));
  V.inviteLink = () => { const u = new URL(location.href); u.search = ''; u.searchParams.set('room', V.code); if (local) u.searchParams.set('local', ''); return u.href; };
  try { V.name = localStorage.getItem('strata-name') || V.name; } catch {}
  return V;
}

function randomName() {
  const a = ['Swift', 'Lucky', 'Sunny', 'Brave', 'Quiet', 'Bright', 'Bold', 'Gentle'], b = ['Gull', 'Kite', 'Finch', 'Wren', 'Heron', 'Robin', 'Swallow', 'Tern'];
  return `${a[(Math.random() * a.length) | 0]} ${b[(Math.random() * b.length) | 0]}`;
}
