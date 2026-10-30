/* Rooms. Two transports with one interface:
   - trystero (WebRTC, public relays): the real thing; works off GitHub Pages
     with no server. The room code is the whole handshake.
   - local (BroadcastChannel): same browser, different tabs. Add ?local to the
     URL. For testing two players on one machine without relays.

   trystero 0.25 gotchas (verified against @trystero-p2p/core types, and
   learned in MISCHIEF): onMessage / onPeerJoin / onPeerLeave are ASSIGNABLE
   properties, not methods; onMessage gets (data, { peerId }); and send's
   target goes INSIDE the options object or the message reaches everyone. */
import { joinRoom, selfId as trysteroId } from 'trystero';

const APP_ID = 'strata-pjeon18';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
export const CHANNELS = ['hello', 'lobby', 'pose', 'act', 'ops', 'state'];

export const makeRoomCode = () => Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
const peerIdOf = x => (typeof x === 'string' ? x : x && typeof x.peerId === 'string' ? x.peerId : String(x ?? ''));
const cap = s => s[0].toUpperCase() + s.slice(1);

export function connect(code, { local = false } = {}) {
  return local ? connectLocal(code) : connectTrystero(code);
}

function connectTrystero(code) {
  const room = joinRoom({ appId: APP_ID }, code);
  const api = { code, selfId: trysteroId, leave: () => { try { room.leave(); } catch {} } };
  for (const name of CHANNELS) {
    const ch = room.makeAction(name);
    api['send' + cap(name)] = (data, target) => { try { ch.send(data, target ? { target } : undefined)?.catch?.(() => {}); } catch {} };
    api['on' + cap(name)] = cb => { ch.onMessage = (data, ctx) => cb(data, peerIdOf(ctx)); };
  }
  api.onPeerJoin = cb => { room.onPeerJoin = id => cb(peerIdOf(id)); };
  api.onPeerLeave = cb => { room.onPeerLeave = id => cb(peerIdOf(id)); };
  return api;
}

function connectLocal(code) {
  const selfId = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(`strata-${code}`);
  const peers = new Set(), handlers = {};
  let onJoin = () => {}, onLeave = () => {};
  const post = (chan, data, to) => bc.postMessage({ from: selfId, to, chan, data });
  bc.onmessage = ({ data: m }) => {
    if (m.from === selfId || (m.to && m.to !== selfId)) return;
    if (m.chan === '__hi') {
      if (!peers.has(m.from)) { peers.add(m.from); post('__hi', null, m.from); onJoin(m.from); }
      return;
    }
    if (m.chan === '__bye') { if (peers.delete(m.from)) onLeave(m.from); return; }
    handlers[m.chan]?.(m.data, m.from);
  };
  addEventListener('beforeunload', () => post('__bye'));
  const api = { code, selfId, leave: () => { post('__bye'); bc.close(); } };
  for (const name of CHANNELS) {
    api['send' + cap(name)] = (data, target) => post(name, data, target);
    api['on' + cap(name)] = cb => { handlers[name] = cb; };
  }
  api.onPeerJoin = cb => { onJoin = cb; };
  api.onPeerLeave = cb => { onLeave = cb; };
  setTimeout(() => post('__hi'), 50);
  return api;
}
