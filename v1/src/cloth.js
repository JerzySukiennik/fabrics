// Fabrics cloth engine: XPBD particle grid with tearing, cutting, burning, sliding rails, colliders, self-collision and two-way ball contact.
const STRUCT = 0, SHEAR = 1, BEND = 2;

export class Cloth {
  constructor(o) {
    const cols = o.cols, rows = o.rows, n = cols * rows;
    this.cols = cols; this.rows = rows; this.n = n;
    this.width = o.width; this.height = o.height;
    this.sx = o.width / (cols - 1); this.sy = o.height / (rows - 1);
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.acc = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.hold = new Float32Array(n * 3);
    this.uv = new Float32Array(n * 2);
    this.w = new Float32Array(n).fill(o.invMass || 1);
    this.pinned = new Uint8Array(n);
    this.held = new Uint8Array(n);
    this.alive = new Uint8Array(n).fill(1);
    this.burn = new Float32Array(n);
    this.burning = new Uint8Array(n);
    this.strain = new Float32Array(n);
    this.thickness = o.thickness || 0.012;
    this.selfCollide = !!o.selfCollide;
    this.bendScale = o.bendScale || 1;
    this.rail = null;
    const p = [0, 0, 0];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, u = i / (cols - 1), v = j / (rows - 1);
      o.place(i, j, u, v, p);
      this.pos[k * 3] = this.prev[k * 3] = p[0];
      this.pos[k * 3 + 1] = this.prev[k * 3 + 1] = p[1];
      this.pos[k * 3 + 2] = this.prev[k * 3 + 2] = p[2];
      this.uv[k * 2] = u; this.uv[k * 2 + 1] = 1 - v;
    }
    this.build(o.tetherTop);
    if (o.memory) for (let c = this.shearEnd; c < this.m; c++) {
      const i = this.ca[c] * 3, j = this.cb[c] * 3;
      this.rest[c] = Math.hypot(this.pos[i] - this.pos[j], this.pos[i + 1] - this.pos[j + 1], this.pos[i + 2] - this.pos[j + 2]);
    }
    this.compliance = [0, 1e-6, 1e-4];
    this.events = { tears: 0, cuts: 0, ignited: 0 };
    this.topoDirty = true;
    this.indexCount = 0;
    this.neighbors = new Int32Array(n * 8).fill(-1);
    this.box = new Float32Array(6);
    this.rebuild();
  }

  id(i, j) { return j * this.cols + i; }

  build(tetherTop) {
    const { cols, rows, sx, sy } = this;
    const A = [], B = [], R = [], T = [], TE = [], D = [];
    const add = (a, b, r, t, tether = 0, deps = null) => { A.push(a); B.push(b); R.push(r); T.push(t); TE.push(tether); D.push(deps); return A.length - 1; };
    const hE = new Int32Array((cols - 1) * rows), vE = new Int32Array(cols * (rows - 1));
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols - 1; i++) hE[j * (cols - 1) + i] = add(this.id(i, j), this.id(i + 1, j), sx, STRUCT, tetherTop && j === 0 ? 1 : 0);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols; i++) vE[j * cols + i] = add(this.id(i, j), this.id(i, j + 1), sy, STRUCT);
    this.structEnd = A.length;
    const dg = Math.hypot(sx, sy), qn = (cols - 1) * (rows - 1);
    const dU = new Int32Array(qn), dO = new Int32Array(qn);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const q = j * (cols - 1) + i, a = this.id(i, j), b = this.id(i + 1, j), c = this.id(i, j + 1), d = this.id(i + 1, j + 1);
      const flip = (i + j) & 1;
      dU[q] = flip ? add(a, d, dg, SHEAR) : add(b, c, dg, SHEAR);
      const quad = [hE[j * (cols - 1) + i], hE[(j + 1) * (cols - 1) + i], vE[j * cols + i], vE[j * cols + i + 1], dU[q]];
      dO[q] = flip ? add(b, c, dg, SHEAR, 0, quad) : add(a, d, dg, SHEAR, 0, quad);
    }
    this.shearEnd = A.length;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols - 2; i++) add(this.id(i, j), this.id(i + 2, j), 2 * sx, BEND, 0, [hE[j * (cols - 1) + i], hE[j * (cols - 1) + i + 1]]);
    for (let j = 0; j < rows - 2; j++) for (let i = 0; i < cols; i++) add(this.id(i, j), this.id(i, j + 2), 2 * sy, BEND, 0, [vE[j * cols + i], vE[(j + 1) * cols + i]]);
    const m = A.length;
    this.m = m;
    this.ca = Int32Array.from(A); this.cb = Int32Array.from(B);
    this.rest = Float32Array.from(R); this.type = Uint8Array.from(T); this.tether = Uint8Array.from(TE);
    this.on = new Uint8Array(m).fill(1);
    this.depStart = new Int32Array(m + 1);
    const dl = [];
    for (let c = 0; c < m; c++) { this.depStart[c] = dl.length; if (D[c]) dl.push(...D[c]); }
    this.depStart[m] = dl.length; this.depList = Int32Array.from(dl);
    const deg = new Int32Array(this.n + 1);
    for (let c = 0; c < m; c++) { deg[A[c] + 1]++; deg[B[c] + 1]++; }
    for (let i = 0; i < this.n; i++) deg[i + 1] += deg[i];
    this.adjStart = deg.slice();
    this.adj = new Int32Array(deg[this.n]);
    const fill = deg.slice();
    for (let c = 0; c < m; c++) { this.adj[fill[A[c]]++] = c; this.adj[fill[B[c]]++] = c; }
    const nt = qn * 2;
    this.nt = nt;
    this.triV = new Int32Array(nt * 3); this.triE = new Int32Array(nt * 3);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const q = j * (cols - 1) + i, t = q * 2;
      const a = this.id(i, j), b = this.id(i + 1, j), c = this.id(i, j + 1), d = this.id(i + 1, j + 1);
      const top = hE[j * (cols - 1) + i], bot = hE[(j + 1) * (cols - 1) + i], lef = vE[j * cols + i], rig = vE[j * cols + i + 1], dg2 = dU[q];
      if ((i + j) & 1) {
        this.triV.set([a, c, d], t * 3); this.triE.set([lef, bot, dg2], t * 3);
        this.triV.set([a, d, b], t * 3 + 3); this.triE.set([dg2, rig, top], t * 3 + 3);
      } else {
        this.triV.set([a, c, b], t * 3); this.triE.set([lef, dg2, top], t * 3);
        this.triV.set([b, c, d], t * 3 + 3); this.triE.set([dg2, bot, rig], t * 3 + 3);
      }
    }
    this.triVis = new Uint8Array(nt);
    this.index = this.n < 65536 ? new Uint16Array(nt * 3) : new Uint32Array(nt * 3);
    this.vertTris = new Uint16Array(this.n);
  }

  setFabric(f) {
    this.fabric = f;
    this.compliance[0] = f.stretch; this.compliance[1] = f.shear; this.compliance[2] = f.bend * this.bendScale;
  }

  pin(k, on = true) {
    this.pinned[k] = on ? 1 : 0;
    this.w[k] = on ? 0 : (this.rail && this.rail.set.has(k) ? this.rail.w : 1);
  }

  setRail(ids, y, z, x0, x1, w = 0.4) {
    this.rail = { ids: Int32Array.from(ids), set: new Set(ids), y, z, x0, x1, w };
    for (const k of ids) this.w[k] = w;
  }

  breakC(c) { if (this.on[c]) { this.on[c] = 0; this.topoDirty = true; } }

  kill(k) {
    if (!this.alive[k]) return;
    this.alive[k] = 0; this.burning[k] = 0; this.held[k] = 0;
    for (let e = this.adjStart[k]; e < this.adjStart[k + 1]; e++) this.on[this.adj[e]] = 0;
    this.topoDirty = true;
  }

  rebuild() {
    const { on, depStart, depList, m } = this;
    for (let c = 0; c < m; c++) {
      if (!on[c]) continue;
      for (let d = depStart[c]; d < depStart[c + 1]; d++) if (!on[depList[d]]) { on[c] = 0; break; }
    }
    const { triV, triE, triVis, index, alive, vertTris } = this;
    vertTris.fill(0);
    let cnt = 0;
    for (let t = 0; t < this.nt; t++) {
      const a = triV[t * 3], b = triV[t * 3 + 1], c = triV[t * 3 + 2];
      const vis = on[triE[t * 3]] && on[triE[t * 3 + 1]] && on[triE[t * 3 + 2]] && alive[a] && alive[b] && alive[c];
      triVis[t] = vis ? 1 : 0;
      if (vis) { index[cnt++] = a; index[cnt++] = b; index[cnt++] = c; vertTris[a]++; vertTris[b]++; vertTris[c]++; }
    }
    for (let k = 0; k < this.n; k++) if (alive[k] && !vertTris[k]) this.kill(k);
    this.indexCount = cnt;
    this.topoDirty = false;
    this.topoVersion = (this.topoVersion || 0) + 1;
  }

  forces(env) {
    const { pos, vel, acc, nrm, triV, triVis, nt } = this;
    const f = this.fabric, an = f.aero, at = f.aero * 0.12, ref = 0.5 * this.sx * this.sy;
    acc.fill(0); nrm.fill(0);
    const wind = env.windAt, wv = [0, 0, 0];
    for (let t = 0; t < nt; t++) {
      if (!triVis[t]) continue;
      const a = triV[t * 3] * 3, b = triV[t * 3 + 1] * 3, c = triV[t * 3 + 2] * 3;
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
      nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
      nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-12) continue;
      const ux = nx / l, uy = ny / l, uz = nz / l, area = l * 0.5 / ref;
      wind((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3, wv);
      const rx = wv[0] - (vel[a] + vel[b] + vel[c]) / 3, ry = wv[1] - (vel[a + 1] + vel[b + 1] + vel[c + 1]) / 3, rz = wv[2] - (vel[a + 2] + vel[b + 2] + vel[c + 2]) / 3;
      const vn = rx * ux + ry * uy + rz * uz;
      const k = area / 3;
      const fx = (an * vn * ux + at * (rx - vn * ux)) * k, fy = (an * vn * uy + at * (ry - vn * uy)) * k, fz = (an * vn * uz + at * (rz - vn * uz)) * k;
      acc[a] += fx; acc[a + 1] += fy; acc[a + 2] += fz;
      acc[b] += fx; acc[b + 1] += fy; acc[b + 2] += fz;
      acc[c] += fx; acc[c + 1] += fy; acc[c + 2] += fz;
    }
    for (let k = 0; k < this.n; k++) {
      const i = k * 3, l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
      nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
      if (this.burning[k]) acc[i + 1] += 2.2 * this.burn[k];
    }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let k = 0; k < this.n; k++) {
      if (!this.alive[k]) continue;
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    this.box.set([x0, y0, z0, x1, y1, z1]);
  }

  integrate(h, g, frac) {
    const { pos, prev, vel, acc, w, held, alive, hold, n } = this;
    const damp = Math.max(0, 1 - this.fabric.damping * h);
    for (let k = 0; k < n; k++) {
      if (!alive[k]) continue;
      const i = k * 3;
      prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
      if (held[k]) {
        pos[i] += (hold[i] - pos[i]) * frac; pos[i + 1] += (hold[i + 1] - pos[i + 1]) * frac; pos[i + 2] += (hold[i + 2] - pos[i + 2]) * frac;
        continue;
      }
      if (w[k] === 0) continue;
      let vx = (vel[i] + (g[0] + acc[i]) * h) * damp, vy = (vel[i + 1] + (g[1] + acc[i + 1]) * h) * damp, vz = (vel[i + 2] + (g[2] + acc[i + 2]) * h) * damp;
      const s2 = vx * vx + vy * vy + vz * vz;
      if (s2 > 900) { const s = 30 / Math.sqrt(s2); vx *= s; vy *= s; vz *= s; }
      vel[i] = vx; vel[i + 1] = vy; vel[i + 2] = vz;
      pos[i] += vx * h; pos[i + 1] += vy * h; pos[i + 2] += vz * h;
    }
  }

  solve(h, flip) {
    const ih2 = 1 / (h * h), c = this.compliance;
    this.solveRange(this.shearEnd, this.m, c[2] * ih2, flip);
    this.solveRange(this.structEnd, this.shearEnd, c[1] * ih2, flip);
    this.solveRange(0, this.structEnd, c[0] * ih2, flip);
    const r = this.rail;
    if (r) {
      const { pos, prev } = this, stick = 0.7 * h;
      for (let q = 0; q < r.ids.length; q++) {
        const k = r.ids[q], i = k * 3;
        pos[i + 1] = r.y; pos[i + 2] = r.z;
        if (!this.held[k] && Math.abs(pos[i] - prev[i]) < stick) pos[i] = prev[i];
        if (pos[i] < r.x0) pos[i] = r.x0; if (pos[i] > r.x1) pos[i] = r.x1;
      }
    }
  }

  solveRange(c0, c1, al, flip) {
    const { pos, w, held, on, ca, cb, rest, tether } = this;
    const step = flip ? 1 : -1;
    for (let c = flip ? c0 : c1 - 1; flip ? c < c1 : c >= c0; c += step) {
      if (!on[c]) continue;
      const a = ca[c], b = cb[c];
      const wa = held[a] ? 0 : w[a], wb = held[b] ? 0 : w[b];
      const ws = wa + wb;
      if (ws === 0) continue;
      const i = a * 3, j = b * 3;
      const dx = pos[i] - pos[j], dy = pos[i + 1] - pos[j + 1], dz = pos[i + 2] - pos[j + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const C = len - rest[c];
      if (tether[c] && C < 0) continue;
      const s = -C / (len * (ws + al));
      pos[i] += dx * s * wa; pos[i + 1] += dy * s * wa; pos[i + 2] += dz * s * wa;
      pos[j] -= dx * s * wb; pos[j + 1] -= dy * s * wb; pos[j + 2] -= dz * s * wb;
    }
  }

  collide(cols, floorY) {
    const { pos, prev, w, held, alive, n } = this;
    const th = this.thickness, mu = this.fabric.friction;
    const B = this.box, pad = 0.3;
    const act = [];
    for (const c of cols) if (c.bx1 + pad > B[0] && c.bx0 - pad < B[3] && c.by1 + pad > B[1] && c.by0 - pad < B[4] && c.bz1 + pad > B[2] && c.bz0 - pad < B[5]) act.push(c);
    const out = [0, 0, 0, 0];
    for (let k = 0; k < n; k++) {
      if (!alive[k] || held[k] || w[k] === 0) continue;
      const i = k * 3;
      let x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (y < floorY + th) {
        y = floorY + th;
        const f = 1 - mu * 1.4 < 0 ? 0 : 1 - mu * 1.4;
        x = prev[i] + (x - prev[i]) * f; z = prev[i + 2] + (z - prev[i + 2]) * f;
      }
      for (let q = 0; q < act.length; q++) {
        const c = act[q];
        if (x < c.bx0 - th || x > c.bx1 + th || y < c.by0 - th || y > c.by1 + th || z < c.bz0 - th || z > c.bz1 + th) continue;
        if (!pushOut(c, x, y, z, th, out)) continue;
        const nx = out[0], ny = out[1], nz = out[2], d = out[3];
        x += nx * d; y += ny * d; z += nz * d;
        const mx = x - prev[i], my = y - prev[i + 1], mz = z - prev[i + 2], dn = mx * nx + my * ny + mz * nz;
        x -= (mx - dn * nx) * mu; y -= (my - dn * ny) * mu; z -= (mz - dn * nz) * mu;
      }
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
  }

  buildNeighbors() {
    if (!this.selfCollide) return;
    const { pos, alive, n, neighbors } = this;
    const sp = this.thickness * 2.2, size = n * 2;
    const start = this.hStart || (this.hStart = new Int32Array(size + 1));
    const ent = this.hEnt || (this.hEnt = new Int32Array(n));
    start.fill(0);
    const hc = (xi, yi, zi) => Math.abs(Math.imul(xi, 92837111) ^ Math.imul(yi, 689287499) ^ Math.imul(zi, 283923481)) % size;
    for (let k = 0; k < n; k++) if (alive[k]) start[hc(Math.floor(pos[k * 3] / sp), Math.floor(pos[k * 3 + 1] / sp), Math.floor(pos[k * 3 + 2] / sp))]++;
    let s = 0;
    for (let i = 0; i < size; i++) { s += start[i]; start[i] = s; }
    start[size] = s;
    for (let k = 0; k < n; k++) if (alive[k]) ent[--start[hc(Math.floor(pos[k * 3] / sp), Math.floor(pos[k * 3 + 1] / sp), Math.floor(pos[k * 3 + 2] / sp))]] = k;
    neighbors.fill(-1);
    const r2 = sp * sp, cols = this.cols, sx = this.sx, sy = this.sy, minRest2 = (this.thickness * 2.5) ** 2;
    for (let k = 0; k < n; k++) {
      if (!alive[k]) continue;
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const xi = Math.floor(x / sp), yi = Math.floor(y / sp), zi = Math.floor(z / sp);
      const ki = k % cols, kj = (k / cols) | 0;
      let cnt = 0;
      for (let a = -1; a <= 1 && cnt < 8; a++) for (let b = -1; b <= 1 && cnt < 8; b++) for (let c = -1; c <= 1 && cnt < 8; c++) {
        const h = hc(xi + a, yi + b, zi + c);
        for (let e = start[h]; e < start[h + 1] && cnt < 8; e++) {
          const j = ent[e];
          if (j <= k) continue;
          const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const di = (j % cols - ki) * sx, dj = (((j / cols) | 0) - kj) * sy;
          if (di * di + dj * dj < minRest2) continue;
          neighbors[k * 8 + cnt++] = j;
        }
      }
    }
  }

  selfSolve() {
    if (!this.selfCollide) return;
    const { pos, w, held, neighbors, n } = this;
    const th = this.thickness * 2, th2 = th * th;
    for (let k = 0; k < n; k++) {
      for (let q = 0; q < 8; q++) {
        const j = neighbors[k * 8 + q];
        if (j < 0) break;
        const i3 = k * 3, j3 = j * 3;
        const dx = pos[j3] - pos[i3], dy = pos[j3 + 1] - pos[i3 + 1], dz = pos[j3 + 2] - pos[i3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > th2 || d2 < 1e-12) continue;
        const wa = held[k] ? 0 : w[k], wb = held[j] ? 0 : w[j], ws = wa + wb;
        if (!ws) continue;
        const d = Math.sqrt(d2), s = (th - d) / (d * ws);
        pos[i3] -= dx * s * wa; pos[i3 + 1] -= dy * s * wa; pos[i3 + 2] -= dz * s * wa;
        pos[j3] += dx * s * wb; pos[j3 + 1] += dy * s * wb; pos[j3 + 2] += dz * s * wb;
      }
    }
  }

  ballContact(balls) {
    if (!balls.length) return;
    const { pos, w, held, alive, n, box } = this;
    const th = this.thickness;
    for (const bl of balls) {
      const r = bl.r + th, p = bl.p;
      if (p[0] + r < box[0] || p[0] - r > box[3] || p[1] + r < box[1] || p[1] - r > box[4] || p[2] + r < box[2] || p[2] - r > box[5]) continue;
      const r2 = r * r;
      for (let k = 0; k < n; k++) {
        if (!alive[k]) continue;
        const i = k * 3;
        const dx = pos[i] - p[0], dy = pos[i + 1] - p[1], dz = pos[i + 2] - p[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2 || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), pen = r - d, nx = dx / d, ny = dy / d, nz = dz / d;
        const wp = held[k] ? 0 : w[k], ws = wp + bl.w;
        const sp = pen * wp / ws, sb = pen * bl.w / ws;
        pos[i] += nx * sp; pos[i + 1] += ny * sp; pos[i + 2] += nz * sp;
        p[0] -= nx * sb; p[1] -= ny * sb; p[2] -= nz * sb;
        bl.touch += pen;
      }
    }
  }

  post(h) {
    const { pos, prev, vel, w, held, alive, n } = this;
    const ih = 1 / h;
    for (let k = 0; k < n; k++) {
      if (!alive[k]) continue;
      const i = k * 3;
      if (w[k] === 0 && !held[k]) { vel[i] = vel[i + 1] = vel[i + 2] = 0; continue; }
      vel[i] = (pos[i] - prev[i]) * ih; vel[i + 1] = (pos[i + 1] - prev[i + 1]) * ih; vel[i + 2] = (pos[i + 2] - prev[i + 2]) * ih;
    }
    const r = this.rail;
    if (r) for (let q = 0; q < r.ids.length; q++) { const i = r.ids[q] * 3; vel[i + 1] = vel[i + 2] = 0; vel[i] *= 0.93; }
  }

  tear() {
    const { pos, on, ca, cb, rest, type } = this;
    const lim = this.fabric.tear;
    let torn = 0;
    for (let c = 0; c < this.shearEnd; c++) {
      if (!on[c]) continue;
      const i = ca[c] * 3, j = cb[c] * 3;
      const dx = pos[i] - pos[j], dy = pos[i + 1] - pos[j + 1], dz = pos[i + 2] - pos[j + 2];
      const l2 = dx * dx + dy * dy + dz * dz, L = rest[c] * (type[c] === SHEAR ? lim * 1.15 : lim);
      if (l2 > L * L) { on[c] = 0; torn++; }
    }
    if (torn) { this.topoDirty = true; this.events.tears += torn; }
  }

  computeStrain() {
    const { pos, on, ca, cb, rest, strain } = this;
    strain.fill(0);
    for (let c = 0; c < this.structEnd; c++) {
      if (!on[c]) continue;
      const a = ca[c], b = cb[c], i = a * 3, j = b * 3;
      const l = Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2]);
      const s = l / rest[c] - 1;
      if (s > strain[a]) strain[a] = s;
      if (s > strain[b]) strain[b] = s;
    }
  }

  updateBurn(dt) {
    const { burn, burning, alive, pos, adj, adjStart, ca, cb, on, type, n } = this;
    const f = this.fabric;
    let count = 0, cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < n; k++) {
      if (!burning[k] || !alive[k]) continue;
      count++; cx += pos[k * 3]; cy += pos[k * 3 + 1]; cz += pos[k * 3 + 2];
      burn[k] += dt * f.burnRate * (0.5 + Math.random());
      if (f.selfExtinguish && Math.random() < dt * f.selfExtinguish) { burning[k] = 0; continue; }
      if (burn[k] > 0.3) {
        for (let e = adjStart[k]; e < adjStart[k + 1]; e++) {
          const c = adj[e];
          if (type[c] === BEND || !on[c]) continue;
          const j = ca[c] === k ? cb[c] : ca[c];
          if (burning[j] || burn[j] >= 0.98 || !alive[j]) continue;
          const up = pos[j * 3 + 1] > pos[k * 3 + 1] + 0.004 ? 2.4 : 1;
          if (Math.random() < dt * f.spread * up) { burning[j] = 1; burn[j] = Math.max(burn[j], 0.05); }
        }
      }
      if (burn[k] >= 1) this.kill(k);
    }
    this.burnCount = count;
    if (count) { this.burnCenter = [cx / count, cy / count, cz / count]; }
    return count;
  }

  ignite(k) {
    if (!this.alive[k]) return;
    this.burning[k] = 1; this.burn[k] = Math.max(this.burn[k], 0.08);
    this.events.ignited++;
  }

  extinguish() { this.burning.fill(0); }

  cutSegment(sxy, ax, ay, bx, by) {
    const { on, ca, cb, alive } = this;
    let cut = 0;
    for (let c = 0; c < this.shearEnd; c++) {
      if (!on[c]) continue;
      const a = ca[c], b = cb[c];
      if (!alive[a] || !alive[b]) continue;
      const px = sxy[a * 3], py = sxy[a * 3 + 1], qx = sxy[b * 3], qy = sxy[b * 3 + 1];
      if (sxy[a * 3 + 2] < 0 || sxy[b * 3 + 2] < 0) continue;
      if (segX(ax, ay, bx, by, px, py, qx, qy)) { on[c] = 0; cut++; }
    }
    if (cut) { this.topoDirty = true; this.events.cuts += cut; }
    return cut;
  }

  kinetic() {
    const { vel, alive, n } = this;
    let e = 0, c = 0;
    for (let k = 0; k < n; k += 3) { if (!alive[k]) continue; const i = k * 3; e += vel[i] * vel[i] + vel[i + 1] * vel[i + 1] + vel[i + 2] * vel[i + 2]; c++; }
    return c ? e / c : 0;
  }
}

