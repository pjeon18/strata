import * as THREE from 'three';
import * as G from './grid.js';
import { PAL, paint } from './look.js';

// A resort prop plane: white hull, teal trim, straight wings with two
// engine pods whose prop rings glow (bloom picks them up). Faces +Z so
// Object3D.lookAt points the nose.
export function buildShip(accent = PAL.teal, ring = PAL.glow, canopy = PAL.glass) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hull = paint(PAL.hull, { roughness: 0.35, rim: 0.45 }), trim = paint(accent, { roughness: 0.35, rim: 0.4 });
  const glass = paint(canopy, { roughness: 0.12, rim: 0.7, rimColor: 0x9fe8ff });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ring).multiplyScalar(1.6) });
  const discMat = new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const add = (geo, mat, p, r, s, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s);
    m.castShadow = shadow; body.add(m); return m;
  };
  // fuselage: long, tapered, a teal belly stripe
  add(new THREE.CapsuleGeometry(0.27, 1.05, 8, 18), hull, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 1.05]);
  add(new THREE.CapsuleGeometry(0.2, 0.9, 6, 14), trim, [0, -0.1, -0.05], [Math.PI / 2, 0, 0], [1.02, 0.7, 1]);
  add(new THREE.SphereGeometry(0.2, 20, 14), glass, [0, 0.17, 0.3], null, [0.95, 0.8, 1.7]);
  // wings + tailplane
  add(new THREE.BoxGeometry(2.3, 0.07, 0.42), hull, [0, -0.02, 0.05]);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.34, 0.075, 0.43), trim, [s * 1.0, -0.02, 0.05]);
  add(new THREE.BoxGeometry(0.9, 0.05, 0.26), hull, [0, 0.02, -0.68]);
  add(new THREE.BoxGeometry(0.06, 0.38, 0.32), trim, [0, 0.2, -0.7], [-0.25, 0, 0]);
  // engine pods with glowing prop rings
  const props = [];
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.12, 0.42, 6, 14), hull, [s * 0.62, 0.02, 0.12], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.3, 0.035, 10, 40), glowMat, [s * 0.62, 0.02, 0.48], null, null, false);
    const prop = new THREE.Group(); prop.position.set(s * 0.62, 0.02, 0.47);
    prop.add(new THREE.Mesh(new THREE.CircleGeometry(0.29, 32), discMat));
    for (let k = 0; k < 2; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.54, 0.02), hull);
      bl.rotation.z = k * Math.PI / 2; prop.add(bl);
    }
    body.add(prop); props.push(prop);
  }
  root.scale.setScalar(0.92);
  root.userData = { body, props };
  return root;
}

const RADIUS = 0.62, MAX_R = 46;

export class Pilot {
  constructor(mesh) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.stun = 0; this.roll = 0; this.spin = 0; this.boost = 1;
  }
  reset(p, fwd) { this.pos.copy(p); this.vel.set(0, 0, 0); this.fwd.copy(fwd); this.stun = 0; this.boost = 1; }

  // wish: desired direction (world, length<=1). Snappy: high accel, quick damping.
  update(dt, wish, aimFwd, right) {
    const accel = this.stun > 0 ? 0 : 70 * this.boost;
    this.vel.addScaledVector(wish, accel * dt);
    this.vel.multiplyScalar(Math.exp(-(this.stun > 0 ? 2 : 5.5) * dt));
    const max = 17 * this.boost;
    if (this.vel.length() > max) this.vel.setLength(max);
    this.pos.addScaledVector(this.vel, dt);
    this.collide();
    const r = this.pos.length();
    if (r > MAX_R) { this.pos.setLength(MAX_R); this.vel.addScaledVector(this.pos.clone().normalize(), -this.vel.dot(this.pos) / r); }

    this.stun = Math.max(0, this.stun - dt);
    this.fwd.lerp(aimFwd, 1 - Math.exp(-20 * dt)).normalize();
    const lateral = right ? this.vel.dot(right) : 0;
    this.roll += (THREE.MathUtils.clamp(-lateral * 0.05, -0.6, 0.6) - this.roll) * (1 - Math.exp(-10 * dt));
    this.spin += dt * (this.stun > 0 ? 14 : 0);

    const m = this.mesh;
    m.position.copy(this.pos);
    m.lookAt(this.pos.clone().add(this.fwd));
    const { body, props } = m.userData;
    body.rotation.z = this.roll + (this.stun > 0 ? this.spin : 0);
    body.position.y = Math.sin(performance.now() * 0.004) * 0.04;
    for (const p of props) p.rotation.z += dt * (18 + this.vel.length() * 2);
  }

  // sphere vs voxel AABBs, push out along the shortest axis of contact
  collide() {
    const p = this.pos;
    const x0 = Math.floor(p.x + 0.5), y0 = Math.floor(p.y + 0.5), z0 = Math.floor(p.z + 0.5);
    for (let x = x0 - 1; x <= x0 + 1; x++) for (let y = y0 - 1; y <= y0 + 1; y++) for (let z = z0 - 1; z <= z0 + 1; z++) {
      if (!G.solid(x, y, z)) continue;
      const qx = THREE.MathUtils.clamp(p.x, x - 0.5, x + 0.5), qy = THREE.MathUtils.clamp(p.y, y - 0.5, y + 0.5), qz = THREE.MathUtils.clamp(p.z, z - 0.5, z + 0.5);
      let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
      let d = Math.hypot(dx, dy, dz);
      if (d >= RADIUS) continue;
      if (d < 1e-4) { dx = p.x - x; dy = p.y - y; dz = p.z - z; d = Math.hypot(dx, dy, dz) || 1; }
      const nx = dx / d, ny = dy / d, nz = dz / d, push = RADIUS - Math.min(d, RADIUS);
      p.x += nx * push; p.y += ny * push; p.z += nz * push;
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) { this.vel.x -= vn * nx; this.vel.y -= vn * ny; this.vel.z -= vn * nz; }
    }
  }
  nose() { return this.pos.clone().addScaledVector(this.fwd, 0.7); }
}
