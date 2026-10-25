// Fabrics textures: procedural print patterns on canvas, weave normal maps as data textures, and dye layers that bleed.
import * as THREE from 'three';

export const COLORS = [
  ['Ivory', '#ECE4D4'], ['Sand', '#CDB592'], ['Blush', '#D7A39A'], ['Terracotta', '#B5603F'],
  ['Rust', '#93391F'], ['Burgundy', '#651C28'], ['Mustard', '#C69526'], ['Sage', '#8C9B7C'],
  ['Forest', '#2D4838'], ['Teal', '#29666B'], ['Indigo', '#283863'], ['Charcoal', '#2C2B29'],
];

export const DYES = [
  ['Indigo', '#3B55A8'], ['Madder', '#C2433A'], ['Weld', '#E2B92E'], ['Woad', '#4FA0B5'],
  ['Walnut', '#6E4A2F'], ['Cochineal', '#B23A78'], ['Ink', '#1E1D24'],
];

export const PATTERNS = [
  { id: 'solid', name: 'Solid' }, { id: 'stripes', name: 'Stripes' }, { id: 'gingham', name: 'Gingham' },
  { id: 'tartan', name: 'Tartan' }, { id: 'houndstooth', name: 'Houndstooth' }, { id: 'dots', name: 'Dots' },
  { id: 'damask', name: 'Damask' }, { id: 'persian', name: 'Persian' }, { id: 'shibori', name: 'Shibori' },
];

const IVORY = '#F2ECE0';
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return css([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); };
const lum = h => { const c = rgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };

function palette(base) {
  const light = lum(base) > 0.72 ? '#2C2B29' : IVORY;
  const c = rgb(base);
  const warm = c[0] > c[2];
  return {
    base, light,
    dark: mix(base, '#120F0D', 0.5),
    soft: mix(base, light, 0.22),
    accent: lum(base) < 0.42 ? '#C69526' : '#283863',
    partner: warm ? '#24315C' : '#8F2E1E',
    gold: '#C9A04A',
  };
}

function rand(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; }

