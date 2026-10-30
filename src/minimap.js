// Radar, heading-up: the core sits in the middle, the map turns so the way
// you face is always up. Items, meteors, nibblers and other ships show as
// marks; height reads as size (higher = bigger).
const RANGE = 34;

export function draw(cv, { yaw, me, meColor = '#ff6a3d', core, coreColor, items, meteors, drones, ships }) {
  const dpr = Math.min(devicePixelRatio, 2);
  const W = cv.clientWidth;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = W * dpr; }
  const c = cv.getContext('2d'), R = W / 2;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, W);

  // disc
  c.save();
  c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.closePath();
  const bg = c.createRadialGradient(R, R * 0.7, 4, R, R, R);
  bg.addColorStop(0, 'rgba(255,255,255,.95)'); bg.addColorStop(1, 'rgba(214,238,255,.92)');
  c.fillStyle = bg; c.fill(); c.clip();
  c.strokeStyle = 'rgba(70,130,200,.18)'; c.lineWidth = 1.5;
  for (const f of [0.33, 0.66]) { c.beginPath(); c.arc(R, R, (R - 2) * f, 0, Math.PI * 2); c.stroke(); }

  // world (x, z) -> map, rotated so facing is up
  const s = (R - 10) / RANGE, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const map = p => {
    const x = p.x, z = p.z;
    const u = x * cos - z * sin, v = x * sin + z * cos;
    const len = Math.hypot(u, v), k = len * s > R - 9 ? (R - 9) / (len * s) : 1; // pin to the rim
    return [R + u * s * k, R + v * s * k, k < 1];
  };
  const size = (p, base) => base * (1 + Math.max(-0.4, Math.min(0.6, p.y / 25)));

  // core
  const [cx, cy] = map({ x: 0, z: 0 });
  const cr = Math.max(5, core * s * 0.6);
  c.save(); c.translate(cx, cy); c.rotate(-yaw);
  c.fillStyle = coreColor; c.strokeStyle = '#fff'; c.lineWidth = 2;
  roundRect(c, -cr, -cr, cr * 2, cr * 2, 3); c.fill(); c.stroke();
  c.restore();

  for (const it of items) {
    const [x, y] = map(it.pos);
    c.fillStyle = it.color; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
    const r = size(it.pos, 5); roundRect(c, -r, -r, r * 2, r * 2, 2); c.fill(); c.stroke(); c.restore();
  }
  for (const d of drones) { const [x, y] = map(d.pos); dot(c, x, y, size(d.pos, 3.2), '#7a5cf0'); }
  for (const b of ships) {
    const [x, y] = map(b.pos);
    const u = b.fwd.x * cos - b.fwd.z * sin, v = b.fwd.x * sin + b.fwd.z * cos;
    tri(c, x, y, size(b.pos, 6), Math.atan2(u, -v), b.color || '#7a5cf0');
  }
  const now = performance.now();
  for (const m of meteors) {
    const [x, y, pinned] = map(m.pos);
    const close = m.eta < 1.6;
    if (close && Math.floor(now / 110) % 2) continue;
    dot(c, x, y, size(m.pos, pinned ? 3.5 : 4.5), close ? '#ff2d4a' : '#ff6a3d');
  }
  // you: always pointing up
  const [mx, my] = map(me);
  tri(c, mx, my, 8, 0, meColor, true);
  c.restore();

  // rim + north tick so turning is legible
  c.strokeStyle = '#fff'; c.lineWidth = 4;
  c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
  const na = -Math.PI / 2 + yaw;
  c.fillStyle = '#1a2a52'; c.font = '900 11px "M PLUS Rounded 1c"'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', R + Math.cos(na) * (R - 12), R + Math.sin(na) * (R - 12));
}

function dot(c, x, y, r, color) {
  c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
}
function tri(c, x, y, r, a, color, big) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.75, r * 0.8); c.lineTo(0, r * 0.4); c.lineTo(-r * 0.75, r * 0.8); c.closePath();
  c.fillStyle = color; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = big ? 2.5 : 1.5; c.stroke();
  c.restore();
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
