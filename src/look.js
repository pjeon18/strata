import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Resort look: clean soft shading with a rim sheen, saturated sky and sea,
// haze toward the horizon, a little bloom on whites and glows. No ink lines.
export const PAL = {
  skyTop: 0x1f7fe6, skyMid: 0x63c3f6, skyLow: 0xd6f4ff,
  haze: 0xc4ecff,
  deep: 0x1557b0, sea: 0x1b86c6, shallow: 0x37d2cf,
  sand: 0xf3e2b5, rock: 0xd8c7a6, grass: 0x58c25a, leaf: 0x3fa64a, peak: 0x9c7f63,
  white: 0xffffff, hull: 0xf6f9fc,
  teal: 0x1ec2d4, glow: 0x6ff3ff, glass: 0x22406e,
  // everything around you is blue, so the two sides are warm coral and violet
  mine: 0xff6a3d,                   // your blocks
  bot: 0x7a5cf0, botGlow: 0xb9a8ff, // their blocks and rings
  coral: 0xff5a4a, plum: 0x8a6aa6, orange: 0xff9b3d,
  // one colour per sealed layer, so the core visibly changes when a layer lands
  strata: [0xffc23d, 0x5fd08a, 0x52c8ea, 0xff96c0, 0xbde86a, 0xfff1d6, 0x8fe0c4],
};

// Standard material plus a soft fresnel rim: the toy-plastic sheen.
const rimChunk = `
  float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
  gl_FragColor.rgb += rimColor * rimK * rimAmt;
  #include <dithering_fragment>`;
export function paint(color, o = {}) {
  const { rim = 0.35, rimColor = 0xffffff, ...rest } = o;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...rest });
  m.onBeforeCompile = sh => {
    sh.uniforms.rimColor = { value: new THREE.Color(rimColor) };
    sh.uniforms.rimAmt = { value: rim };
    sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimAmt;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', rimChunk);
  };
  m.customProgramCacheKey = () => `rim${rim}`;
  return m;
}

// FX live on layer 1 (kept from the ink version; harmless now, handy for passes).
export const FX_LAYER = 1;
export const fxOnly = obj => { obj.layers.set(FX_LAYER); obj.traverse(c => c.layers.set(FX_LAYER)); return obj; };

// a slight saturation lift on the finished frame, nothing else
const VIVID = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(clamp(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, sat), 0., 1.), 1.); }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.c = new EffectComposer(renderer);
    this.c.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.0);
    this.c.addPass(this.bloom);
    this.c.addPass(new OutputPass());
    this.c.addPass(new ShaderPass(VIVID));
  }
  setSize(w, h, dpr) { this.c.setPixelRatio(dpr); this.c.setSize(w, h); }
  render(scene, camera) { camera.layers.enableAll(); this.c.render(); }
}

