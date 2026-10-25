// Fabrics main: studio renderer, cloth world loop, tools (grab, pin, cut, burn, dye, wind, yarn), phone sensors and the UI.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCENES, cyclorama } from './scenes.js';
import { FABRICS, makeClothMaterial, applyFabric } from './fabrics.js';
import { Skin, COLORS, DYES, PATTERNS, patternThumb, yarnTexture } from './textures.js';
import { pushOut } from './cloth.js';
import { Sound } from './audio.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const Q = MOBILE ? 0.8 : 1;
const TEX = MOBILE ? 768 : 1024;
const SUB = MOBILE ? 8 : 10;
const store = {
  get(k, d) { try { const v = localStorage.getItem('fabrics.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fabrics.' + k, JSON.stringify(v)); } catch { } },
};

const state = {
  scene: store.get('scene', 'curtain'), tool: 'grab', looks: {}, breeze: 0.3, gravity: 9.81, slow: false,
  tilt: false, blow: false, threads: false, dye: DYES[0][1], muted: store.get('muted', false),
};
const params = new URLSearchParams(location.search);
if (params.get('scene')) state.scene = params.get('scene');
if (!SCENES.find(s => s.id === state.scene)) state.scene = 'curtain';

const canvas = $('#gl'), fx = $('#fx'), fxc = fx.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let maxDpr = Math.min(window.devicePixelRatio || 1, 2);
let dpr = Math.min(maxDpr, 1.5);
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.02;

const scene = new THREE.Scene();
const BG = new THREE.Color(0xece7df);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 11, 28);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;
scene.add(new THREE.HemisphereLight(0xfff6ea, 0xcbc2b4, 0.75));
const key = new THREE.DirectionalLight(0xfff0dc, 2.5);
key.castShadow = true;
key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 3.6, bottom: -3.2, near: 0.5, far: 16 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.022;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xe2ebff, 0.8);
rim.position.set(-3, 3.5, -4);
scene.add(rim);
const fireLight = new THREE.PointLight(0xff7a2a, 0, 4.5, 2);
scene.add(fireLight);
scene.add(cyclorama());

const sound = new Sound();
sound.muted = state.muted;

const rig = { yaw: 0, pitch: 0, radius: 5, target: new THREE.Vector3(), tYaw: 0, tPitch: 0, tRadius: 5, tTarget: new THREE.Vector3(), vy: 0, vp: 0 };
function fitRadius(def) {
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, tv = Math.tan(vf), th = tv * innerWidth / innerHeight;
  const [w, h] = def.frame;
  return Math.max(def.camera.radius, (w / 2) / th + 0.4, (h / 2) / (tv * 0.84) + 0.6);
}
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 7);
  if (!input.orbiting) {
    rig.tYaw += rig.vy * dt; rig.tPitch += rig.vp * dt;
    rig.vy *= Math.exp(-dt * 4); rig.vp *= Math.exp(-dt * 4);
  }
  rig.tPitch = clamp(rig.tPitch, -0.12, 1.36); rig.tRadius = clamp(rig.tRadius, 1.2, 14);
  const yl = world.def?.camera.yawLimit;
  if (yl) { rig.tYaw = clamp(rig.tYaw, -yl, yl); if (Math.abs(rig.tYaw) === yl) rig.vy = 0; }
  rig.yaw += (rig.tYaw - rig.yaw) * k; rig.pitch += (rig.tPitch - rig.pitch) * k; rig.radius += (rig.tRadius - rig.radius) * k;
  rig.target.lerp(rig.tTarget, k);
  const cp = Math.cos(rig.pitch);
  camera.position.set(rig.target.x + rig.radius * Math.sin(rig.yaw) * cp, Math.max(0.12, rig.target.y + rig.radius * Math.sin(rig.pitch)), rig.target.z + rig.radius * Math.cos(rig.yaw) * cp);
  camera.lookAt(rig.target);
}

const world = { def: null, built: null, cloths: [], views: [], colliders: [], balls: [], time: 0, pins: [], pending: [] };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const camDir = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();

function makeView(cl) {
  const skin = new Skin(TEX, cl.width, cl.height);
  const mat = makeClothMaterial(skin, cl.width, cl.height);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cl.pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(cl.nrm, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(cl.uv, 2));
  geo.setAttribute('burn', new THREE.BufferAttribute(cl.burn, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(cl.index, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, cl.indexCount);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.customDepthMaterial = mat.userData.depth;
  mesh.userData.cloth = cl;
  scene.add(mesh);
  return { cl, skin, mat, geo, mesh, topo: cl.topoVersion, threads: null, burnShown: false };
}

function disposeObject(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { if (m.map && !m.map.userData.shared) m.map.dispose(); m.dispose(); });
  });
}

function clearScene() {
  if (world.built) { scene.remove(world.built.group); disposeObject(world.built.group); }
  for (const v of world.views) {
    scene.remove(v.mesh); v.geo.dispose(); v.mat.normalMap?.dispose(); v.mat.userData.depth.dispose(); v.mat.dispose(); v.skin.dispose();
    if (v.threads) { scene.remove(v.threads); v.threads.geometry.dispose(); v.threads.material.dispose(); }
  }
  for (const b of world.balls) { scene.remove(b.mesh); b.mesh.material.dispose(); }
  world.balls = []; world.views = []; world.cloths = []; world.pins = []; world.pending = [];
  endGrab(); sparks.clear(); smoke.clear();
}

function loadScene(id, snap = false) {
  clearScene();
  const def = SCENES.find(s => s.id === id);
  state.scene = id; store.set('scene', id);
  const built = def.build(Q);
  Object.assign(world, { def, built, colliders: built.colliders, time: 0, cloths: built.cloths });
  scene.add(built.group);
  built.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.views = built.cloths.map(makeView);
  if (!state.looks[id]) state.looks[id] = { fabric: def.fabric, pattern: def.pattern, color: def.color, scale: def.scale };
  applyLook();
  state.breeze = def.breeze; $('#breeze').value = def.breeze;
  rig.tTarget.fromArray(def.camera.target); rig.tYaw = def.camera.yaw; rig.tPitch = def.camera.pitch; rig.tRadius = rig.fitBase = fitRadius(def);
  rig.vy = rig.vp = 0;
  if (snap) { rig.target.copy(rig.tTarget); rig.yaw = rig.tYaw; rig.pitch = rig.tPitch; rig.radius = rig.tRadius; }
  key.target.position.set(def.camera.target[0], 0.6, def.camera.target[2]);
  key.position.set(key.target.position.x + 2.6, 6.2, key.target.position.z + 3.8);
  for (let i = 0; i < (def.balls || 0); i++) world.pending.push(0.7 + i * 0.45);
  for (const t of world.views) t.cl.forces(env);
  if (state.threads) world.views.forEach(buildThreads);
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.id === id));
  hint(def.hint, 4200);
}

