// All DOM UI. Resort-style: rounded type, a lilac score lozenge with an
// avatar, navy pills, a left-edge tab, letter-by-letter callouts, white card
// menus with coral selection and a holographic wipe between screens.
import { draw as drawRadar } from './minimap.js';

const $ = id => document.getElementById(id);

export const ICON = {
  plane: '<svg viewBox="0 0 24 24"><path d="M12 2.5c.9 0 1.5 1.3 1.5 3.2v3.6l7.5 3.2v2l-7.5-1.8v4l2.4 1.8v1.6L12 19l-3.9 1.1v-1.6l2.4-1.8v-4L3 14.5v-2l7.5-3.2V5.7c0-1.9.6-3.2 1.5-3.2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="7" r="3.5"/><path d="M5 21c.6-4.2 3.2-6.5 7-6.5s6.4 2.3 7 6.5"/></svg>',
  mouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" stroke-linejoin="round"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  // power-ups
  big: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="5.4" height="5.4" rx="1.4"/><rect x="9.3" y="3" width="5.4" height="5.4" rx="1.4"/><rect x="15.6" y="3" width="5.4" height="5.4" rx="1.4"/><rect x="3" y="9.3" width="5.4" height="5.4" rx="1.4"/><rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1.4"/><rect x="15.6" y="9.3" width="5.4" height="5.4" rx="1.4"/><rect x="3" y="15.6" width="5.4" height="5.4" rx="1.4"/><rect x="9.3" y="15.6" width="5.4" height="5.4" rx="1.4"/><rect x="15.6" y="15.6" width="5.4" height="5.4" rx="1.4"/></svg>',
  infinite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 12c-2-2.6-3.4-4-5.4-4a4 4 0 000 8c2 0 3.4-1.4 5.4-4zm0 0c2 2.6 3.4 4 5.4 4a4 4 0 000-8c-2 0-3.4 1.4-5.4 4z"/></svg>',
  boost: '<svg viewBox="0 0 24 24"><path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" stroke-linejoin="round"/></svg>',
  smoke: '<svg viewBox="0 0 24 24"><circle cx="8" cy="14" r="5"/><circle cx="15" cy="11" r="6"/><circle cx="17.5" cy="16.5" r="3.8"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/></svg>',
  // loadouts
  rapid: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" opacity=".7"/><rect x="16" y="9" width="6" height="6" rx="1.5" opacity=".4"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="6" rx="1.5"/><rect x="2.5" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/><rect x="15.5" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="15.5" width="6" height="6" rx="1.5"/></svg>',
  laser: '<svg viewBox="0 0 24 24"><rect x="2" y="10.5" width="20" height="3" rx="1.5"/><circle cx="4" cy="12" r="3.2"/></svg>',
  bomber: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7.5"/><path d="M15.5 7.5l2.5-2.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="19.5" cy="3.8" r="1.8"/></svg>',
  bot: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="4"/><circle cx="9" cy="13" r="1.8" fill="#fff"/><circle cx="15" cy="13" r="1.8" fill="#fff"/><path d="M12 7V3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// soft red haze around the edges when the core is one hit from losing
export const danger = on => $('danger').classList.toggle('on', !!on);

// ---------- mute ----------
export function mute(on, onToggle) {
  const b = $('mute');
  b.innerHTML = on ? ICON.soundOff : ICON.soundOn;
  b.classList.toggle('off', on);
  if (onToggle) b.onclick = e => { e.stopPropagation(); onToggle(); };
}

// ---------- in-game ----------
let lastScore = -1;
export function score(n) {
  const v = Math.round(n);
  if (v === lastScore) return;
  $('score').textContent = v.toLocaleString();
  lastScore = v;
}
// the yellow ring burst + number hop when points land
export function bump() {
  const el = $('scoreBox');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
export const tag = text => { $('tag').textContent = text; };

export function meter(covered, total, theirs) {
  $('meter').classList.toggle('theirs', !!theirs);
  $('fill').style.width = `${total ? (covered / total) * 100 : 0}%`;
  $('countNow').textContent = covered;
  $('countAll').textContent = `/ ${total}`;
}

export function gems(n, max, kind) {
  $('gems').innerHTML = Array.from({ length: max }, (_, k) => `<i class="${kind} ${k < n ? 'on' : ''}"></i>`).join('');
}
export function clock(text, urgent) {
  $('clockPill').classList.toggle('hidden', text == null);
  $('clockPill').classList.toggle('urgent', !!urgent);
  if (text != null) $('clock').textContent = text;
}

// left-edge tab ("Almost sealed", "Wave 3")
let tabText = null;
export function tab(text, tone = 'lilac') {
  if (text === tabText) return;
  tabText = text;
  const el = $('tab');
  el.className = `tab ${tone} ${text ? 'in' : ''}`;
  if (text) el.textContent = text;
}

export const cross = on => $('cross').classList.toggle('on', on);
export function kick() {
  const c = $('cross'); c.classList.remove('kick'); void c.offsetWidth; c.classList.add('kick');
}
// ammo arc on the right of the crosshair
const ARC = 106.8; // half-circle length for r = 34
export function ammo(frac, { charging, empty, infinite }) {
  const fg = $('ammoFg');
  fg.style.strokeDasharray = `${ARC}`;
  fg.style.strokeDashoffset = `${ARC * (1 - frac)}`;
  const c = $('cross');
  c.classList.toggle('low', frac < 0.25 && !infinite);
  c.classList.toggle('charging', charging);
  c.classList.toggle('empty', empty);
  c.classList.toggle('inf', infinite);
}

export function keys(game) {
  const k = (key, label) => `<span><kbd>${key}</kbd>${label}</span>`;
  $('keys').innerHTML = [k('Mouse', 'Aim'), k('WASD', 'Fly'), k('Space', 'Up'), k('Shift', 'Down'),
    ...(game === 'containment' ? [k('Click', 'Blast')] : [k('Left', 'Place'), k('Right', 'Blast')]), k('E', 'Item'), k('M', 'Mute'), k('H', 'Hide')].join('');
}

export function arrows(list, theirs) {
  $('arrows').innerHTML = list.map(({ x, y, a }) =>
    `<i class="arrow ${theirs ? 'theirs' : ''}" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${a}rad)"></i>`).join('');
}

// held item + running effects
export function slot(kind, item) {
  const s = $('slot');
  s.classList.toggle('full', !!kind);
  s.style.setProperty('--item', item ? `#${item.color.toString(16).padStart(6, '0')}` : '#cfd3de');
  $('slotIcon').innerHTML = kind ? ICON[kind] : '';
  $('slotName').textContent = kind ? item.name : 'Empty';
  if (kind) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
}
export function effects(list) {
  $('effects').innerHTML = list.map(e => `<div class="fx" style="--item:#${e.color.toString(16).padStart(6, '0')}">
    <span class="ico">${ICON[e.kind]}</span><span>${e.label}</span><i style="width:${Math.round(e.frac * 100)}%"></i></div>`).join('');
}

export function radar(data) { drawRadar($('radar'), data); }

// Callout: letters drop in one by one with a bounce, hold, then lift away.
let calloutTimer = 0;
export function callout(big, small = '', tone = 'good') {
  const el = $('callout');
  clearTimeout(calloutTimer);
  const letters = [...big].map((ch, i) => `<span style="animation-delay:${i * 38}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  el.className = `callout ${tone}`;
  el.innerHTML = `<i class="hatch l"></i><i class="hatch r"></i>
    <div class="big">${letters}</div>${small ? `<div class="small">${small}</div>` : ''}
    <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i>`;
  void el.offsetWidth; el.classList.add('in');
  calloutTimer = setTimeout(() => el.classList.add('out'), 1250 + big.length * 38);
}
export function clearCallout() { clearTimeout(calloutTimer); $('callout').className = 'callout'; }

export const flash = a => { $('flash').style.opacity = a; };

// ---------- screens ----------
// the loading cover is separate: it fades out over whatever screen is underneath
const SCREENS = ['splash', 'menu', 'levels', 'loadout', 'rooms', 'lobby', 'pause', 'result'];
export function screen(name) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
  document.body.classList.toggle('blurred', ['menu', 'levels', 'loadout', 'rooms', 'lobby', 'pause', 'result'].includes(name));
}

// holographic slab sweeping across; `mid` runs while the screen is covered
export function wipe(mid) {
  const el = $('wipe');
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  setTimeout(mid, 260);
}

// Shared chooser: hovering moves the selection (coral fill + mint chevron),
// the description band follows it, click or Enter picks, Esc goes back.
function chooser(root, { onPick, onBack, describe, horizontal, onSelect }) {
  const els = [...root.querySelectorAll('[data-pick]')];
  let sel = 0;
  const select = (k, quiet) => {
    sel = (k + els.length) % els.length;
    els.forEach((o, i) => o.classList.toggle('sel', i === sel));
    describe(els[sel].dataset.pick);
    if (!quiet) onSelect?.();
  };
  els.forEach((o, i) => {
    o.addEventListener('pointerenter', () => i !== sel && select(i));
    o.addEventListener('click', () => { select(i, true); onPick(o.dataset.pick); });
  });
  root.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); onBack?.(); }));
  const next = horizontal ? ['ArrowRight', 'KeyD'] : ['ArrowDown', 'KeyS'], prev = horizontal ? ['ArrowLeft', 'KeyA'] : ['ArrowUp', 'KeyW'];
  addEventListener('keydown', e => {
    if (root.classList.contains('hidden')) return;
    if (next.includes(e.code)) select(sel + 1);
    if (prev.includes(e.code)) select(sel - 1);
    if (e.code === 'Enter') onPick(els[sel].dataset.pick);
    if (e.code === 'Escape' || e.code === 'Backspace') onBack?.();
  });
  return { select, get value() { return els[sel].dataset.pick; } };
}

function band(id, meta, text) {
  const d = $(id);
  d.querySelector('.desc-meta').innerHTML = meta;
  d.querySelector('p').textContent = text;
  d.classList.remove('in'); void d.offsetWidth; d.classList.add('in');
}

const MODES = {
  survival: ['1 player · 3 levels', 'Shoot blocks onto the core until it is completely covered. That seals the layer and scores points. Each level lasts two minutes, and your final score decides how many stars you earn.'],
  versus: ['2 to 4 players · online', 'Two teams build on the same core. When a layer seals, its points go to each team by how many of its blocks they placed. Break the other team’s blocks and stun their pilots. Empty seats can be filled with bots.'],
  containment: ['1 player · endless', 'Builder bots are trying to grow the core. Shoot them and the blocks they place. If they seal four layers, the core goes critical and the run ends.'],
  how: ['Controls', 'Use your mouse to look around and WASD to move. Press Space to rise and Shift to sink. Left click places a block and right click fires your blaster. Fly through a power-up to pick it up, then press E to use it.'],
};
export function menu(onPick, onSelect) {
  const c = chooser($('menu'), { onPick, onSelect, describe: k => band('desc', `${ICON.person}<span>${MODES[k][0]}</span>`, MODES[k][1]) });
  c.select(0, true);
}

const starRow = n => [0, 1, 2].map(k => `<i class="${k < n ? 'on' : ''}">${ICON.star}</i>`).join('');
export function levels(list, best, onPick, onBack, onSelect) {
  $('levelCards').innerHTML = list.map(l => `<button class="card lvl lvl${l.id}" data-pick="${l.id}">
    <div class="art"><b>${l.id}</b></div>
    <div class="label">${l.name}</div>
    <div class="mini-stars">${starRow(best(l.id))}</div></button>`).join('');
  const c = chooser($('levels'), { onPick, onBack, onSelect, horizontal: true, describe: k => {
    const l = list[k - 1];
    band('levelDesc', `${ICON.star}<span>Stars at ${l.stars.slice(0, 2).map(s => s.toLocaleString()).join(', ')} and ${l.stars[2].toLocaleString()} points</span>`, l.blurb);
  } });
  return c;
}
export function refreshLevelStars(list, best) {
  list.forEach(l => { const el = document.querySelector(`.lvl${l.id} .mini-stars`); if (el) el.innerHTML = starRow(best(l.id)); });
}

export function loadouts(defs, onPick, onBack, onSelect) {
  $('loadCards').innerHTML = Object.entries(defs).map(([k, d]) => `<button class="card load" data-pick="${k}">
    <div class="art"><span class="ico">${ICON[k]}</span></div>
    <div class="label">${d.name}</div>
    <div class="statbars">${Object.entries(d.stats).map(([n, v]) => `<div><span>${n}</span><i>${Array.from({ length: 5 }, (_, j) => `<b class="${j < v ? 'on' : ''}"></b>`).join('')}</i></div>`).join('')}</div>
  </button>`).join('');
  return chooser($('loadout'), { onPick, onBack, onSelect, horizontal: true, describe: k => band('loadDesc', `${ICON[k]}<span>${defs[k].name}</span>`, defs[k].blurb) });
}

// Result: stars (levels only), big badge, one stats row, then actions.
export function result({ big, unit, record, cols, total, stars }) {
  soloResultLabels();
  $('rBig').textContent = big;
  $('rUnit').textContent = unit;
  $('rRecord').classList.toggle('hidden', !record);
  const st = $('rStars');
  st.classList.toggle('hidden', stars == null);
  if (stars != null) st.innerHTML = [0, 1, 2].map(k => `<i class="${k < stars ? 'on' : ''}" style="animation-delay:${0.55 + k * 0.28}s">${ICON.star}</i>`).join('');
  $('rHead').innerHTML = '<span></span>' + cols.map(c => `<span>${c[0]}</span>`).join('') + '<span>Total</span>';
  $('rRow').innerHTML = `<span class="who">${ICON.plane}You</span>` + cols.map(c => `<span>${c[1]}</span>`).join('') + `<span class="tot">${total}</span>`;
  const card = $('result');
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
}

export function init() {
  $('avatar').innerHTML = ICON.plane;
  $('clockIcon').innerHTML = ICON.clock;
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = ICON[el.dataset.icon];
}

// ---------- versus ----------
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// in-game: scoreboard replaces the clock pill; avatar shows your team
export function versusHud(on, tagText, team) {
  $('hud').classList.toggle('vs', on);
  if (!on) return;
  $('tag').textContent = tagText;
  document.documentElement.style.setProperty('--me', team.css);
}
export function board(score, time, myTeam, urgent) {
  $('scA').textContent = score[0].toLocaleString();
  $('scB').textContent = score[1].toLocaleString();
  $('boardT').textContent = time;
  $('board').classList.toggle('urgent', urgent);
  $('board').dataset.me = myTeam;
}
// name tags over other ships
export function labels(list, camera, TEAM, LOADOUTS) {
  const W = innerWidth, H = innerHeight, v = { x: 0, y: 0, z: 0 };
  $('labels').innerHTML = list.map(s => {
    const p = s.pos.clone(); p.y += 1.2; p.project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return '';
    const d = camera.position.distanceTo(s.pos);
    return `<div class="nl ${s.stun ? 'stun' : ''}" style="left:${(p.x + 1) / 2 * W}px;top:${(1 - p.y) / 2 * H}px;--t:${TEAM[s.team].css};opacity:${Math.max(0.35, 1 - d / 60)}">
      <span class="ico">${ICON[s.role] || ''}</span>${esc(s.name)}</div>`;
  }).join('');
}

// rooms: make one or join one
export function rooms({ name, onName, onCreate, onJoin, onBack }) {
  $('nameIn').value = name;
  $('nameIn').onchange = e => onName(e.target.value);
  $('createRoom').onclick = onCreate;
  $('joinRoom').onclick = () => { const c = $('codeIn').value.trim().toUpperCase(); if (c.length === 4) onJoin(c); else $('codeIn').focus(); };
  $('codeIn').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); };
  $('codeIn').onkeydown = e => { if (e.key === 'Enter') $('joinRoom').click(); };
  document.querySelector('#rooms [data-back]').onclick = onBack;
}

// lobby: two team columns of two seats, your role picker, host controls
export function lobby(V, LOADOUTS, note) {
  $('roomCode').textContent = V.code || '····';
  $('copyLink').onclick = () => { navigator.clipboard?.writeText(V.inviteLink()).catch(() => {}); $('copyLink').textContent = 'Link copied'; setTimeout(() => ($('copyLink').textContent = 'Copy invite link'), 1600); };
  const seat = (k) => {
    const s = V.seats[k], mine = k === V.seat;
    if (!s) return `<div class="seat open"><span class="who">Open seat</span>${V.isHost ? `<button class="mini" data-bot="${k}">Add a bot</button>` : ''}</div>`;
    const L = LOADOUTS[s.role] || LOADOUTS.rapid;
    return `<div class="seat ${s.kind} ${mine ? 'mine' : ''}">
      <span class="badge-ico">${s.kind === 'bot' ? ICON.bot : ICON[s.role]}</span>
      <span class="who"><b>${esc(s.name)}${mine ? ' (you)' : ''}</b><small>${L.name} · ${L.role}</small></span>
      ${V.isHost && s.kind === 'bot' ? `<button class="mini" data-cycle="${k}">Role</button><button class="mini x" data-bot="${k}">Remove</button>` : ''}
    </div>`;
  };
  $('seatsA').innerHTML = seat(0) + seat(1);
  $('seatsB').innerHTML = seat(2) + seat(3);
  const roles = Object.keys(LOADOUTS);
  $('rolePick').innerHTML = V.seat < 0 ? '' : `<span class="lbl">Your role</span>` + roles.map(r => `<button class="role ${r === V.role ? 'on' : ''}" data-role="${r}">
      <span class="ico">${ICON[r]}</span><b>${LOADOUTS[r].name}</b><small>${LOADOUTS[r].role}</small></button>`).join('')
    + `<button class="mini swap" id="swapTeam">Switch team</button>`;
  document.querySelectorAll('#lobby [data-bot]').forEach(b => (b.onclick = () => V.toggleBot(+b.dataset.bot)));
  document.querySelectorAll('#lobby [data-cycle]').forEach(b => (b.onclick = () => { const k = +b.dataset.cycle; V.botRole(k, roles[(roles.indexOf(V.seats[k].role) + 1) % roles.length]); }));
  document.querySelectorAll('#lobby [data-role]').forEach(b => (b.onclick = () => { V.setRole(b.dataset.role); lobby(V, LOADOUTS); }));
  $('swapTeam') && ($('swapTeam').onclick = () => V.switchTeam());
  const start = $('startMatch'), fill = $('fillBots');
  start.classList.toggle('hidden', !V.isHost); fill.classList.toggle('hidden', !V.isHost);
  start.disabled = !V.canStart();
  const text = note || (V.seat < 0 && !V.isHost ? `Joining room ${V.code}…` : V.isHost
    ? (V.canStart() ? 'Everyone is in. Press Start when you are ready.' : 'Each team needs at least one pilot or bot before you can start.')
    : 'Waiting for the host to start the match.');
  $('lobbyNote').textContent = text;
}

// versus result: who won, both team totals, one row per pilot
export function versusResult(res, myTeam, isHost, LOADOUTS) {
  const [a, b] = res.score, win = a === b ? -1 : a > b ? 0 : 1;
  $('rStars').classList.add('hidden');
  $('rBig').textContent = win < 0 ? 'Draw' : win === myTeam ? 'You win' : 'You lose';
  $('rUnit').textContent = `Coral ${a.toLocaleString()} · Violet ${b.toLocaleString()}`;
  $('rRecord').classList.add('hidden');
  $('rHead').innerHTML = '<span></span><span>Points</span><span>Blocks</span><span>Breaks</span><span>Stuns</span>';
  $('rRow').innerHTML = '';
  const rows = res.seats.map((s, k) => s && { s, k, st: res.stats[k] || { pts: 0, blocks: 0, breaks: 0, stuns: 0 } }).filter(Boolean)
    .sort((p, q) => q.st.pts - p.st.pts);
  $('rRows').innerHTML = rows.map(({ s, k, st }) => `<div class="row"><span class="who t${k < 2 ? 0 : 1}">${ICON[s.kind === 'bot' ? 'bot' : s.role]}${esc(s.name)}</span>
    <span>${st.pts.toLocaleString()}</span><span>${st.blocks}</span><span>${st.breaks}</span><span class="tot">${st.stuns}</span></div>`).join('');
  $('again').textContent = 'Back to room';
  $('modes').textContent = 'Leave';
  const card = $('result');
  card.classList.add('vs'); card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
}
export function soloResultLabels() {
  $('again').textContent = 'Fly again'; $('modes').textContent = 'Modes';
  $('result').classList.remove('vs'); $('rRows').innerHTML = '';
}