function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if ((d1 > 0) === (d2 > 0)) return false;
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return (d3 > 0) !== (d4 > 0);
}

export function pushOut(c, x, y, z, th, out) {
  if (c.type === 'sphere') {
    const dx = x - c.x, dy = y - c.y, dz = z - c.z, r = c.r + th, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r || d2 < 1e-12) return false;
    const d = Math.sqrt(d2);
    out[0] = dx / d; out[1] = dy / d; out[2] = dz / d; out[3] = r - d; return true;
  }
  if (c.type === 'capsule') {
    const abx = c.bx - c.ax, aby = c.by - c.ay, abz = c.bz - c.az;
    let t = ((x - c.ax) * abx + (y - c.ay) * aby + (z - c.az) * abz) / c.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = c.ax + abx * t, py = c.ay + aby * t, pz = c.az + abz * t;
    const dx = x - px, dy = y - py, dz = z - pz, r = c.r + th, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r || d2 < 1e-12) return false;
    const d = Math.sqrt(d2);
    out[0] = dx / d; out[1] = dy / d; out[2] = dz / d; out[3] = r - d; return true;
  }
  if (c.type === 'cylinder') {
    const dx = x - c.x, dz = z - c.z, r = c.r + th, d2 = dx * dx + dz * dz;
    if (d2 >= r * r || y < c.y0 - th || y > c.y1 + th) return false;
    const d = Math.sqrt(d2) || 1e-6;
    const side = r - d, top = c.y1 + th - y, bot = y - (c.y0 - th);
    if (top <= side && top <= bot) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = top; }
    else if (bot <= side) { out[0] = 0; out[1] = -1; out[2] = 0; out[3] = bot; }
    else { out[0] = dx / d; out[1] = 0; out[2] = dz / d; out[3] = side; }
    return true;
  }
  if (c.type === 'box') {
    const lx = x - c.x, ly = y - c.y, lz = z - c.z;
    const qx = c.hx + th - Math.abs(lx), qy = c.hy + th - Math.abs(ly), qz = c.hz + th - Math.abs(lz);
    if (qx <= 0 || qy <= 0 || qz <= 0) return false;
    out[0] = out[1] = out[2] = 0;
    if (qx < qy && qx < qz) { out[0] = Math.sign(lx) || 1; out[3] = qx; }
    else if (qy < qz) { out[1] = Math.sign(ly) || 1; out[3] = qy; }
    else { out[2] = Math.sign(lz) || 1; out[3] = qz; }
    return true;
  }
  return false;
}