function applyLook() {
  const look = state.looks[state.scene], f = FABRICS[look.fabric];
  for (const v of world.views) {
    v.cl.setFabric(f);
    v.skin.setPattern(look.pattern, look.color, look.scale);
    applyFabric(v.mat, f, look.color, v.mesh);
  }
  const pn = PATTERNS.find(p => p.id === look.pattern).name, cn = (COLORS.find(c => c[1] === look.color) || ['Custom'])[0];
  $('#sub').textContent = `${f.name} · ${pn} · ${cn}`;
  $('#fabName').textContent = f.name;
  const th = $('#fabThumb').getContext('2d');
  th.drawImage(patternThumb(look.pattern, look.color, 64), 0, 0);
  refreshFabricSheet();
}

const env = {
  windAt(x, y, z, out) {
    const t = world.time, d = world.def.windDir, b = state.breeze * 8;
    const gust = 0.62 + 0.38 * Math.sin(t * 0.9 + x * 0.6) * Math.sin(t * 1.7 + z * 0.5 + 1.3) + 0.22 * Math.sin(t * 3.1 + y * 1.3 + x * 0.7);
    out[0] = d[0] * b * gust + Math.sin(t * 2.3 + y * 2.1 + z) * b * 0.16;
    out[1] = d[1] * b * gust + Math.sin(t * 1.9 + x * 1.7) * b * 0.1;
    out[2] = d[2] * b * gust + Math.cos(t * 2.7 + x * 1.9 + y) * b * 0.24 + Math.sin(t * 7.3 - x * 4.1 - z * 2) * b * b * 0.012;
    if (micWind > 0.01) {
      const m = micWind * 10 * (0.8 + 0.2 * Math.sin(t * 9 + x * 3 + y * 2));
      out[0] += camDir.x * m; out[1] += camDir.y * m + micWind * 1.5; out[2] += camDir.z * m;
    }
    if (blower.s > 0.01) {
      const px = x - blower.o.x, py = y - blower.o.y, pz = z - blower.o.z;
      const tt = px * blower.d.x + py * blower.d.y + pz * blower.d.z;
      if (tt > 0) {
        const qx = px - blower.d.x * tt, qy = py - blower.d.y * tt, qz = pz - blower.d.z * tt;
        const R = 0.2 + tt * 0.16, f = Math.exp(-(qx * qx + qy * qy + qz * qz) / (R * R)) * blower.s * 13 / (1 + tt * 0.12);
        const flick = 0.85 + 0.15 * Math.sin(t * 23 + x * 9 + y * 7);
        out[0] += (blower.d.x + blower.lat.x * 0.5) * f * flick; out[1] += (blower.d.y + blower.lat.y * 0.5) * f * flick; out[2] += (blower.d.z + blower.lat.z * 0.5) * f * flick;
      }
    }
  },
};

const blower = { on: false, s: 0, o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1), lat: new THREE.Vector3() };
let micWind = 0;
const tiltG = new THREE.Vector3(0, -1, 0);
let tiltSign = 0;
const G = [0, -9.81, 0];

const YARN = ['#C2433A', '#E2B92E', '#4FA0B5', '#8C9B7C', '#B23A78', '#ECE4D4', '#283863', '#C69526'];
const yarnTex = {};
const ballGeo = new THREE.SphereGeometry(1, 32, 22);
function spawnBall(p, v, r = 0.11) {
  const col = YARN[(Math.random() * YARN.length) | 0];
  if (!yarnTex[col]) { yarnTex[col] = yarnTexture(col); yarnTex[col].userData.shared = true; }
  const mat = new THREE.MeshPhysicalMaterial({ map: yarnTex[col], roughness: 0.95, sheen: 0.9, sheenRoughness: 0.55, sheenColor: new THREE.Color(col).lerp(new THREE.Color(1, 1, 1), 0.3) });
  const mesh = new THREE.Mesh(ballGeo, mat);
  mesh.scale.setScalar(r); mesh.castShadow = mesh.receiveShadow = true;
  mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  scene.add(mesh);
  const b = { p: Float32Array.from(p), prev: Float32Array.from(p), v: Float32Array.from(v), r, w: 0.035, mesh, touch: 0, floor: false, vy0: 0, wasTouch: 0 };
  world.balls.push(b);
  if (world.balls.length > 12) { const o = world.balls.shift(); scene.remove(o.mesh); o.mesh.material.dispose(); }
}

const bOut = [0, 0, 0, 0];
function ballsIntegrate(h, g) {
  for (const b of world.balls) {
    b.vy0 = b.v[1];
    for (let a = 0; a < 3; a++) { b.v[a] = (b.v[a] + g[a] * h) * (1 - 0.08 * h); b.prev[a] = b.p[a]; b.p[a] += b.v[a] * h; }
    b.touch = 0;
  }
}
function ballsCollide() {
  const B = world.balls;
  for (const b of B) {
    const p = b.p;
    if (p[1] < b.r) { p[1] = b.r; b.floor = true; p[0] = b.prev[0] + (p[0] - b.prev[0]) * 0.996; p[2] = b.prev[2] + (p[2] - b.prev[2]) * 0.996; }
    for (const c of world.colliders) if (pushOut(c, p[0], p[1], p[2], b.r, bOut)) { p[0] += bOut[0] * bOut[3]; p[1] += bOut[1] * bOut[3]; p[2] += bOut[2] * bOut[3]; b.floor = b.floor || bOut[1] > 0.6; }
  }
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i].p, c = B[j].p, dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], r = B[i].r + B[j].r, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r || d2 < 1e-10) continue;
    const d = Math.sqrt(d2), s = (r - d) / d * 0.5;
    a[0] -= dx * s; a[1] -= dy * s; a[2] -= dz * s; c[0] += dx * s; c[1] += dy * s; c[2] += dz * s;
  }
}
function ballsPost(h) {
  for (const b of world.balls) {
    for (let a = 0; a < 3; a++) b.v[a] = (b.p[a] - b.prev[a]) / h;
    if (b.floor && b.vy0 < -0.9) { b.v[1] = -b.vy0 * 0.42; sound.play(['thud1', 'thud2'], Math.min(1, -b.vy0 / 6), 0.05); }
    b.floor = false;
  }
}

