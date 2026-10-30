import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

export class Post {
  constructor(renderer, scene, camera) {
    this.c = new EffectComposer(renderer);
    this.c.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.0);
    this.c.addPass(this.bloom);
    this.c.addPass(new OutputPass());
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

const SEA_Y = -70;
// islands: [x, z, radius, peak height]
const ISLES = [[-150, -320, 70, 70], [70, -260, 26, 14], [-280, -150, 34, 20], [230, -330, 44, 30], [160, -140, 16, 7], [-40, -180, 14, 6], [300, 40, 30, 16], [-260, 160, 40, 26]];

export function sea() {
  const isl = ISLES.map(([x, z, r]) => new THREE.Vector3(x, z, r));
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      deep: { value: new THREE.Color(PAL.deep) }, sea: { value: new THREE.Color(PAL.sea) }, shallow: { value: new THREE.Color(PAL.shallow) },
      t: { value: 0 }, isl: { value: isl },
    }]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 deep, sea, shallow; uniform float t; uniform vec3 isl[${isl.length}]; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float d = 1e5;
        for (int k = 0; k < ${isl.length}; k++) d = min(d, length(p - isl[k].xy) - isl[k].z);
        float blot = n(p * .012) * .6 + n(p * .04) * .4;           // dark reef patches
        vec3 c = mix(sea, deep, smoothstep(.45, .75, blot));
        c = mix(c, shallow, smoothstep(40., 2., d));
        c = mix(c, vec3(1.), smoothstep(2.5, .5, d) * .7);         // surf line
        float g = h(floor(p * 2.2) + floor(t * 2.));                  // glints
        c += vec3(1.) * step(.9993, g) * .5;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = SEA_Y;
  return m;
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
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const geo = new THREE.LatheGeometry(pts, 48);
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
      else c.setHex(PAL.peak);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true, roughness: 0.9, rim: 0.15 }));
    m.position.set(x, SEA_Y, z);
    g.add(m);
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