const DRAW = {
  solid(ctx, W, H, p) { ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H); },

  stripes(ctx, W, H, p, s) {
    const P = 14 * s;
    ctx.fillStyle = p.light; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W + P; x += P) {
      ctx.fillStyle = p.base; ctx.fillRect(x, 0, P * 0.5, H);
      ctx.fillStyle = p.dark; ctx.fillRect(x + P * 0.5 + P * 0.11, 0, P * 0.035, H);
      ctx.fillRect(x + P * 0.5 + P * 0.355, 0, P * 0.035, H);
    }
  },

  gingham(ctx, W, H, p, s) {
    const P = 5 * s;
    ctx.fillStyle = p.light; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.55; ctx.fillStyle = p.base;
    for (let x = 0; x < W + P; x += P) ctx.fillRect(x, 0, P / 2, H);
    for (let y = 0; y < H + P; y += P) ctx.fillRect(0, y, W, P / 2);
    ctx.globalAlpha = 1;
  },

  tartan(ctx, W, H, p, s) {
    const sett = [[p.base, 9], [p.dark, 5], [p.accent, 0.7], [p.dark, 5], [p.base, 9], [p.light, 0.6], [p.partner, 3.4], [p.light, 0.6]];
    const P = sett.reduce((a, b) => a + b[1], 0) * s;
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    for (const pass of [0, 1]) {
      ctx.globalAlpha = pass ? 0.5 : 1;
      for (let o = 0; o < (pass ? H : W) + P; o += P) {
        let q = o;
        for (const [c, w] of sett) {
          ctx.fillStyle = c;
          if (pass) ctx.fillRect(0, q, W, w * s); else ctx.fillRect(q, 0, w * s, H);
          q += w * s;
        }
      }
    }
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.25 * s;
    for (let d = -H; d < W; d += 0.7 * s) { ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },

  houndstooth(ctx, W, H, p, s) {
    const T = ['11110001', '11110011', '11110111', '11111110', '00010000', '00110000', '01110000', '11100000'];
    const P = 4 * s, u = P / 8;
    ctx.fillStyle = p.light; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.base;
    for (let y = 0; y < H + P; y += P) for (let x = 0; x < W + P; x += P)
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (T[r][c] === '1') ctx.fillRect(x + c * u - 0.02, y + r * u - 0.02, u + 0.04, u + 0.04);
  },

  dots(ctx, W, H, p, s) {
    const P = 8 * s;
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.light;
    let row = 0;
    for (let y = 0; y < H + P; y += P * 0.5, row++) for (let x = (row % 2) * P * 0.5; x < W + P; x += P) {
      ctx.beginPath(); ctx.arc(x, y, P * 0.13, 0, Math.PI * 2); ctx.fill();
    }
  },

  damask(ctx, W, H, p, s) {
    const P = 26 * s;
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = mix(p.base, lum(p.base) > 0.6 ? '#000000' : '#FFF6E6', 0.2);
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = P * 0.012;
    let row = 0;
    for (let y = 0; y < H + P; y += P * 0.5, row++) for (let x = (row % 2) * P * 0.5; x < W + P; x += P) motif(ctx, x, y, P * 0.42);
  },

  persian(ctx, W, H, p) {
    const m = Math.min(W, H);
    const b1 = m * 0.035, b2 = m * 0.11, b3 = m * 0.025;
    ctx.fillStyle = p.light; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.partner; ctx.fillRect(b1, b1, W - 2 * b1, H - 2 * b1);
    const r = rand(7);
    ctx.fillStyle = p.gold;
    const step = b2 * 0.55;
    for (let x = b1 + step / 2; x < W - b1; x += step) for (const y of [b1 + b2 / 2, H - b1 - b2 / 2]) rosette(ctx, x, y, b2 * 0.22, p);
    for (let y = b1 + b2 + step / 2; y < H - b1 - b2; y += step) for (const x of [b1 + b2 / 2, W - b1 - b2 / 2]) rosette(ctx, x, y, b2 * 0.22, p);
    const fx = b1 + b2, fy = b1 + b2;
    ctx.fillStyle = p.light; ctx.fillRect(fx, fy, W - 2 * fx, H - 2 * fy);
    const gx = fx + b3, gy = fy + b3, gw = W - 2 * gx, gh = H - 2 * gy;
    ctx.fillStyle = p.base; ctx.fillRect(gx, gy, gw, gh);
    ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
    const L = m * 0.09;
    ctx.globalAlpha = 0.9;
    for (let y = gy; y < gy + gh + L; y += L) for (let x = gx; x < gx + gw + L; x += L) {
      ctx.fillStyle = mix(p.base, '#120F0D', 0.35);
      diamond(ctx, x, y, L * 0.28, L * 0.28);
      ctx.fillStyle = r() > 0.5 ? p.gold : p.light;
      ctx.beginPath(); ctx.arc(x + L / 2, y + L / 2, L * 0.07, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const cx = W / 2, cy = H / 2;
    const layers = [[p.light, 0.42], [p.partner, 0.38], [p.gold, 0.3], [p.base, 0.26], [p.partner, 0.18], [p.light, 0.1], [p.gold, 0.05]];
    for (const [c, k] of layers) {
      ctx.fillStyle = c;
      ctx.beginPath();
      const rx = gw * k * 0.62, ry = gh * k;
      for (let a = 0; a <= 64; a++) {
        const t = a / 64 * Math.PI * 2, lobe = 1 + 0.12 * Math.cos(t * 8);
        const px = cx + Math.cos(t) * rx * lobe, py = cy + Math.sin(t) * ry * lobe;
        a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.fill();
    }
    ctx.fillStyle = p.partner;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.beginPath();
      const ox = sx > 0 ? gx : gx + gw, oy = sy > 0 ? gy : gy + gh;
      ctx.moveTo(ox, oy); ctx.lineTo(ox + sx * gw * 0.22, oy); ctx.quadraticCurveTo(ox + sx * gw * 0.1, oy + sy * gh * 0.1, ox, oy + sy * gh * 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },

  shibori(ctx, W, H, p, s) {
    const P = 18 * s;
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const r = rand(11);
    for (let y = 0; y < H + P; y += P) for (let x = 0; x < W + P; x += P) {
      const cx = x + P / 2 + (r() - 0.5) * P * 0.08, cy = y + P / 2 + (r() - 0.5) * P * 0.08;
      for (let k = 0; k < 4; k++) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, P * (0.46 - k * 0.09));
        g.addColorStop(0, 'rgba(242,236,224,0.0)');
        g.addColorStop(0.55, 'rgba(242,236,224,0.55)');
        g.addColorStop(0.75, 'rgba(242,236,224,0.25)');
        g.addColorStop(1, 'rgba(242,236,224,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, P * (0.46 - k * 0.09), 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(242,236,224,0.35)'; ctx.lineWidth = P * 0.02;
      for (let k = 0; k < 6; k++) {
        const a = r() * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * P * 0.1, cy + Math.sin(a) * P * 0.1); ctx.lineTo(cx + Math.cos(a) * P * 0.45, cy + Math.sin(a) * P * 0.45); ctx.stroke();
      }
    }
  },
};

function motif(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y);
  for (const m of [1, -1]) {
    ctx.save(); ctx.scale(m, 1);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.35, -s * 0.72, s * 0.85, -s * 0.6, s * 0.66, -s * 0.12);
    ctx.bezierCurveTo(s * 0.55, s * 0.18, s * 0.16, s * 0.1, s * 0.24, -s * 0.18);
    ctx.bezierCurveTo(s * 0.32, -s * 0.4, s * 0.1, -s * 0.52, 0, -s * 0.36);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, s * 0.12);
    ctx.bezierCurveTo(s * 0.5, s * 0.16, s * 0.74, s * 0.6, s * 0.3, s);
    ctx.bezierCurveTo(s * 0.22, s * 0.7, s * 0.12, s * 0.5, 0, s * 0.56);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.7, s * 0.3, s * 0.15, -1.2, 3.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.55, s * 0.06, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, -s * 0.06, s * 0.09, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function diamond(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
}

function rosette(ctx, x, y, r, p) {
  ctx.fillStyle = p.gold;
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.22, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = p.light; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.fill();
}

let grain = null;
function grainTile() {
  if (grain) return grain;
  grain = document.createElement('canvas'); grain.width = grain.height = 128;
  const g = grain.getContext('2d'), d = g.createImageData(128, 128), r = rand(3);
  for (let i = 0; i < d.data.length; i += 4) { const v = 110 + r() * 60; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return grain;
}

export function drawPattern(canvas, id, color, scale, widthM, heightM) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width, W = widthM * 100, H = heightM * 100;
  ctx.save();
  ctx.setTransform(S / W, 0, 0, canvas.height / H, 0, 0);
  DRAW[id](ctx, W, H, palette(color), scale);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.18;
  const gt = grainTile();
  for (let y = 0; y < canvas.height; y += 128) for (let x = 0; x < S; x += 128) ctx.drawImage(gt, x, y);
  ctx.restore();
}

export function patternThumb(id, color, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const span = id === 'persian' ? 1.4 : 0.42;
  drawPattern(c, id, color, id === 'persian' ? 1 : 0.8, span, span);
  return c;
}

export class Skin {
  constructor(size, widthM, heightM) {
    this.W = widthM; this.H = heightM; this.size = size;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
    this.pattern = mk(); this.dye = mk(); this.comp = mk();
    this.dctx = this.dye.getContext('2d');
    this.cctx = this.comp.getContext('2d');
    this.wash();
    this.texture = new THREE.CanvasTexture(this.comp);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.drops = [];
    this.dirty = true;
  }
  setPattern(id, color, scale) { drawPattern(this.pattern, id, color, scale, this.W, this.H); this.dirty = true; }
  wash() { this.dctx.fillStyle = '#fff'; this.dctx.fillRect(0, 0, this.size, this.size); this.drops = []; this.dirty = true; }
  drop(u, v, hex, radiusM) {
    const r = rand((Math.random() * 1e9) | 0);
    this.drops.push({ x: u * this.W, y: (1 - v) * this.H, R: radiusM, t: 0, c: rgb(hex), k: [r() * 6, r() * 6, r() * 6, 0.12 + r() * 0.1, 0.06 + r() * 0.06] });
  }
  blob(d, rad, alpha, stroke) {
    const g = this.dctx;
    g.save();
    g.setTransform(this.size / this.W, 0, 0, this.size / this.H, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.beginPath();
    for (let a = 0; a <= 48; a++) {
      const t = a / 48 * Math.PI * 2;
      const rr = rad * (1 + d.k[3] * Math.sin(3 * t + d.k[0]) + d.k[4] * Math.sin(7 * t + d.k[1]) + 0.04 * Math.sin(13 * t + d.k[2]));
      const x = d.x + Math.cos(t) * rr, y = d.y + Math.sin(t) * rr;
      a ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    const c = d.c;
    if (stroke) { g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`; g.lineWidth = rad * 0.06; g.stroke(); }
    else { g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`; g.fill(); }
    g.restore();
  }
  update(dt) {
    if (this.drops.length) {
      for (const d of this.drops) {
        const t0 = d.t; d.t = Math.min(1, d.t + dt / 1.3);
        const e = 1 - Math.pow(1 - d.t, 3);
        this.blob(d, d.R * e, 0.07 * (1 - t0 * 0.6), false);
        if (d.t >= 1) this.blob(d, d.R, 0.35, true);
      }
      this.drops = this.drops.filter(d => d.t < 1);
      this.dirty = true;
    }
    if (!this.dirty) return false;
    const c = this.cctx;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.pattern, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.drawImage(this.dye, 0, 0);
    c.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
    this.dirty = false;
    return true;
  }
  dispose() { this.texture.dispose(); }
}

const weaveCache = {};
export function weaveTexture(kind) {
  if (weaveCache[kind]) return weaveCache[kind];
  const N = 128, h = new Float32Array(N * N), r = rand(kind.length * 97 + 5);
  const T = 8;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = x / N * T, gy = y / N * T, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const pw = Math.sin(Math.PI * fx), pf = Math.sin(Math.PI * fy);
    let v;
    if (kind === 'knit') {
      const kx = x / N * 4, ky = y / N * 4, cx = kx - Math.floor(kx) - 0.5, cy = ky - Math.floor(ky) - 0.5;
      const lobe = (dx) => { const a = 0.6, ux = (cx - dx) * Math.cos(a * Math.sign(dx)) - cy * Math.sin(a * Math.sign(dx)), uy = (cx - dx) * Math.sin(a * Math.sign(dx)) + cy * Math.cos(a * Math.sign(dx)); return Math.max(0, 1 - (ux * ux) / 0.03 - (uy * uy) / 0.2); };
      v = Math.sqrt(Math.max(lobe(-0.2), lobe(0.2)));
    } else if (kind === 'pile') {
      v = 0.5 + (r() - 0.5) * 0.5;
    } else {
      let over;
      if (kind === 'twill') over = ((ix - iy) % 4 + 4) % 4 !== 0;
      else if (kind === 'satin') over = ((ix * 2 + iy) % 5) !== 0;
      else over = (ix + iy) % 2 === 0;
      const warp = pw * (over ? 1 : 0.5) * (0.85 + 0.15 * Math.cos(Math.PI * 2 * fy));
      const weft = pf * (over ? 0.5 : 1) * (0.85 + 0.15 * Math.cos(Math.PI * 2 * fx));
      v = Math.max(warp, weft);
      if (kind === 'plain') v *= 0.9 + 0.2 * Math.sin(gy * 0.9 + Math.sin(gx * 0.4) * 2);
    }
    h[y * N + x] = v;
  }
  const d = new Uint8Array(N * N * 4), k = kind === 'pile' ? 1.2 : 2.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[i + 3] = 255 * (0.35 + 0.65 * h[y * N + x]);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.needsUpdate = true;
  return (weaveCache[kind] = t);
}

export function yarnTexture(hex) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), r = rand(parseInt(hex.slice(1), 16));
  g.fillStyle = hex; g.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 140; k++) {
    const y0 = r() * 128, a = (r() - 0.5) * 1.2, f = 1 + r() * 2;
    g.strokeStyle = r() > 0.5 ? mix(hex, '#000000', 0.28) : mix(hex, '#ffffff', 0.18);
    g.lineWidth = 1 + r() * 1.5; g.globalAlpha = 0.55;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) { const y = y0 + Math.sin(x / 256 * Math.PI * 2 * f + a * 6) * 18 + x * a * 0.2; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