export function sky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(PAL.skyTop) }, mid: { value: new THREE.Color(PAL.skyMid) }, low: { value: new THREE.Color(PAL.skyLow) },
      sunDir: { value: new THREE.Vector3(18, 30, 12).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform vec3 top, mid, low, sunDir; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = h > 0. ? mix(low, mid, smoothstep(0., .18, h)) : low;
        c = mix(c, top, smoothstep(.15, .85, h));
        float s = max(dot(vP, sunDir), 0.);
        c += vec3(1., .96, .86) * (pow(s, 600.) * 1.6 + pow(s, 12.) * .18);
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

export const SEA_Y = -70;
// islands: [x, z, radius, peak height]
const ISLES = [[-150, -320, 70, 70], [70, -260, 26, 14], [-280, -150, 34, 20], [230, -330, 44, 30], [160, -140, 16, 7], [-40, -180, 14, 6], [300, 40, 30, 16], [-260, 160, 40, 26]];

// The sea: one even body of water. Deeper blue looking down, lighter toward
// the horizon, fine moving ripples that catch the sun up close, and a narrow
// clean shoreline (shallows, then a thin foam line) that follows each island.
export function sea() {
  const isl = ISLES.map(([x, z, r]) => new THREE.Vector3(x, z, r));
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      deep: { value: new THREE.Color(PAL.deep) }, sea: { value: new THREE.Color(PAL.sea) }, shallow: { value: new THREE.Color(PAL.shallow) },
      far: { value: new THREE.Color(PAL.skyMid) }, sand: { value: new THREE.Color(PAL.sand) },
      sunDir: { value: new THREE.Vector3(18, 30, 12).normalize() },
      t: { value: 0 }, isl: { value: isl },
    }]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 deep, sea, shallow, far, sand, sunDir; uniform float t; uniform vec3 isl[${isl.length}]; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      // ripple height: two drifting layers of small noise
      float wave(vec2 p){ return n(p * .35 + vec2(t * .35, t * .12)) * .6 + n(p * .9 - vec2(t * .2, t * .45)) * .4; }
      void main(){
        vec2 p = vW.xz;
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        // ripples fade out with distance so far water stays calm instead of shimmering
        float near = 1. - smoothstep(50., 420., dist);
        float e = .25, w0 = wave(p);
        vec3 N = normalize(vec3((w0 - wave(p + vec2(e, 0.))) * near * .9, 1., (w0 - wave(p + vec2(0., e))) * near * .9));
        // body colour: deep when looking down, lighter and sky-tinted toward the horizon
        float grazing = pow(1. - clamp(V.y, 0., 1.), 4.);
        vec3 c = mix(mix(deep, sea, .62), mix(sea, far, .5), grazing);
        c *= 1. + (w0 - .5) * .07 * near;
        // shoreline: follows the same wobble as the island meshes
        float d = 1e5, ang = 0.;
        for (int k = 0; k < ${isl.length}; k++) {
          vec2 q = p - isl[k].xy; float a = atan(q.y, q.x);
          float r = isl[k].z * 1.027 * (1. + sin(a * 3. + isl[k].z) * .08 + sin(a * 7. + isl[k].x) * .04);
          float dk = length(q) - r;
          if (dk < d) { d = dk; ang = a; }
        }
        c = mix(c, shallow, smoothstep(9., 0., d) * .55);
        c = mix(c, mix(shallow, sand, .35), smoothstep(2.2, 0., d) * .5);
        float foam = smoothstep(.9, .15, abs(d - .7 - .35 * sin(t * 1.3 + ang * 9.)));
        c = mix(c, vec3(1.), foam * .8);
        // sun glints on the ripples, and a broad soft sheen toward the sun
        vec3 H = normalize(sunDir + V);
        c += vec3(1., .97, .9) * pow(max(dot(N, H), 0.), 220.) * 1.3;
        c += vec3(1., .96, .88) * pow(max(H.y, 0.), 60.) * .22;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = SEA_Y;
  return m;
}

const rockGeo = new THREE.DodecahedronGeometry(1, 0), rockMat = paint(0xb7aa99, { roughness: 0.95, rim: 0.1, flatShading: true });
const palmTrunk = paint(0x9b7650, { roughness: 0.9, rim: 0.1 }), palmLeaf = paint(0x2f9e48, { roughness: 0.7, rim: 0.2, side: THREE.DoubleSide });
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6), leafGeo = new THREE.PlaneGeometry(0.55, 2.2, 1, 3);
{ // fronds droop toward the tip
  const p = leafGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.1; p.setZ(i, -0.18 * y * y); p.setY(i, y); }
  leafGeo.computeVertexNormals();
}
function palm(x, y, z, out, h, rand) {
  const t = new THREE.Group(); t.position.set(x, y, z);
  // a curved trunk from three stacked segments, each leaning a bit further out
  let px = 0, py = 0, lean = 0;
  for (let k = 0; k < 3; k++) {
    lean += 0.12 + rand() * 0.06;
    const seg = new THREE.Mesh(trunkGeo, palmTrunk);
    seg.scale.set(1 - k * 0.15, h / 3, 1 - k * 0.15);
    seg.position.set(px + Math.sin(lean) * h / 6, py + Math.cos(lean) * h / 6, 0); seg.rotation.z = -lean;
    px += Math.sin(lean) * h / 3; py += Math.cos(lean) * h / 3;
    t.add(seg);
  }
  for (let k = 0; k < 6; k++) {
    const f = new THREE.Mesh(leafGeo, palmLeaf);
    f.position.set(px, py, 0); f.rotation.set(-0.9 + rand() * 0.3, (k / 6) * Math.PI * 2 + rand() * 0.4, 0, 'YXZ');
    t.add(f);
  }
  t.rotation.y = -out;
  return t;
}