function gravityVec() {
  if (state.tilt) { G[0] = tiltG.x * state.gravity; G[1] = tiltG.y * state.gravity; G[2] = tiltG.z * state.gravity; }
  else { G[0] = 0; G[1] = -state.gravity; G[2] = 0; }
  return G;
}

function stepWorld(dt, realDt) {
  world.time += dt;
  for (let i = world.pending.length - 1; i >= 0; i--) if (world.time > world.pending[i]) {
    world.pending.splice(i, 1);
    const t = rig.tTarget;
    spawnBall([t.x + (Math.random() - 0.5) * 0.9, 2.6 + Math.random() * 0.5, t.z + (Math.random() - 0.5) * 0.15], [0, 0, 0]);
  }
  const g = gravityVec();
  const sub = clamp(Math.round(SUB * realDt * 60), 3, SUB * 2), h = dt / sub;
  const C = world.cloths;
  for (const cl of C) { cl.forces(env); cl.buildNeighbors(); }
  grabPrepare(realDt);
  for (let s = 0; s < sub; s++) {
    const frac = 1 / (sub - s);
    for (const cl of C) cl.integrate(h, g, frac);
    ballsIntegrate(h, g);
    for (const cl of C) { cl.solve(h, s & 1); cl.selfSolve(); cl.collide(world.colliders, 0); cl.ballContact(world.balls); }
    ballsCollide();
    for (const cl of C) cl.post(h);
    ballsPost(h);
  }
  let burning = 0, burnC = [0, 0, 0];
  for (const cl of C) {
    cl.tear();
    const n = cl.updateBurn(dt);
    if (n) { burning += n; burnC[0] += cl.burnCenter[0] * n; burnC[1] += cl.burnCenter[1] * n; burnC[2] += cl.burnCenter[2] * n; }
    if (cl.topoDirty) cl.rebuild();
    if (cl.events.tears) { sound.play(['tear1', 'tear2'], 0.4 + Math.min(0.6, cl.events.tears * 0.08), 0.18); cl.events.tears = 0; }
  }
  world.burning = burning;
  if (burning) world.burnC = burnC.map(v => v / burning);
  world.built.update?.();
}

