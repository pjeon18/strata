// Touch controls for phones and tablets. The left thumb gets a stick wherever
// it lands (a quick flick to the edge swoops that way), the right thumb drags
// anywhere to look, and buttons sit under the right thumb.
const chev = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

export function touchControls({ onLook, onButton, onSwoop }) {
  const root = document.createElement('div');
  root.id = 'touchUI';
  root.innerHTML = `
    <div class="t-zone" id="tZone"></div>
    <div class="t-stick" id="tStick"><i id="tNub"></i></div>
    <div class="t-vert"><button data-b="up" aria-label="Rise">${chev('M6 15l6-6 6 6')}</button><button data-b="down" aria-label="Sink">${chev('M6 9l6 6 6-6')}</button></div>
    <div class="t-btns">
      <button data-b="blast" class="t-blast">Blast</button>
      <button data-b="place" class="t-place">Place</button>
      <button data-b="dash" class="t-dash">Dash</button>
      <button data-b="item" class="t-item">Item</button>
      <button data-b="wave" class="t-wave">Wave</button>
    </div>
    <button data-b="pause" class="t-pause" aria-label="Pause">${chev('M9 6v12M15 6v12')}</button>
    <div class="t-turn">Turn your phone sideways to play.</div>`;
  document.body.appendChild(root);
  const state = { sx: 0, sy: 0 };
  const zone = root.querySelector('#tZone'), stick = root.querySelector('#tStick'), nub = root.querySelector('#tNub');
  const R = 56;
  let stickId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0, t0 = 0, peak = 0, px = 0, py = 0;

  zone.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (e.clientX < innerWidth * 0.45 && stickId == null) {
      stickId = e.pointerId; ox = e.clientX; oy = e.clientY; t0 = performance.now(); peak = 0;
      stick.style.left = `${ox}px`; stick.style.top = `${oy}px`; stick.classList.add('on');
    } else if (lookId == null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      state.sx = dx / R; state.sy = -dy / R;
      if (d / R > peak) { peak = d / R; px = state.sx; py = state.sy; }
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === lookId) {
      onLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
    }
  });
  const end = e => {
    if (e.pointerId === stickId) {
      // a flick: out to the edge and back up within a quarter second
      if (performance.now() - t0 < 260 && peak > 0.85) onSwoop(Math.abs(px) > Math.abs(py) ? (px < 0 ? 'left' : 'right') : py > 0 ? 'up' : 'down');
      stickId = null; state.sx = state.sy = 0; nub.style.transform = ''; stick.classList.remove('on');
    }
    if (e.pointerId === lookId) lookId = null;
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  for (const b of root.querySelectorAll('[data-b]')) {
    const id = b.dataset.b;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); onButton(id, true); });
    const up = e => { if (!b.classList.contains('down')) return; b.classList.remove('down'); onButton(id, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
  return state;
}