export function collider(type, o) {
  const c = { type, ...o };
  if (type === 'sphere') { c.bx0 = c.x - c.r; c.bx1 = c.x + c.r; c.by0 = c.y - c.r; c.by1 = c.y + c.r; c.bz0 = c.z - c.r; c.bz1 = c.z + c.r; }
  if (type === 'capsule') {
    c.l2 = (c.bx - c.ax) ** 2 + (c.by - c.ay) ** 2 + (c.bz - c.az) ** 2 || 1e-6;
    c.bx0 = Math.min(c.ax, c.bx) - c.r; c.bx1 = Math.max(c.ax, c.bx) + c.r;
    c.by0 = Math.min(c.ay, c.by) - c.r; c.by1 = Math.max(c.ay, c.by) + c.r;
    c.bz0 = Math.min(c.az, c.bz) - c.r; c.bz1 = Math.max(c.az, c.bz) + c.r;
  }
  if (type === 'cylinder') { c.bx0 = c.x - c.r; c.bx1 = c.x + c.r; c.by0 = c.y0; c.by1 = c.y1; c.bz0 = c.z - c.r; c.bz1 = c.z + c.r; }
  if (type === 'box') { c.bx0 = c.x - c.hx; c.bx1 = c.x + c.hx; c.by0 = c.y - c.hy; c.by1 = c.y + c.hy; c.bz0 = c.z - c.hz; c.bz1 = c.z + c.hz; }
  return c;
}