const sparkVS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; vC = aColor; }`;
const sparkFS = `varying float vA; varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC, a * a * vA); }`;
class Sparks {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.kind = new Uint8Array(max); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3); this.s0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: sparkVS, fragmentShader: sparkFS, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.geo = g;
    scene.add(this.points);
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  spawn(kind, x, y, z) {
    if (this.n >= this.max) return;
    const i = this.n++, r = Math.random;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.kind[i] = kind; this.age[i] = 0;
    if (kind === 0) { this.life[i] = 0.35 + r() * 0.3; this.s0[i] = 0.07 + r() * 0.08; this.v.set([(r() - 0.5) * 0.2, 0.5 + r() * 0.5, (r() - 0.5) * 0.2], i * 3); }
    else if (kind === 1) { this.life[i] = 0.9 + r() * 1.2; this.s0[i] = 0.012 + r() * 0.012; this.v.set([(r() - 0.5) * 0.6, 0.5 + r() * 0.8, (r() - 0.5) * 0.6], i * 3); }
    else { this.life[i] = 2 + r() * 1.5; this.s0[i] = 0.12 + r() * 0.08; this.v.set([(r() - 0.5) * 0.15, 0.3 + r() * 0.25, (r() - 0.5) * 0.15], i * 3); }
  }
  update(dt) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      if (j !== i) {
        this.p.copyWithin(j * 3, i * 3, i * 3 + 3); this.v.copyWithin(j * 3, i * 3, i * 3 + 3);
        this.life[j] = this.life[i]; this.age[j] = this.age[i]; this.kind[j] = this.kind[i]; this.s0[j] = this.s0[i];
      }
      const t = this.age[j] / this.life[j], k = this.kind[j];
      const tt = world.time * 3 + j;
      this.v[j * 3] += Math.sin(tt) * dt * (k === 1 ? 1.4 : 0.3);
      this.v[j * 3 + 2] += Math.cos(tt * 1.3) * dt * (k === 1 ? 1.4 : 0.3);
      for (let a = 0; a < 3; a++) this.p[j * 3 + a] += this.v[j * 3 + a] * dt;
      if (k === 0) { this.size[j] = this.s0[j] * (1 - t * 0.6); this.alpha[j] = (1 - t) * 0.85; this.col.set([1, 0.75 - t * 0.45, 0.28 - t * 0.22], j * 3); }
      else if (k === 1) { this.size[j] = this.s0[j]; this.alpha[j] = (1 - t) * (0.6 + 0.4 * Math.sin(tt * 7)); this.col.set([1, 0.55, 0.16], j * 3); }
      else { this.size[j] = this.s0[j] * (1 + t * 2.4); this.alpha[j] = Math.sin(t * Math.PI) * 0.1; this.col.set([0.32, 0.3, 0.29], j * 3); }
      j++;
    }
    this.n = j;
    this.geo.setDrawRange(0, j);
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[a].needsUpdate = true;
  }
}
const sparks = new Sparks(700, true), smoke = new Sparks(220, false);

const pinMat = new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
const pinHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024, 18, 14), pinMat, 120);
const pinShafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xb9b9b9, metalness: 1, roughness: 0.3 }), 120);
pinHeads.castShadow = pinShafts.castShadow = true;
pinHeads.count = pinShafts.count = 0; pinHeads.frustumCulled = pinShafts.frustumCulled = false;
scene.add(pinHeads, pinShafts);
const pinObj = new THREE.Object3D(), upY = new THREE.Vector3(0, 1, 0);
function updatePins() {
  let n = 0;
  world.pins = world.pins.filter(p => world.cloths[p.ci] && world.cloths[p.ci].pinned[p.k] && world.cloths[p.ci].alive[p.k]);
  for (const { ci, k } of world.pins) {
    if (n >= 120) break;
    const cl = world.cloths[ci], i = k * 3;
    tmpV.set(cl.nrm[i], cl.nrm[i + 1], cl.nrm[i + 2]);
    tmpV2.subVectors(camera.position, tmpV2.set(cl.pos[i], cl.pos[i + 1], cl.pos[i + 2]));
    if (tmpV.dot(tmpV2) < 0) tmpV.negate();
    tmpV.normalize();
    pinObj.position.set(cl.pos[i], cl.pos[i + 1], cl.pos[i + 2]);
    pinObj.quaternion.setFromUnitVectors(upY, tmpV); pinObj.scale.set(1, 0.045, 1); pinObj.updateMatrix();
    pinShafts.setMatrixAt(n, pinObj.matrix);
    pinObj.position.addScaledVector(tmpV, 0.045); pinObj.scale.set(1, 1, 1); pinObj.updateMatrix();
    pinHeads.setMatrixAt(n, pinObj.matrix);
    n++;
  }
  pinHeads.count = pinShafts.count = n;
  pinHeads.instanceMatrix.needsUpdate = pinShafts.instanceMatrix.needsUpdate = true;
}

function buildThreads(v) {
  if (v.threads) { scene.remove(v.threads); v.threads.geometry.dispose(); v.threads.material.dispose(); }
  const cl = v.cl, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(cl.pos, 3).setUsage(THREE.DynamicDrawUsage));
  v.tcol = new Float32Array(cl.n * 3);
  g.setAttribute('color', new THREE.BufferAttribute(v.tcol, 3).setUsage(THREE.DynamicDrawUsage));
  v.threads = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  v.threads.frustumCulled = false;
  v.ttopo = -1;
  scene.add(v.threads);
}
function updateThreads(v) {
  const cl = v.cl, g = v.threads.geometry;
  if (v.ttopo !== cl.topoVersion) {
    const idx = [];
    for (let c = 0; c < cl.structEnd; c++) if (cl.on[c]) idx.push(cl.ca[c], cl.cb[c]);
    g.setIndex(idx); v.ttopo = cl.topoVersion;
  }
  cl.computeStrain();
  for (let k = 0; k < cl.n; k++) {
    const s = clamp(cl.strain[k] * 14, 0, 1);
    v.tcol[k * 3] = 0.16 + s * 0.84; v.tcol[k * 3 + 1] = 0.15 + s * 0.5; v.tcol[k * 3 + 2] = 0.14 + s * 0.02;
  }
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
}

let woolNoted = false;
function updateVisuals(dt) {
  for (const v of world.views) {
    const { cl, geo } = v;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    if (cl.burnCount || v.burnShown) { geo.attributes.burn.needsUpdate = true; v.burnShown = cl.burnCount > 0; }
    if (v.topo !== cl.topoVersion) { geo.index.needsUpdate = true; geo.setDrawRange(0, cl.indexCount); v.topo = cl.topoVersion; }
    v.skin.update(dt);
    v.mat.userData.uniforms.uTime.value = world.time;
    v.mesh.visible = !state.threads;
    if (state.threads && v.threads) updateThreads(v);
    if (cl.burnCount) {
      const nf = Math.min(16, 1 + cl.burnCount * 0.25);
      for (let s = 0, tries = 0; s < nf && tries < 60; tries++) {
        const k = (Math.random() * cl.n) | 0;
        if (!cl.burning[k] || !cl.alive[k]) continue;
        s++;
        const i = k * 3;
        sparks.spawn(0, cl.pos[i], cl.pos[i + 1] + 0.02, cl.pos[i + 2]);
        if (Math.random() < 0.35) sparks.spawn(1, cl.pos[i], cl.pos[i + 1], cl.pos[i + 2]);
        if (Math.random() < 0.12) smoke.spawn(2, cl.pos[i], cl.pos[i + 1] + 0.05, cl.pos[i + 2]);
      }
      if (cl.fabric.selfExtinguish && !woolNoted) { woolNoted = true; setTimeout(() => toast('Wool resists flame. It chars and puts itself out.'), 1500); }
    }
  }
  sparks.update(dt); smoke.update(dt);
  if (world.burning) {
    fireLight.position.set(world.burnC[0], world.burnC[1] + 0.1, world.burnC[2]);
    fireLight.intensity = Math.min(4, 0.4 + world.burning * 0.04) * (0.8 + 0.2 * Math.sin(world.time * 31) * Math.sin(world.time * 17));
  } else fireLight.intensity *= 0.85;
  for (const b of world.balls) {
    b.mesh.position.set(b.p[0], b.p[1], b.p[2]);
    const sp = Math.hypot(b.v[0], b.v[2]);
    if (sp > 0.01) { tmpV.set(b.v[2] / sp, 0, -b.v[0] / sp); tmpQ.setFromAxisAngle(tmpV, sp * dt / b.r); b.mesh.quaternion.premultiply(tmpQ); }
    if (b.touch > 0.004 && !b.wasTouch && Math.hypot(b.v[0], b.v[1], b.v[2]) > 2) sound.play(['thud1', 'thud2'], 0.35, 0.08, 0.8);
    b.wasTouch = b.touch > 0.004;
  }
  updatePins();
  if (sound.ctx) {
    let ke = 0;
    for (const cl of world.cloths) ke = Math.max(ke, cl.kinetic());
    const sp = Math.sqrt(ke), heavy = world.views[0]?.cl.fabric.aero < 0.6;
    sound.level('rustle', clamp((sp - 0.12) * 0.55, 0, 0.85), heavy ? 0.8 : 1.1);
    sound.level('flap', world.def.id === 'flag' ? clamp(state.breeze * 0.7 + sp * 0.05, 0, 0.8) : clamp((state.breeze - 0.4) * 0.6, 0, 0.4));
    sound.level('wind', clamp(blower.s * 0.75 + micWind * 0.9 + state.breeze * 0.12, 0, 1), 0.9 + blower.s * 0.3);
    sound.level('fire', clamp(world.burning / 50, 0, 0.95));
  }
}

const fxState = { trail: [], dirty: false, cursor: null };
function drawFx(dt) {
  const now = performance.now();
  fxState.trail = fxState.trail.filter(p => now - p.t < 380);
  const active = fxState.trail.length > 1 || blower.s > 0.02;
  if (!active && !fxState.dirty) return;
  const s = fx.width / innerWidth;
  fxc.setTransform(s, 0, 0, s, 0, 0);
  fxc.clearRect(0, 0, innerWidth, innerHeight);
  fxState.dirty = active;
  if (fxState.trail.length > 1) {
    fxc.lineCap = fxc.lineJoin = 'round';
    for (const [w, c] of [[5, 'rgba(250,248,244,0.7)'], [1.6, 'rgba(29,26,23,0.9)']]) {
      for (let i = 1; i < fxState.trail.length; i++) {
        const a = fxState.trail[i - 1], b = fxState.trail[i], life = 1 - (now - b.t) / 380;
        fxc.globalAlpha = life; fxc.strokeStyle = c; fxc.lineWidth = w * (0.4 + life * 0.6);
        fxc.setLineDash(w < 2 ? [5, 4] : []);
        fxc.beginPath(); fxc.moveTo(a.x, a.y); fxc.lineTo(b.x, b.y); fxc.stroke();
      }
    }
    fxc.setLineDash([]); fxc.globalAlpha = 1;
  }
  if (blower.s > 0.02 && fxState.cursor) {
    const { x, y } = fxState.cursor, t = now / 1000;
    fxc.strokeStyle = 'rgba(29,26,23,0.55)'; fxc.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 1.6 + k / 3) % 1, r = 14 + ph * 46;
      fxc.globalAlpha = (1 - ph) * blower.s;
      fxc.beginPath(); fxc.arc(x, y, r, t * 2 + k, t * 2 + k + 4.2); fxc.stroke();
    }
    fxc.globalAlpha = 1;
  }
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera); }
function hitCloth(x, y) {
  setRay(x, y);
  const meshes = world.views.filter(v => v.mesh.visible || state.threads).map(v => { v.geo.computeBoundingSphere(); return v.mesh; });
  const was = meshes.map(m => m.visible);
  meshes.forEach(m => m.visible = true);
  const h = raycaster.intersectObjects(meshes, false)[0];
  meshes.forEach((m, i) => m.visible = was[i]);
  return h || null;
}
function nearestVertex(hit) {
  const P = hit.object.userData.cloth.pos, f = hit.face;
  let best = f.a, bd = Infinity;
  for (const k of [f.a, f.b, f.c]) { const d = (P[k * 3] - hit.point.x) ** 2 + (P[k * 3 + 1] - hit.point.y) ** 2 + (P[k * 3 + 2] - hit.point.z) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
}

const grab = { on: false, cl: null, ids: [], offs: null, plane: new THREE.Plane(), target: new THREE.Vector3(), pinch: 0 };
function startGrab(hit) {
  const cl = hit.object.userData.cloth, k0 = nearestVertex(hit);
  const i0 = k0 % cl.cols, j0 = (k0 / cl.cols) | 0;
  const ids = [];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    if (di * di + dj * dj > 2.6) continue;
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= cl.cols || j >= cl.rows) continue;
    const k = cl.id(i, j);
    if (cl.alive[k]) ids.push(k);
  }
  grab.offs = new Float32Array(ids.length * 3);
  ids.forEach((k, q) => {
    for (let a = 0; a < 3; a++) { grab.offs[q * 3 + a] = cl.pos[k * 3 + a] - hit.point.getComponent(a); cl.hold[k * 3 + a] = cl.pos[k * 3 + a]; }
    cl.held[k] = 1;
  });
  Object.assign(grab, { on: true, cl, ids, pinch: 0 });
  camera.getWorldDirection(tmpV);
  grab.plane.setFromNormalAndCoplanarPoint(tmpV, hit.point);
  grab.target.copy(hit.point);
}
function moveGrab(x, y) {
  setRay(x, y);
  if (raycaster.ray.intersectPlane(grab.plane, tmpV)) { grab.target.copy(tmpV); grab.target.y = Math.max(0.012, grab.target.y); }
}
function grabPrepare(dt) {
  if (!grab.on) return;
  grab.pinch = Math.min(1, grab.pinch + dt * 2.5);
  const f = 1 - 0.55 * grab.pinch, cl = grab.cl, t = grab.target;
  grab.ids.forEach((k, q) => {
    cl.hold[k * 3] = t.x + grab.offs[q * 3] * f; cl.hold[k * 3 + 1] = Math.max(0.01, t.y + grab.offs[q * 3 + 1] * f); cl.hold[k * 3 + 2] = t.z + grab.offs[q * 3 + 2] * f;
  });
}
function endGrab() {
  if (grab.on && grab.cl) for (const k of grab.ids) grab.cl.held[k] = 0;
  grab.on = false; grab.cl = null; grab.ids = [];
}

const proj = new THREE.Matrix4();
function projectCloth(cl) {
  if (!cl.sxy || cl.sxy.length !== cl.n * 3) cl.sxy = new Float32Array(cl.n * 3);
  proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = proj.elements, P = cl.pos, S = cl.sxy, W = innerWidth, H = innerHeight;
  for (let k = 0; k < cl.n; k++) {
    const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (cw <= 0.01) { S[k * 3 + 2] = -1; continue; }
    S[k * 3] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * W;
    S[k * 3 + 1] = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * H;
    S[k * 3 + 2] = 1;
  }
  return S;
}

function togglePin(hit) {
  const cl = hit.object.userData.cloth, ci = world.cloths.indexOf(cl), k = nearestVertex(hit);
  if (cl.pinned[k]) { cl.pin(k, false); world.pins = world.pins.filter(p => !(p.ci === ci && p.k === k)); sound.play('snip2', 0.25, 0.05, 1.6); }
  else { cl.pin(k, true); world.pins.push({ ci, k }); sound.play('snip1', 0.3, 0.05, 1.8); }
}
function igniteAt(hit) {
  const cl = hit.object.userData.cloth, k0 = nearestVertex(hit);
  const i0 = k0 % cl.cols, j0 = (k0 / cl.cols) | 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i >= 0 && j >= 0 && i < cl.cols && j < cl.rows) cl.ignite(cl.id(i, j));
  }
  for (let s = 0; s < 8; s++) sparks.spawn(s % 2, hit.point.x, hit.point.y, hit.point.z);
  sound.play('ignite', 0.8, 0.5);
}
let lastDye = null;
function dyeAt(hit, tap) {
  const cl = hit.object.userData.cloth, v = world.views.find(w => w.cl === cl);
  const u = hit.uv.x, w = hit.uv.y;
  if (!tap && lastDye && lastDye.cl === cl && Math.hypot((u - lastDye.u) * cl.width, (w - lastDye.v) * cl.height) < 0.035) return;
  lastDye = { cl, u, v: w };
  v.skin.drop(u, w, state.dye, tap ? 0.09 + Math.random() * 0.03 : 0.05);
  if (tap) sound.play('drip', 0.7, 0.06);
}
function throwYarn(x, y) {
  setRay(x, y);
  const d = raycaster.ray.direction;
  camera.getWorldDirection(camDir);
  camUp.copy(camera.up).applyQuaternion(camera.quaternion);
  const o = tmpV.copy(camera.position).addScaledVector(d, 0.6).addScaledVector(camUp, -0.12);
  const spd = 7.5 + rig.radius * 0.5;
  spawnBall([o.x, o.y, o.z], [d.x * spd, d.y * spd + 1.6, d.z * spd]);
}
function letGo() {
  for (const cl of world.cloths) {
    for (let k = 0; k < cl.n; k++) { cl.pinned[k] = 0; cl.w[k] = 1; }
    cl.rail = null;
  }
  world.pins = [];
  sound.play('snip2', 0.4, 0.05, 0.7);
}

const input = { pointers: new Map(), mode: null, orbiting: false, lastX: 0, lastY: 0, lastT: 0, downX: 0, downY: 0, pinchD: 0, pinchC: null, moved: 0, lastAct: 0 };
function orbitBy(dx, dy, dt) {
  const sy = -dx * 0.0048, sp = dy * 0.004;
  rig.tYaw += sy; rig.tPitch += sp;
  if (dt > 0) { rig.vy = rig.vy * 0.5 + sy / dt * 0.5; rig.vp = rig.vp * 0.5 + sp / dt * 0.5; }
}
canvas.addEventListener('pointerdown', e => {
  sound.unlock();
  if (innerWidth < 720) closeSheets();
  canvas.setPointerCapture(e.pointerId);
  input.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (input.pointers.size === 2) {
    endAction();
    const [a, b] = [...input.pointers.values()];
    input.pinchD = Math.hypot(a.x - b.x, a.y - b.y); input.pinchC = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    input.mode = 'pinch'; input.orbiting = true;
    return;
  }
  if (input.pointers.size > 2) return;
  const x = e.clientX, y = e.clientY;
  Object.assign(input, { lastX: x, lastY: y, downX: x, downY: y, lastT: performance.now(), moved: 0 });
  rig.vy = rig.vp = 0;
  if (e.button === 2 || e.button === 1) { input.mode = 'orbit'; input.orbiting = true; return; }
  const t = state.tool;
  if (t === 'cut') { input.mode = 'cut'; fxState.trail.push({ x, y, t: performance.now() }); return; }
  if (t === 'wind') { input.mode = 'wind'; blower.on = true; aimBlower(x, y, 0, 0); return; }
  if (t === 'yarn') { input.mode = 'yarn'; return; }
  const hit = hitCloth(x, y);
  if (!hit) { input.mode = 'orbit'; input.orbiting = true; return; }
  if (t === 'grab') { startGrab(hit); input.mode = 'grab'; canvas.style.cursor = 'grabbing'; }
  else if (t === 'pin') { togglePin(hit); input.mode = 'pin'; }
  else if (t === 'burn') { igniteAt(hit); input.mode = 'burn'; input.lastAct = performance.now(); }
  else if (t === 'dye') { lastDye = null; dyeAt(hit, true); input.mode = 'dye'; }
});
canvas.addEventListener('pointermove', e => {
  if (!input.pointers.has(e.pointerId)) return;
  input.pointers.get(e.pointerId).x = e.clientX; input.pointers.get(e.pointerId).y = e.clientY;
  const now = performance.now(), x = e.clientX, y = e.clientY;
  if (input.mode === 'pinch' && input.pointers.size >= 2) {
    const [a, b] = [...input.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (input.pinchD > 0) rig.tRadius *= input.pinchD / Math.max(10, d);
    orbitBy(c.x - input.pinchC.x, c.y - input.pinchC.y, 0);
    input.pinchD = d; input.pinchC = c;
    return;
  }
  const dx = x - input.lastX, dy = y - input.lastY, dt = (now - input.lastT) / 1000;
  input.moved += Math.hypot(dx, dy);
  if (input.mode === 'yarn' && input.moved > 10) { input.mode = 'orbit'; input.orbiting = true; }
  switch (input.mode) {
    case 'orbit': orbitBy(dx, dy, dt); break;
    case 'grab': moveGrab(x, y); break;
    case 'cut': {
      fxState.trail.push({ x, y, t: now });
      let cut = 0;
      for (const cl of world.cloths) cut += cl.cutSegment(projectCloth(cl), input.lastX, input.lastY, x, y);
      if (cut) sound.play(['snip1', 'snip2'], 0.6, 0.11);
      break;
    }
    case 'wind': aimBlower(x, y, dx, dy); break;
    case 'burn': if (now - input.lastAct > 90) { const h = hitCloth(x, y); if (h) { igniteAt(h); input.lastAct = now; } } break;
    case 'dye': { const h = hitCloth(x, y); if (h) dyeAt(h, false); break; }
  }
  input.lastX = x; input.lastY = y; input.lastT = now;
});
function pointerEnd(e) {
  if (!input.pointers.has(e.pointerId)) return;
  input.pointers.delete(e.pointerId);
  if (input.mode === 'pinch') { if (input.pointers.size === 0) { input.mode = null; input.orbiting = false; } return; }
  if (input.mode === 'yarn' && input.moved <= 10) throwYarn(e.clientX, e.clientY);
  endAction();
}
function endAction() {
  if (input.mode === 'grab') endGrab();
  if (input.mode === 'wind') blower.on = false;
  input.mode = null; input.orbiting = false;
  canvas.style.cursor = cursorFor(state.tool);
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (grab.on) {
    camera.getWorldDirection(tmpV);
    grab.target.addScaledVector(tmpV, -e.deltaY * 0.0025);
    grab.plane.setFromNormalAndCoplanarPoint(tmpV, grab.target);
  } else rig.tRadius *= Math.exp(e.deltaY * 0.0012);
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
function aimBlower(x, y, dx, dy) {
  setRay(x, y);
  blower.o.copy(raycaster.ray.origin); blower.d.copy(raycaster.ray.direction);
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion); camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  blower.lat.copy(camRight).multiplyScalar(dx * 0.05).addScaledVector(camUp, -dy * 0.05).clampLength(0, 1.4);
  fxState.cursor = { x, y };
}
const cursorFor = t => ({ grab: 'grab', cut: 'crosshair', wind: 'cell' }[t] || 'pointer');

const hintEl = $('#hint'), toastEl = $('#toast');
let hintT = 0, toastT = 0;
function hint(text, ms = 2600) { hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove('show'), ms); }
function toast(text, err = false) {
  toastEl.textContent = text; toastEl.classList.toggle('err', err); toastEl.classList.add('show');
  hintEl.classList.remove('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

const TOOLS = {
  grab: MOBILE ? 'Drag fabric to pinch and pull. Drag empty space to look around.' : 'Drag fabric to pull it. Scroll while holding to push it away.',
  pin: 'Tap fabric to stick a pin in it. Tap the pin again to pull it out.',
  cut: 'Swipe across the fabric to cut it. Two fingers to look around.',
  burn: 'Tap to set the fabric alight.',
  dye: 'Tap or paint to drop dye. Colours mix like real dye.',
  wind: 'Hold to blow. Your finger aims the air.',
  yarn: 'Tap to throw a ball of yarn.',
};
function setTool(t) {
  state.tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const b = document.querySelector(`.tool[data-tool="${t}"]`);
  $('#puck').style.transform = `translateX(${b.offsetLeft - 5}px)`;
  canvas.style.cursor = cursorFor(t);
  hint(TOOLS[t]);
  renderCtx();
}
function renderCtx() {
  const c = $('#ctx'), t = state.tool;
  let html = '';
  if (t === 'pin') html = '<button class="pill" data-a="unpin">Pull my pins</button><button class="pill" data-a="letgo">Let go of everything</button>';
  if (t === 'cut') html = '<button class="pill" data-a="mend">Mend</button>';
  if (t === 'burn') html = '<button class="pill" data-a="out">Put it out</button><button class="pill" data-a="mend">Mend</button>';
  if (t === 'dye') html = DYES.map(([n, h]) => `<button class="dot${h === state.dye ? ' on' : ''}" data-dye="${h}" style="background:${h}" aria-label="${n}"></button>`).join('') + '<i class="sep"></i><button class="pill" data-a="wash">Wash</button>';
  if (t === 'yarn') html = '<button class="pill" data-a="rain">Drop a few</button><button class="pill" data-a="clearballs">Clear</button>';
  c.innerHTML = html;
  c.classList.toggle('show', !!html);
}
$('#ctx').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.unlock();
  if (b.dataset.dye) { state.dye = b.dataset.dye; renderCtx(); return; }
  const a = b.dataset.a;
  if (a === 'unpin') { for (const p of world.pins) world.cloths[p.ci]?.pin(p.k, false); world.pins = []; }
  if (a === 'letgo') letGo();
  if (a === 'mend') reset();
  if (a === 'out') { world.cloths.forEach(c => c.extinguish()); }
  if (a === 'wash') { world.views.forEach(v => v.skin.wash()); sound.play('drip', 0.5); }
  if (a === 'rain') for (let i = 0; i < 4; i++) world.pending.push(world.time + 0.1 + i * 0.25);
  if (a === 'clearballs') { for (const bl of world.balls) { scene.remove(bl.mesh); bl.mesh.material.dispose(); } world.balls = []; }
});

function reset() {
  const id = state.scene;
  const veil = $('#veil');
  veil.classList.add('on');
  setTimeout(() => { loadScene(id); veil.classList.remove('on'); }, 220);
}

function switchScene(id) {
  if (id === state.scene) return;
  const veil = $('#veil');
  veil.classList.add('on');
  setTimeout(() => { loadScene(id, true); veil.classList.remove('on'); }, 260);
}

const sheets = { fabric: $('#sheetFabric'), set: $('#sheetSet') };
function openSheet(s) { closeSheets(); sheets[s].classList.add('show'); $('#scrim').classList.add('show'); if (s === 'set') $('#bSet').classList.add('on'); }
function closeSheets() { Object.values(sheets).forEach(s => { s.classList.remove('show'); s.style.transform = ''; }); $('#scrim').classList.remove('show'); $('#bSet').classList.remove('on'); }
$('#scrim').addEventListener('pointerdown', closeSheets);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
for (const s of Object.values(sheets)) {
  let y0 = null, dy = 0;
  const head = s.querySelector('header'), handle = s.querySelector('.handle');
  for (const el of [head, handle]) {
    el.addEventListener('pointerdown', e => { if (e.target.closest('button') || innerWidth >= 720) return; y0 = e.clientY; dy = 0; s.style.transition = 'none'; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); s.style.transform = `translateY(${dy}px)`; });
    const up = () => { if (y0 == null) return; y0 = null; s.style.transition = ''; if (dy > 70) closeSheets(); else s.style.transform = ''; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
}

function buildUI() {
  const sc = $('#scenes');
  sc.innerHTML = SCENES.map(s => `<button class="chip" data-id="${s.id}">${s.name}</button>`).join('');
  sc.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { sound.unlock(); switchScene(b.dataset.id); b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } });
  $('#tools').addEventListener('click', e => { const b = e.target.closest('.tool'); if (b) { sound.unlock(); setTool(b.dataset.tool); } });
  $('#bFabric').addEventListener('click', () => { sound.unlock(); sheets.fabric.classList.contains('show') ? closeSheets() : openSheet('fabric'); });
  $('#bSet').addEventListener('click', () => { sound.unlock(); sheets.set.classList.contains('show') ? closeSheets() : openSheet('set'); });
  $('#bReset').addEventListener('click', () => { sound.unlock(); reset(); });
  $('#bShot').addEventListener('click', snapshot);
  $('#bSound').addEventListener('click', () => { state.muted = !state.muted; store.set('muted', state.muted); sound.unlock(); sound.setMuted(state.muted); syncSound(); });
  syncSound();
  $('#mats').innerHTML = Object.entries(FABRICS).map(([id, f]) => `<button class="mat" data-f="${id}"><div class="sw ${id}"><canvas width="96" height="60"></canvas></div><b>${f.name}</b><small>${f.note}</small></button>`).join('');
  $('#mats').addEventListener('click', e => { const b = e.target.closest('.mat'); if (b) { look().fabric = b.dataset.f; applyLook(); } });
  $('#pats').innerHTML = PATTERNS.map(p => `<button class="pat" data-p="${p.id}"><canvas width="96" height="96"></canvas>${p.name}</button>`).join('');
  $('#pats').addEventListener('click', e => { const b = e.target.closest('.pat'); if (b) { look().pattern = b.dataset.p; applyLook(); } });
  $('#cols').innerHTML = COLORS.map(([n, h]) => `<button class="col" data-c="${h}" style="background:${h}" aria-label="${n}"></button>`).join('') + '<label class="col custom" aria-label="Custom colour"><input type="color" id="customCol"></label>';
  $('#cols').addEventListener('click', e => { const b = e.target.closest('.col[data-c]'); if (b) { look().color = b.dataset.c; applyLook(); } });
  $('#customCol').addEventListener('input', e => { look().color = e.target.value.toUpperCase(); applyLookSoon(); });
  $('#scale').addEventListener('input', e => { look().scale = +e.target.value; applyLookSoon(); });
  $('#breeze').addEventListener('input', e => { state.breeze = +e.target.value; });
  $('#gravity').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.gravity = +b.dataset.g;
    $('#gravity').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#tSlow').addEventListener('click', e => { state.slow = !state.slow; e.currentTarget.classList.toggle('on', state.slow); });
  $('#tThreads').addEventListener('click', e => {
    state.threads = !state.threads; e.currentTarget.classList.toggle('on', state.threads);
    for (const v of world.views) { if (state.threads) buildThreads(v); else if (v.threads) { scene.remove(v.threads); v.threads.geometry.dispose(); v.threads.material.dispose(); v.threads = null; } }
  });
  const motionOK = 'DeviceMotionEvent' in window && MOBILE;
  if (!motionOK) $('#rowTilt').style.display = 'none';
  $('#tTilt').addEventListener('click', async e => {
    const el = e.currentTarget;
    if (state.tilt) { state.tilt = false; el.classList.remove('on'); window.removeEventListener('devicemotion', onMotion); return; }
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function' && (await DeviceMotionEvent.requestPermission()) !== 'granted') throw new Error('denied');
      tiltSign = 0; state.tilt = true; el.classList.add('on');
      window.addEventListener('devicemotion', onMotion);
      hint('Tilt your phone. Gravity follows it.');
    } catch { toast('Motion access was blocked.', true); }
  });
  $('#tBlow').addEventListener('click', async e => {
    const el = e.currentTarget;
    if (state.blow) { state.blow = false; el.classList.remove('on'); sound.disableMic(); return; }
    try { await sound.enableMic(); state.blow = true; el.classList.add('on'); hint('Blow into the microphone.'); }
    catch { toast('Microphone access was blocked.', true); }
  });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const n = +e.key;
    if (n >= 1 && n <= 7) setTool(Object.keys(TOOLS)[n - 1]);
    if (e.key === 'r' || e.key === 'R') reset();
    if (e.key === 'f' || e.key === 'F') sheets.fabric.classList.contains('show') ? closeSheets() : openSheet('fabric');
    if (e.key === 'Escape') closeSheets();
  });
}
const look = () => state.looks[state.scene];
let lookT = 0;
function applyLookSoon() { clearTimeout(lookT); lookT = setTimeout(applyLook, 60); }
function syncSound() {
  const svg = $('#bSound svg');
  svg.querySelector('.w1').style.display = svg.querySelector('.w2').style.display = state.muted ? 'none' : '';
  svg.querySelector('.mx').style.display = state.muted ? '' : 'none';
}
function refreshFabricSheet() {
  const L = look();
  if (!L) return;
  document.querySelectorAll('.mat').forEach(b => {
    b.classList.toggle('on', b.dataset.f === L.fabric);
    const c = b.querySelector('canvas'), g = c.getContext('2d');
    g.drawImage(patternThumb(L.pattern, L.color, 96), 0, -18);
  });
  document.querySelectorAll('.pat').forEach(b => {
    b.classList.toggle('on', b.dataset.p === L.pattern);
    b.querySelector('canvas').getContext('2d').drawImage(patternThumb(b.dataset.p, L.color, 96), 0, 0);
  });
  document.querySelectorAll('.col[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === L.color));
  $('#scale').value = L.scale;
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180;
  const sx = a.x * Math.cos(ang) - a.y * Math.sin(ang), sy = a.x * Math.sin(ang) + a.y * Math.cos(ang), sz = a.z;
  if (!tiltSign) tiltSign = Math.abs(sy) > Math.abs(sz) ? Math.sign(sy) || 1 : Math.sign(sz) || 1;
  const dx = -tiltSign * sx, dy = -tiltSign * sy, dz = -tiltSign * sz;
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  camDir.set(0, 0, 1).applyQuaternion(camera.quaternion);
  tmpV2.set(0, 0, 0).addScaledVector(camRight, dx).addScaledVector(camUp, dy).addScaledVector(camDir, dz);
  if (tmpV2.lengthSq() > 0.5) tiltG.lerp(tmpV2.normalize(), 0.25).normalize();
}

function snapshot() {
  sound.unlock();
  renderer.render(scene, camera);
  canvas.toBlob(async blob => {
    if (!blob) { toast('Snapshot failed.', true); return; }
    const name = `fabrics-${state.scene}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (MOBILE && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Fabrics' }); return; } catch { } }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Snapshot saved.');
  }, 'image/png');
  const v = $('#veil'); v.style.background = '#fff'; v.classList.add('on');
  setTimeout(() => { v.classList.remove('on'); setTimeout(() => v.style.background = '', 300); }, 90);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const fs = Math.min(2, window.devicePixelRatio || 1);
  fx.width = Math.round(w * fs); fx.height = Math.round(h * fs);
  const sc = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  sparks.uniforms.uScale.value = smoke.uniforms.uScale.value = sc;
  if (world.def) { const f = fitRadius(world.def); rig.tRadius = f * (rig.tRadius / (rig.fitBase || rig.tRadius)); rig.fitBase = f; }
  const b = document.querySelector('.tool.on');
  if (b) $('#puck').style.transform = `translateX(${b.offsetLeft - 5}px)`;
}
addEventListener('resize', resize);