// Lathe islands: sand rim, pale cliff, grass shelf, then a peak for the big ones.
export function islands(rand) {
  const g = new THREE.Group();
  const leafMat = paint(PAL.leaf, { roughness: 0.8, rim: 0.25 }), trunkMat = paint(0x8a6a4e);
  const ball = new THREE.SphereGeometry(1, 12, 10);
  for (const [x, z, r, peak] of ISLES) {
    const pts = [
      [r * 1.06, -3], [r * 1.02, 0.6], [r * 0.95, 1.2], [r * 0.9, 4.5], [r * 0.82, 5.4],
      [r * 0.55, 6.5], [r * 0.32, 6.5 + peak * 0.45], [r * 0.1, 6.5 + peak * 0.95], [0, 6.5 + peak],
    ];
    // tall peaks are volcanoes: a rim and a dished crater instead of a point
    if (peak > 40) pts.splice(-2, 2, [r * 0.12, 6.5 + peak * 0.93], [r * 0.085, 6.5 + peak * 0.97], [r * 0.06, 6.5 + peak * 0.9], [0, 6.5 + peak * 0.86]);
    const prof = pts.map(([a, b]) => new THREE.Vector2(a, b));
    const geo = new THREE.LatheGeometry(prof, 48);
    const pos = geo.attributes.position, col = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const a = Math.atan2(pz, px);
      const wob = 1 + Math.sin(a * 3 + r) * 0.08 + Math.sin(a * 7 + x) * 0.04;
      pos.setX(i, px * wob); pos.setZ(i, pz * wob);
      if (py < 1.4) c.setHex(PAL.sand);
      else if (py < 4.8) c.setHex(PAL.rock);
      else if (py < 6.5 + peak * 0.35) c.setHex(PAL.grass);
      else if (peak > 40 && py > 6.5 + peak * 0.9 && Math.hypot(px, pz) < r * 0.08) c.setHex(0x5a4436);
      else c.setHex(PAL.peak);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true, roughness: 0.9, rim: 0.15 }));
    m.position.set(x, SEA_Y, z);
    g.add(m);
    // rocks at the waterline
    for (let k = 0; k < Math.floor(r * 0.25); k++) {
      const a = rand() * Math.PI * 2, d = r * (1.02 + rand() * 0.06), s = 0.8 + rand() * 2.2;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x + Math.cos(a) * d, SEA_Y + 0.2 + rand() * 0.4, z + Math.sin(a) * d);
      rock.scale.set(s, s * (0.5 + rand() * 0.4), s); rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      g.add(rock);
    }
    // a ring of palms leaning out over the shelf edge
    for (let k = 0; k < Math.floor(r * 0.18); k++) {
      const a = rand() * Math.PI * 2, d = r * (0.8 + rand() * 0.05);
      g.add(palm(x + Math.cos(a) * d, SEA_Y + 5.6, z + Math.sin(a) * d, a, 2.2 + rand() * 1.6, rand));
    }
    // round trees on the shelf
    const n = Math.floor(r * 0.9);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, d = r * (0.6 + rand() * 0.22);
      const s = 1.6 + rand() * 1.6;
      const tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d, ty = SEA_Y + 6.2;
      const crown = new THREE.Mesh(ball, leafMat); crown.position.set(tx, ty + s * 1.4, tz); crown.scale.set(s, s * 1.1, s);
      const trunk = new THREE.Mesh(ball, trunkMat); trunk.position.set(tx, ty + s * 0.4, tz); trunk.scale.set(0.3, s * 0.6, 0.3);
      g.add(crown, trunk);
    }
  }
  return g;
}

// Soft white clouds: clusters of squashed spheres, lit, no outlines.
export function clouds(rand) {
  const g = new THREE.Group();
  const mat = paint(0xf2f7ff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.38, rim: 0.1 });
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const puff = (x, y, z, s) => {
    const c = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(ball, mat);
      const r = s * (0.5 + rand() * 0.5);
      m.scale.set(r * 1.2, r * 0.75, r);
      m.position.set((i - n / 2) * s * 0.5 + rand() * s * 0.3, rand() * s * 0.22, (rand() - 0.5) * s * 0.6);
      c.add(m);
    }
    c.position.set(x, y, z); c.rotation.y = rand() * Math.PI;
    g.add(c);
  };
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, d = 120 + rand() * 260;
    puff(Math.cos(a) * d, 10 + rand() * 60, Math.sin(a) * d, 10 + rand() * 12);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2, d = 95 + rand() * 50;
    puff(Math.cos(a) * d, -30 + rand() * 18, Math.sin(a) * d, 5 + rand() * 4);
  }
  return g;
}

export function lights(scene) {
  scene.fog = new THREE.Fog(PAL.haze, 160, 720);
  const hemi = new THREE.HemisphereLight(0xd8efff, 0xfff0d8, 1.2);
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.0);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera; s.left = s.bottom = -26; s.right = s.top = 26; s.near = 1; s.far = 90;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(hemi, sun);
  return { hemi, sun };
}

