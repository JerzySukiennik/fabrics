// Fabrics scenes: curtain on a sliding rod, flag, robe on a dress form, rug, tablecloth over a table, hammock.
import * as THREE from 'three';
import { Cloth, collider } from './cloth.js';

const M = {
  wood: () => new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.62 }),
  paleWood: () => new THREE.MeshStandardMaterial({ color: 0xc7a47c, roughness: 0.7 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xb8925a, metalness: 1, roughness: 0.32 }),
  wall: () => new THREE.MeshStandardMaterial({ color: 0xbcc0b1, roughness: 0.95 }),
  frame: () => new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.55 }),
  form: () => new THREE.MeshStandardMaterial({ color: 0xd8ccb8, roughness: 0.92 }),
  ceramic: () => new THREE.MeshStandardMaterial({ color: 0x6f8b86, roughness: 0.25 }),
  leather: () => new THREE.MeshStandardMaterial({ color: 0x9a6a45, roughness: 0.55 }),
  rope: () => new THREE.LineBasicMaterial({ color: 0xb9a07a }),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#9fc4e6'); gr.addColorStop(0.55, '#dce9f2'); gr.addColorStop(1, '#fff3df');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const grid = (q, c, r) => [Math.max(10, Math.round(c * q)), Math.max(10, Math.round(r * q))];