let last = performance.now(), ft = 0, fn = 0, cool = 3, ceiling = maxDpr;
function adapt(dt) {
  ft += dt; fn++; cool -= dt;
  if (fn < 45) return;
  const avg = ft / fn; ft = 0; fn = 0;
  if (cool > 0) return;
  if (avg > 1 / 40 && dpr > 1) { ceiling = dpr - 0.25; dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); cool = 2; }
  else if (avg < 1 / 57 && dpr < ceiling) { dpr = Math.min(ceiling, dpr + 0.25); renderer.setPixelRatio(dpr); resize(); cool = 3; }
}

function loop(now) {
  requestAnimationFrame(loop);
  const real = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  blower.s += ((blower.on ? 1 : 0) - blower.s) * (1 - Math.exp(-real * (blower.on ? 6 : 4)));
  micWind = state.blow ? sound.readMic() : 0;
  camera.getWorldDirection(camDir);
  stepWorld(real * (state.slow ? 0.25 : 1), real);
  updateVisuals(real);
  updateCamera(real);
  renderer.render(scene, camera);
  drawFx(real);
  adapt(real);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });

try {
  buildUI();
  resize();
  loadScene(state.scene, true);
  setTool('grab');
  hint(world.def.hint, 4200);
  updateCamera(1);
  renderer.compile(scene, camera);
  requestAnimationFrame(t => { last = t; loop(t); requestAnimationFrame(() => { $('#boot').classList.add('gone'); window.__fabrics = true; }); });
  window.FABRICS_DEBUG = {
    world, state, renderer, rig, camera, setTool, loadScene, stepWorld, sound, get dpr() { return dpr; },
    screen(ci, i, j) { const c = world.cloths[ci], k = c.id(i, j); const v = new THREE.Vector3(c.pos[k * 3], c.pos[k * 3 + 1], c.pos[k * 3 + 2]).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (0.5 - v.y * 0.5) * innerHeight]; },
  };
} catch (err) {
  console.error(err);
  $('#boot').classList.add('err');
  $('#bootMsg').textContent = 'The loom jammed: ' + err.message;
}