// ---------- life ----------
// Small things that make the world feel lived in: gulls wheeling over the big
// island, two sailboats with wakes, and smoke curling off the volcano.
export function life(rand) {
  const g = new THREE.Group(), movers = [];
  // gulls: a body and two wings that flap
  const gullMat = paint(0xffffff, { roughness: 0.6, rim: 0.3, side: THREE.DoubleSide }), wingGeo = new THREE.PlaneGeometry(1.4, 0.45).translate(0.7, 0, 0);
  const bodyGeo = new THREE.CapsuleGeometry(0.12, 0.5, 3, 6).rotateX(Math.PI / 2);
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Group(), wl = new THREE.Mesh(wingGeo, gullMat), wr = new THREE.Mesh(wingGeo, gullMat);
    wr.scale.x = -1; wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    const wings = [new THREE.Group(), new THREE.Group()]; wings[0].add(wl); wings[1].add(wr);
    b.add(new THREE.Mesh(bodyGeo, gullMat), ...wings); b.scale.setScalar(1.6);
    g.add(b);
    const cx = -150 + (rand() - 0.5) * 40, cz = -320 + (rand() - 0.5) * 40, R = 30 + rand() * 40, y = SEA_Y + 40 + rand() * 50, sp = (0.15 + rand() * 0.15) * (rand() < 0.5 ? 1 : -1), ph = rand() * 6.3;
    movers.push(t => {
      const a = ph + t * sp;
      b.position.set(cx + Math.cos(a) * R, y + Math.sin(t * 0.7 + ph) * 3, cz + Math.sin(a) * R);
      b.rotation.set(0, -a + (sp > 0 ? 0 : Math.PI), sp > 0 ? -0.35 : 0.35);
      const flap = Math.sin(t * 6 + ph) * 0.45 * (Math.sin(t * 0.5 + ph) > -0.3 ? 1 : 0.1);
      wings[0].rotation.z = flap; wings[1].rotation.z = -flap;
    });
  }
  // sailboats on slow loops, each pulling a white V of wake
  const hullMat = paint(0xffffff, { roughness: 0.5, rim: 0.2 }), sailMat = paint(0xfff6e6, { roughness: 0.8, side: THREE.DoubleSide }), trimMat = paint(PAL.coral, { roughness: 0.5 });
  const wakeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.strokeStyle = gr; x.lineWidth = 7; x.beginPath(); x.moveTo(32, 2); x.lineTo(4, 126); x.moveTo(32, 2); x.lineTo(60, 126); x.stroke(); return new THREE.CanvasTexture(c); })();
  const wakeMat = new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false });
  for (const [cx, cz, R, sp] of [[-150, -320, 120, 0.035], [230, -330, 80, -0.05]]) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 6, 1, 1, 2), hullMat); hull.position.y = 0.3;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.2, 6.05), trimMat); stripe.position.y = 0.55;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7), hullMat); mast.position.y = 4;
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 6); sailShape.lineTo(3.4, 0.4); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat); sail.position.set(0, 1.2, -0.2); sail.rotation.y = Math.PI / 2;
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(9, 26), wakeMat); wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.06, -15);
    b.add(hull, stripe, mast, sail, wake);
    g.add(b);
    const ph = rand() * 6.3;
    movers.push(t => {
      const a = ph + t * sp;
      b.position.set(cx + Math.cos(a) * R, SEA_Y + Math.sin(t * 1.3 + ph) * 0.15, cz + Math.sin(a) * R);
      b.rotation.set(Math.sin(t * 1.1 + ph) * 0.04, -a + (sp > 0 ? Math.PI : 0), Math.sin(t * 0.9) * 0.05);
    });
  }
  // volcano smoke: puffs rise from the crater, drift with the wind and fade
  const top = new THREE.Vector3(-150, SEA_Y + 6.5 + 70 * 0.9, -320), puffGeo = new THREE.IcosahedronGeometry(1, 2);
  for (let k = 0; k < 12; k++) {
    const m = new THREE.Mesh(puffGeo, paint(0xe8e4e0, { roughness: 1, rim: 0.2, emissive: 0xffffff, emissiveIntensity: 0.15, transparent: true, depthWrite: false }));
    g.add(m);
    const off = k / 12, j = rand();
    movers.push(t => {
      const age = (t * 0.06 + off) % 1;
      m.position.copy(top).add(new THREE.Vector3(age * 40 + Math.sin(age * 6 + j * 6) * 3, age * 55, age * 14));
      m.scale.setScalar(3 + age * 12 + j * 2);
      m.material.opacity = Math.min(1, age * 6) * (1 - age) * 0.75;
    });
  }
  return { group: g, update: t => { for (const f of movers) f(t); } };
}