export const SCENES = [
  {
    id: 'curtain', name: 'Curtain', hint: 'Pull the curtains open. The rings slide on the rod.',
    camera: { target: [0, 1.5, 0.1], radius: 4.7, yaw: 0.22, pitch: 0.05, yawLimit: 1.15 }, frame: [3.6, 2.7],
    breeze: 0.12, windDir: [0.15, 0.05, 1], fabric: 'chiffon', pattern: 'solid', color: '#D7A39A', scale: 1,
    build(q) {
      const g = new THREE.Group();
      const wallZ = -0.3, ox = 0.88, oy0 = 0.55, oy1 = 2.45;
      const wm = M.wall(), fm = M.frame();
      const WW = 12, WH = 7, parts = [[-(WW + ox) / 2, WH / 2, WW - ox, WH], [(WW + ox) / 2, WH / 2, WW - ox, WH], [0, oy0 / 2, 2 * ox, oy0], [0, (WH + oy1) / 2, 2 * ox, WH - oy1]];
      for (const [x, y, w, h] of parts) g.add(mesh(new THREE.BoxGeometry(w, h, 0.12), wm, x, y, wallZ - 0.06));
      const fw = 0.07;
      for (const [x, y, w, h] of [[-ox, (oy0 + oy1) / 2, fw, oy1 - oy0 + fw], [ox, (oy0 + oy1) / 2, fw, oy1 - oy0 + fw], [0, oy0, 2 * ox + fw, fw], [0, oy1, 2 * ox + fw, fw], [0, (oy0 + oy1) / 2, 0.035, oy1 - oy0], [0, 1.7, 2 * ox, 0.035]])
        g.add(mesh(new THREE.BoxGeometry(w, h, 0.09), fm, x, y, wallZ - 0.04));
      g.add(mesh(new THREE.BoxGeometry(2 * ox + 0.24, 0.05, 0.16), fm, 0, oy0 - 0.03, wallZ + 0.04));
      g.add(mesh(new THREE.BoxGeometry(24, 0.12, 0.03), fm, 0, 0.06, wallZ + 0.015));
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(2 * ox + 0.4, oy1 - oy0 + 0.4), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
      sky.position.set(0, (oy0 + oy1) / 2, wallZ - 0.4); g.add(sky);
      const rodY = 2.62, br = M.brass();
      const rod = mesh(new THREE.CylinderGeometry(0.016, 0.016, 3.2, 16), br, 0, rodY, 0); rod.rotation.z = Math.PI / 2; g.add(rod);
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.SphereGeometry(0.038, 20, 14), br, s * 1.62, rodY, 0));
        const b = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), br, s * 1.38, rodY, wallZ / 2); b.rotation.x = Math.PI / 2; g.add(b);
      }
      const [c, r] = grid(q, 24, 38);
      const W = 2.2, H = 2.42, ry = rodY - 0.05;
      const cloths = [-1, 1].map(s => {
        const x0 = s < 0 ? -1.52 : 0.52, span = 1.0;
        const cl = new Cloth({
          cols: c, rows: r, width: W, height: H, tetherTop: true, memory: true, bendScale: 6,
          place(i, j, u, v, p) { p[0] = x0 + u * span; p[1] = ry - v * H * 0.98; p[2] = (0.08 + 0.006 * Math.sin(i * 1.7 + x0)) * Math.sin(i * Math.PI / 2) * (j === 0 ? 1.2 : 1) + 0.07 * Math.min(1, j / 2) + (j === 0 && i % 2 ? 0.02 : 0); },
        });
        cl.setRail(Array.from({ length: c }, (_, i) => i).filter(i => i % 2 === 0 || i === c - 1), ry, 0, -1.56, 1.56, 0.5);
        return cl;
      });
      const ringGeo = new THREE.TorusGeometry(0.03, 0.006, 8, 20);
      const rings = new THREE.InstancedMesh(ringGeo, br, c * 2);
      rings.castShadow = true; g.add(rings);
      const o = new THREE.Object3D();
      return {
        group: g, cloths, colliders: [collider('box', { x: 0, y: 3.5, z: wallZ - 0.06, hx: 12, hy: 3.5, hz: 0.06 })],
        update() {
          if (!cloths.some(cl => cl.rail)) return;
          let n = 0;
          for (const cl of cloths) for (const i of cl.rail ? cl.rail.ids : []) {
            o.position.set(cl.pos[i * 3], rodY, 0); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix();
            rings.setMatrixAt(n++, o.matrix);
          }
          rings.count = n;
          rings.instanceMatrix.needsUpdate = true;
        },
      };
    },
  },
  {
    id: 'flag', name: 'Flag', hint: 'Grab the flag, cut it, or blow on it.',
    camera: { target: [0.1, 2.3, 0], radius: 5.6, yaw: 0.22, pitch: 0.04 }, frame: [3.3, 3.6],
    breeze: 0.8, windDir: [1, 0, 0.3], fabric: 'silk', pattern: 'stripes', color: '#29666B', scale: 1,
    build(q) {
      const g = new THREE.Group(), br = M.brass();
      g.add(mesh(new THREE.CylinderGeometry(0.032, 0.04, 3.5, 20), new THREE.MeshStandardMaterial({ color: 0xdedad2, metalness: 0.6, roughness: 0.3 }), -1.1, 1.75, 0));
      g.add(mesh(new THREE.SphereGeometry(0.065, 24, 16), br, -1.1, 3.55, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 0.9 }), -1.1, 0.04, 0));
      const [c, r] = grid(q, 36, 24);
      const W = 2.1, H = 1.36;
      const cl = new Cloth({
        cols: c, rows: r, width: W, height: H,
        place(i, j, u, v, p) { p[0] = -1.06 + u * W * 0.97; p[1] = 3.38 - v * H; p[2] = 0.03 * Math.sin(u * 9); },
      });
      for (let j = 0; j < r; j++) cl.pin(cl.id(0, j));
      return { group: g, cloths: [cl], colliders: [collider('capsule', { ax: -1.1, ay: 0, az: 0, bx: -1.1, by: 3.5, bz: 0, r: 0.04 })] };
    },
  },
  {
    id: 'robe', name: 'Robe', hint: 'Lift the hem, pin it up, or tug the collar.',
    camera: { target: [0, 1.0, 0], radius: 3.4, yaw: 0.55, pitch: 0.1 }, frame: [1.3, 1.9],
    breeze: 0.08, windDir: [0.4, 0, 1], fabric: 'velvet', pattern: 'solid', color: '#651C28', scale: 1,
    build(q) {
      const g = new THREE.Group();
      const prof = [[0.86, 0], [0.86, 0.12], [0.9, 0.155], [1.0, 0.168], [1.1, 0.142], [1.18, 0.136], [1.28, 0.152], [1.36, 0.158], [1.43, 0.148], [1.48, 0.118], [1.51, 0.075], [1.53, 0.055], [1.64, 0.05], [1.66, 0.034], [1.672, 0]];
      const rAt = y => { for (let k = 1; k < prof.length; k++) if (y <= prof[k][0]) { const [y0, r0] = prof[k - 1], [y1, r1] = prof[k]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1); } return 0; };
      const lathe = new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 48);
      lathe.computeVertexNormals();
      const form = mesh(lathe, M.form()); form.scale.set(1.28, 1, 0.82); g.add(form);
      const br = M.brass(), wd = M.wood();
      g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.82, 12), br, 0, 0.45, 0));
      g.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), wd, 0, 1.68, 0));
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2, leg = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), wd);
        leg.position.set(Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.16); leg.lookAt(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4); leg.rotateX(Math.PI / 2);
        g.add(leg);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), wd, 0, 0.18, 0));
      const cols = [];
      for (const y of [0.95, 1.04, 1.13, 1.22, 1.3, 1.37, 1.41]) {
        const rr = rAt(y), rz = rr * 0.82, hx = Math.max(0.001, rr * 1.28 - rz);
        cols.push(collider('capsule', { ax: -hx, ay: y, az: 0, bx: hx, by: y, bz: 0, r: rz }));
      }
      cols.push(collider('capsule', { ax: 0, ay: 1.48, az: 0, bx: 0, by: 1.66, bz: 0, r: 0.056 }));
      cols.push(collider('capsule', { ax: 0, ay: 0.05, az: 0, bx: 0, by: 0.86, bz: 0, r: 0.02 }));
      const [c, r] = grid(q, 34, 30);
      const W = 1.5, H = 1.32, top = 1.52;
      const cl = new Cloth({
        cols: c, rows: r, width: W, height: H, selfCollide: true, thickness: 0.011,
        place(i, j, u, v, p) {
          const t = 0.42 + u * (Math.PI * 2 - 0.84), R = Math.min(0.3, 0.1 + v * H * 0.75);
          p[0] = Math.sin(t) * R * 1.3; p[2] = Math.cos(t) * R * 0.95; p[1] = top - v * H * 0.97;
        },
      });
      for (let i = 0; i < c; i++) cl.pin(cl.id(i, 0));
      return { group: g, cloths: [cl], colliders: cols };
    },
  },
  {
    id: 'rug', name: 'Rug', hint: 'Drag the rug around. Scrunch it, flip a corner.',
    camera: { target: [0, 0.12, 0], radius: 4.3, yaw: 0.32, pitch: 0.82 }, frame: [2.9, 1.5],
    breeze: 0, windDir: [1, 0, 0], fabric: 'wool', pattern: 'persian', color: '#93391F', scale: 1,
    build(q) {
      const g = new THREE.Group();
      const pouf = new THREE.LatheGeometry([[0, 0], [0.28, 0], [0.32, 0.04], [0.33, 0.18], [0.32, 0.32], [0.28, 0.36], [0, 0.365]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
      g.add(mesh(pouf, M.leather(), 1.0, 0, -0.55));
      const [c, r] = grid(q, 40, 26);
      const W = 2.2, H = 1.4;
      const cl = new Cloth({
        cols: c, rows: r, width: W, height: H, selfCollide: true, thickness: 0.014,
        place(i, j, u, v, p) { p[0] = (u - 0.5) * W; p[2] = (v - 0.5) * H; p[1] = 0.55 + 0.22 * u + 0.04 * Math.sin(v * 5); },
      });
      const lines = new Float32Array(r * 2 * 2 * 3 * 3);
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(lines, 3).setUsage(THREE.DynamicDrawUsage));
      const fringe = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0xeee6d6 }));
      fringe.frustumCulled = false; g.add(fringe);
      return {
        group: g, cloths: [cl], colliders: [collider('cylinder', { x: 1.0, z: -0.55, r: 0.33, y0: 0, y1: 0.365 })],
        update() {
          let n = 0;
          const P = cl.pos;
          for (const [i, d] of [[0, 1], [c - 1, -1]]) for (let j = 0; j < r; j++) {
            const k = cl.id(i, j), kin = cl.id(i + d, j);
            if (!cl.alive[k]) { for (let s = 0; s < 6; s++) { lines[n++] = 0; } for (let s = 0; s < 6; s++) lines[n++] = 0; continue; }
            const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
            let dx = x - P[kin * 3], dy = y - P[kin * 3 + 1], dz = z - P[kin * 3 + 2];
            const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
            for (const off of [-0.25, 0.25]) {
              const jj = Math.min(r - 1, Math.max(0, j + off)), k2 = cl.id(i, Math.round(jj));
              const bx = x + (P[k2 * 3] - x) * 0.5 * Math.abs(off), by = y + (P[k2 * 3 + 1] - y) * 0.5 * Math.abs(off), bz = z + (P[k2 * 3 + 2] - z) * 0.5 * Math.abs(off);
              lines[n++] = bx; lines[n++] = by; lines[n++] = bz;
              const ey = Math.max(0.003, by + dy * 0.08 - 0.015);
              lines[n++] = bx + dx * 0.08; lines[n++] = ey; lines[n++] = bz + dz * 0.08;
            }
          }
          fg.attributes.position.needsUpdate = true;
          fg.setDrawRange(0, n / 3);
        },
      };
    },
  },
  {
    id: 'table', name: 'Tablecloth', hint: 'Yank the tablecloth. Fast, like a magician.',
    camera: { target: [0, 0.62, 0], radius: 3.7, yaw: 0.42, pitch: 0.42 }, frame: [2.1, 1.4],
    breeze: 0, windDir: [1, 0, 0], fabric: 'linen', pattern: 'gingham', color: '#B5603F', scale: 1,
    build(q) {
      const g = new THREE.Group(), wd = M.paleWood();
      g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.035, 64), wd, 0, 0.7325, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.68, 20), wd, 0, 0.375, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.035, 40), wd, 0, 0.0175, 0));
      const vase = new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.12, 0.06], [0.135, 0.13], [0.11, 0.21], [0.06, 0.26], [0.05, 0.3], [0.065, 0.32], [0.055, 0.325], [0.04, 0.3], [0, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
      g.add(mesh(vase, M.ceramic(), 0.17, 0.75, -0.12));
      const bowl = new THREE.LatheGeometry([[0, 0], [0.08, 0], [0.15, 0.04], [0.19, 0.09], [0.185, 0.095], [0.14, 0.05], [0, 0.04]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
      g.add(mesh(bowl, new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.3 }), -0.22, 0.75, 0.16));
      const fruit = new THREE.MeshStandardMaterial({ color: 0xc8a33a, roughness: 0.45 });
      for (const [x, z] of [[-0.25, 0.13], [-0.18, 0.2], [-0.27, 0.22]]) g.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), fruit, x, 0.84, z));
      const cols = [
        collider('cylinder', { x: 0, z: 0, r: 0.6, y0: 0.715, y1: 0.75 }),
        collider('capsule', { ax: 0, ay: 0.03, az: 0, bx: 0, by: 0.72, bz: 0, r: 0.06 }),
        collider('cylinder', { x: 0, z: 0, r: 0.3, y0: 0, y1: 0.035 }),
        collider('sphere', { x: 0.17, y: 0.88, z: -0.12, r: 0.135 }),
        collider('capsule', { ax: 0.17, ay: 0.95, az: -0.12, bx: 0.17, by: 1.03, bz: -0.12, r: 0.07 }),
        collider('cylinder', { x: -0.22, z: 0.16, r: 0.19, y0: 0.75, y1: 0.9 }),
      ];
      const [c, r] = grid(q, 36, 36);
      const W = 1.8, H = 1.8;
      const cl = new Cloth({
        cols: c, rows: r, width: W, height: H, selfCollide: true, thickness: 0.01,
        place(i, j, u, v, p) { p[0] = (u - 0.5) * W; p[2] = (v - 0.5) * H; p[1] = 1.4 + 0.03 * Math.sin(u * 7 + v * 3); },
      });
      return { group: g, cloths: [cl], colliders: cols };
    },
  },
  {
    id: 'hammock', name: 'Hammock', hint: 'Throw yarn balls into the hammock.',
    camera: { target: [0, 0.68, 0], radius: 4.7, yaw: 0.5, pitch: 0.36 }, frame: [3.7, 1.8],
    breeze: 0.12, windDir: [0, 0, 1], fabric: 'linen', pattern: 'stripes', color: '#C69526', scale: 1.2,
    balls: 3,
    build(q) {
      const g = new THREE.Group(), wd = M.wood();
      const bx = 1.12, by = 0.95, hz = 0.5, px = 1.6, py = 1.52;
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.09, py, 0.09), wd, s * px, py / 2, 0));
        g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), wd, s * px, 0.03, 0));
        const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, hz * 2 + 0.12, 12), wd, s * bx, by, 0); bar.rotation.x = Math.PI / 2; g.add(bar);
      }
      const rp = [];
      for (const s of [-1, 1]) for (const z of [-hz - 0.04, hz + 0.04]) rp.push(s * bx, by, z, s * (px - 0.05), py - 0.06, 0);
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      g.add(new THREE.LineSegments(rg, M.rope()));
      const [c, r] = grid(q, 42, 16);
      const W = 2.62, H = hz * 2;
      const cl = new Cloth({
        cols: c, rows: r, width: W, height: H,
        place(i, j, u, v, p) { p[0] = (u - 0.5) * bx * 2; p[2] = (v - 0.5) * H; p[1] = by - 0.32 * Math.sin(u * Math.PI); },
      });
      for (let j = 0; j < r; j++) { cl.pin(cl.id(0, j)); cl.pin(cl.id(c - 1, j)); }
      return {
        group: g, cloths: [cl],
        colliders: [-1, 1].map(s => collider('box', { x: s * px, y: py / 2, z: 0, hx: 0.045, hy: py / 2, hz: 0.045 })),
      };
    },
  },
];

export function cyclorama() {
  const R = 2.6, zw = -4.2, pts = [[0, 14]];
  for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI / 2; pts.push([R - Math.cos(a) * R, zw + R - Math.sin(a) * R]); }
  pts.push([9, zw]);
  const pos = [], nrm = [], idx = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const ty = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(ty, tz) || 1;
    for (const x of [-20, 20]) { pos.push(x, pts[k][0], pts[k][1]); nrm.push(0, -tz / l, ty / l); }
  }
  for (let k = 0; k < pts.length - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.96 }));
  m.receiveShadow = true;
  return m;
}
