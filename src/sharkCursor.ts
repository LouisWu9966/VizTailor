// LouisTool 簽名游標：雙髻鯊（點陣字元風格）。
// 移植自 desktop-shark-cursor 技能的 DotMatrixSharkCursor 網頁原型（鯊魚造型、配色、
// 光柵化取自 ascii-sharks，MIT, stackedlol/ascii-sharks）。
// 全離線：純 canvas，不連網、不用 eval。吻端 = 游標熱點；點擊 = 以吻端為軸心轉 360° 甩尾，
// 沿途噴出簽名文字，之後化成小魚游走；靜止 2.5 秒後停止重畫（CPU ≈ 0）。

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
function smoothstep(e0: number, e1: number, x: number) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function angleDiff(a: number, b: number) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
function inTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// ── 造型與配色 ───────────────────────────────────────────────────────
const ACCENTS = ['#e0892c', '#e03a32', '#b44ae0', '#33c8cc', '#3cb54a', '#3150e8', '#d9c14a'];
const SKIN_RAMP = ':;t%SX8#@', FIN_GLYPHS = '%;tS:', RIDGE_GLYPHS = '@8%';
const EDGE_HEAVY = ':;', EDGE_LIGHT = ".',`";
const F_BODY = 1, F_EDGE = 2, F_FIN = 3, F_RIDGE = 4, F_EYE = 5;
const SUB = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
function classicHalfWidth(s: number) {
  if (s < 0.13) return 0.09 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.95);
  if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
  if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
  const k = (s - 0.84) / 0.16; return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}
// 只保留雙髻鯊（LouisTool 簽名款）
const SHAPE = {
  halfWidth: (s: number) => (s < 0.06 ? 0.045 : s < 0.3 ? 0.045 + 0.061 * smoothstep(0.06, 0.3, s) : classicHalfWidth(s) * 0.92),
  head: { span: 0.17, sweep: 0.035, depth: 0.09, notch: 0 },
  pectoral: [0.17, 0.4, 0.5, 0.22], falcate: true,
  pelvic: [0.56, 0.63, 0.67, 0.075], caudal: 0.11,
  dorsal: [0.28, 0.44], secondDorsal: [0.7, 0.74],
  gills: [0.16, 0.26], tint: [0.96, 0.98, 0.9],
};

// ── 設定：原版 220 長、5×8 格，這裡整體等比例縮成 70% ─────────────────
export const SHARK_SCALE = 0.7;
const S = SHARK_SCALE;
const L = 220 * S;
const CW = 5 * S, CH = 8 * S;     // 字元格
const LW = CW * 2;                // 簽名字塊寬（2 格）
const PAD = S;                    // 格與格之間的縫
const FONT = `600 ${(CH * 0.8).toFixed(2)}px Consolas, "Cascadia Mono", ui-monospace, Menlo, monospace`;
const FONT_CHIP = `700 ${(CH * 1.45).toFixed(2)}px Consolas, "Cascadia Mono", ui-monospace, monospace`;
const N = 20;                     // 脊骨節點
const LABEL = 'LouisTool';
const IDLE_FREEZE = 2.5;          // 靜止多久後停止重畫（秒）
const SPIN = 0.75;
const SIGN_END = 2.3;
const MAX_BEND = 0.14;

const STYLE_ID = 'vt-shark-css';
const CSS = `html.vt-shark, html.vt-shark * { cursor: none !important; }`;
const CSS_SHADOW = `* { cursor: none !important; }`;

type Hit = { flag: number; shade: number; s: number; v: number; dist: number };
type Cell = { c: number; r: number; key: number; flag: number; shade: number };
type Ring = { type: 'ring'; x: number; y: number; t: number; life: number; r1: number };
type Glyph = {
  type: 'glyph'; ch: string; i: number; sx: number; sy: number; vx: number; vy: number; tx: number; ty: number;
  t: number; rise: number; hold: number; swim: number; ang: number;
};
type Fx = Ring | Glyph;
type Pend = { text: string[]; n: number; x0: number; y0: number; next: number; big: boolean; tipX: number; tipY: number };

export type SharkCursor = {
  /** 開啟鯊魚游標；可帶目前滑鼠位置，鯊魚立刻出現在那裡 */
  enable(at?: { x: number; y: number }): void;
  /** 關閉並還原一般游標 */
  disable(): void;
  readonly active: boolean;
};

export function createSharkCursor(): SharkCursor {
  let on = false;
  let cv: HTMLCanvasElement | null = null;
  let g: CanvasRenderingContext2D | null = null;
  let W = 0, H = 0, dpr = 1;

  const nodes = new Float32Array(N * 2), spine = new Float32Array(N * 2), arc = new Float32Array(N);
  let arcTotal = 1, phase = 0, speed = 0, turn = 0, heading = Math.PI, ready = false;
  const mouse = { x: 0, y: 0 };
  let spinT = -1, spinDir = 1, spinTheta0 = 0;
  const hit: Hit = { flag: 0, shade: 0, s: 0, v: 0, dist: 0 };
  let finR = 0, finL = 0;
  const cells: Cell[] = [];
  const wake = new Map<number, number>();
  const fx: Fx[] = [];
  let pend: Pend | null = null;

  let running = false, rafId = 0, last = 0, lastActivity = 0;

  const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const snapX = (x: number) => Math.round(x / CW) * CW;
  const snapY = (y: number) => Math.round(y / CH) * CH;

  function resizeCanvas() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    kick();
  }

  function resetBody(x: number, y: number) {
    const seg = L / (N - 1);
    for (let k = 0; k < N; k++) { nodes[k * 2] = x + seg * k; nodes[k * 2 + 1] = y; }
    heading = Math.PI; turn = 0; speed = 0; ready = true;
  }

  // ── 身體 ──────────────────────────────────────────────────────────
  function stepSpin(dt: number) {
    spinT += dt; const p = spinT / SPIN;
    if (p >= 1) { spinT = -1; heading = spinTheta0; return false; }
    const seg = L / (N - 1);
    nodes[0] = mouse.x; nodes[1] = mouse.y;
    const th = spinTheta0 + spinDir * TAU * easeInOut(p);
    const curl = 1.9 * Math.sin(Math.PI * p);
    for (let k = 1; k < N; k++) {
      const a = th + Math.PI - spinDir * curl * Math.pow(k / (N - 1), 1.4);
      nodes[k * 2] = nodes[k * 2 - 2] + Math.cos(a) * seg; nodes[k * 2 + 1] = nodes[k * 2 - 1] + Math.sin(a) * seg;
    }
    heading = th; turn = spinDir * 12 * Math.sin(Math.PI * p);
    phase += dt * 14;
    emitFromTail(dt);
    return true;
  }

  function stepBody(dt: number) {
    if (spinT >= 0 && stepSpin(dt)) return;
    const seg = L / (N - 1);
    const ox = nodes[0], oy = nodes[1];
    nodes[0] = mouse.x; nodes[1] = mouse.y;
    const moved = Math.hypot(nodes[0] - ox, nodes[1] - oy);
    speed += (moved / Math.max(dt, 1e-3) - speed) * Math.min(1, dt * 6);
    let prev = 0;
    for (let k = 1; k < N; k++) {
      const px = nodes[(k - 1) * 2], py = nodes[(k - 1) * 2 + 1];
      let a = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
      if (k > 1) a = prev + clamp(angleDiff(prev, a), -MAX_BEND, MAX_BEND);
      nodes[k * 2] = px + Math.cos(a) * seg; nodes[k * 2 + 1] = py + Math.sin(a) * seg;
      if (k === 1) {
        const h = a + Math.PI;
        turn += (angleDiff(heading, h) / Math.max(dt, 1e-3) - turn) * Math.min(1, dt * 3);
        heading = h;
      }
      prev = a;
    }
    phase += dt * (2.2 + Math.min(speed, 900) / 70);
  }

  // ── 光柵化 ────────────────────────────────────────────────────────
  function sample(px: number, py: number) {
    let best = Infinity, bestS = 0, sign = 1, nx = 0, ny = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2], ay = spine[k * 2 + 1], sx = spine[k * 2 + 2] - ax, sy = spine[k * 2 + 3] - ay;
      const len2 = sx * sx + sy * sy || 1, u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const d2 = (px - ax - sx * u) ** 2 + (py - ay - sy * u) ** 2;
      if (d2 < best) {
        best = d2; const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / arcTotal; sign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        nx = (-sy / len) * sign; ny = (sx / len) * sign;
      }
    }
    const a = Math.sqrt(best), s = bestS, u = s * L, w = SHAPE.halfWidth(s) * L;
    hit.dist = a; hit.s = s; hit.v = a * sign;
    const head = SHAPE.head;
    if (u < L * (head.sweep + head.depth + head.notch)) {
      const span = L * head.span, r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      const depth = L * head.depth * (1 - 0.2 * r ** 4);
      if (r <= 1 && u >= front && u <= front + depth) {
        hit.flag = r > 0.84 ? F_EYE : F_BODY;
        hit.shade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        return true;
      }
    }
    if (a <= w) {
      const across = a / (w || 1), facing = (nx * -0.6 + ny * -0.8) * across;
      let shade = 0.58 - across * across * 0.42 + facing * 0.26, flag = F_BODY;
      if (s > SHAPE.dorsal[0] && s < SHAPE.dorsal[1] && across < 0.3) { flag = F_RIDGE; shade = 1; }
      else if (s > SHAPE.secondDorsal[0] && s < SHAPE.secondDorsal[1] && across < 0.4) shade = Math.max(shade, 0.82);
      else if (s > SHAPE.gills[0] && s < SHAPE.gills[1] && across > 0.58) {
        if (Math.floor(((s - SHAPE.gills[0]) / (SHAPE.gills[1] - SHAPE.gills[0])) * 5) % 2 === 0) shade *= 0.45;
      } else if (s < 0.05) shade = Math.max(shade, 0.7);
      hit.flag = flag; hit.shade = shade; return true;
    }
    const tip = sign > 0 ? finR : finL, [p0, p1, p2] = SHAPE.pectoral;
    if (inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
        !(SHAPE.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))) {
      hit.flag = F_FIN; hit.shade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1)); return true;
    }
    const [v0, v1, v2, vr] = SHAPE.pelvic;
    if (inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) ||
        inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * SHAPE.caudal)) {
      hit.flag = F_FIN; hit.shade = 0.36; return true;
    }
    return false;
  }

  function rasterize(t: number) {
    cells.length = 0;
    const swim = spinT >= 0 ? 1.5 : clamp(speed / 300, 0.45, 1.0);
    for (let k = 0; k < N; k++) {
      const s = k / (N - 1), a = Math.max(0, k - 1), b = Math.min(N - 1, k + 1);
      let tx = nodes[a * 2] - nodes[b * 2], ty = nodes[a * 2 + 1] - nodes[b * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim, off = amp * Math.sin(phase - s * 5.2);
      spine[k * 2] = nodes[k * 2] - ty * off; spine[k * 2 + 1] = nodes[k * 2 + 1] + tx * off;
    }
    arc[0] = 0;
    for (let k = 1; k < N; k++) arc[k] = arc[k - 1] + Math.hypot(spine[k * 2] - spine[k * 2 - 2], spine[k * 2 + 1] - spine[k * 2 - 1]);
    arcTotal = arc[N - 1] || 1;
    const bank = clamp(turn * 0.12, -0.35, 0.35), flex = 1 + 0.06 * Math.sin(phase * 0.5), reach = SHAPE.pectoral[3];
    finR = L * reach * flex * (1 - bank); finL = L * reach * flex * (1 + bank);

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < N; k++) {
      x0 = Math.min(x0, spine[k * 2]); x1 = Math.max(x1, spine[k * 2]);
      y0 = Math.min(y0, spine[k * 2 + 1]); y1 = Math.max(y1, spine[k * 2 + 1]);
    }
    const R = L * 0.36;
    const c0 = Math.floor((x0 - R) / CW), c1 = Math.floor((x1 + R) / CW), r0 = Math.floor((y0 - R) / CH), r1 = Math.floor((y1 + R) / CH);
    const skip = R + Math.hypot(CW, CH);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = c * CW, y = r * CH, center = sample(x + CW / 2, y + CH / 2);
      if (!center && hit.dist > skip) continue;
      const flag = hit.flag, shade = hit.shade, s = hit.s, v = hit.v;
      let hits = center ? 1 : 0;
      for (let k = 0; k < SUB.length; k += 2) if (sample(x + SUB[k] * CW, y + SUB[k + 1] * CH)) hits++;
      if (!hits) continue;
      const cov = hits / 5, key = (hash3(Math.round(s * 52), Math.round(v / (CW * 0.9)), 1) * 4294967295) >>> 0;
      if (center && cov >= 0.6) cells.push({ c, r, key, flag, shade: clamp(shade + (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06, 0, 1) });
      else cells.push({ c, r, key, flag: F_EDGE, shade: cov });
    }
  }

  function drawShark(t: number) {
    if (!g) return;
    const [tr, tg, tb] = SHAPE.tint;
    for (const k of cells) {
      const x = k.c * CW, y = k.r * CH, key = k.key, shade = k.shade;
      const roll = hash3(key, Math.floor(t * 2.4 + (key % 997) / 97), 7);
      if (k.flag === F_EDGE) {
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT, lv = 70 + shade * 80;
        g.fillStyle = roll < 0.07 ? ACCENTS[key % 7] : `rgb(${(lv * tr) | 0},${(lv * tg) | 0},${Math.min(255, lv * tb + 6) | 0})`;
        g.fillText(set[(key >>> 8) % set.length], x + CW / 2, y + CH / 2 + S);
        continue;
      }
      let level: number, glyph: string;
      if (k.flag === F_RIDGE) { level = 226; glyph = RIDGE_GLYPHS[(key >>> 8) % 3]; }
      else if (k.flag === F_EYE) { level = 12; glyph = 'o'; }
      else if (k.flag === F_FIN) { level = 40 + shade * 120; glyph = FIN_GLYPHS[(key >>> 8) % 5]; }
      else { level = 46 + shade * 160; glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + ((key >>> 4) % 3) - 1, 0, 8)]; }
      g.fillStyle = `rgb(${Math.min(255, level * tr) | 0},${Math.min(255, level * tg) | 0},${Math.min(255, level * tb + 4) | 0})`;
      g.fillRect(x + PAD, y + PAD, CW - PAD, CH - PAD);
      g.fillStyle = k.flag === F_EYE ? '#9aa0ad' : roll < 0.09 ? ACCENTS[key % 7] : roll < 0.13 ? '#ffffff' : shade > 0.55 ? '#0e0f13' : '#1b1d24';
      g.fillText(glyph, x + CW / 2, y + CH / 2 + S);
    }
  }

  // ── 尾跡 ──────────────────────────────────────────────────────────
  function addWake() {
    for (let k = 6; k < N; k += 3) {
      const c = Math.floor(spine[k * 2] / CW), r = Math.floor(spine[k * 2 + 1] / CH), id = r * 10000 + c;
      wake.set(id, Math.min(1, (wake.get(id) || 0) + 0.25));
    }
  }
  function drawWake(dt: number) {
    if (!g) return;
    const size = Math.max(1.5, CW * 0.19) + S;
    for (const [id, e] of wake) {
      const ne = e - dt * 1.1;
      if (ne <= 0) { wake.delete(id); continue; }
      wake.set(id, ne);
      const r = Math.floor(id / 10000), c = id - r * 10000;
      g.fillStyle = `rgba(110,230,255,${(ne * 0.8).toFixed(2)})`;
      g.fillRect(c * CW + CW * 0.66 - size / 2, r * CH + CH * 0.64 - size / 2, size, size);
    }
  }

  // ── 點擊特效 ──────────────────────────────────────────────────────
  function burst(x: number, y: number) {
    if (!ready) return;
    spinT = 0; spinDir = turn >= 0 ? 1 : -1; spinTheta0 = heading;
    const text = [...LABEL], n = text.length, wPx = n * LW;
    const tx = x - Math.cos(heading) * L * 0.85, ty = y - Math.sin(heading) * L * 0.85;
    const cx = clamp(tx, wPx / 2 + 8, W - wPx / 2 - 8), cy = clamp(ty - CH * 3, CH * 2, H - CH * 3);
    pend = { text, n, x0: snapX(cx - wPx / 2), y0: snapY(cy), next: 0, big: false, tipX: NaN, tipY: NaN };
  }
  function emitFromTail(dt: number) {
    if (!pend) return;
    const tipX = spine[(N - 1) * 2] || nodes[(N - 1) * 2], tipY = spine[(N - 1) * 2 + 1] || nodes[(N - 1) * 2 + 1];
    let vx = 0, vy = 0;
    if (!isNaN(pend.tipX)) { vx = (tipX - pend.tipX) / Math.max(dt, 1e-3); vy = (tipY - pend.tipY) / Math.max(dt, 1e-3); }
    pend.tipX = tipX; pend.tipY = tipY;
    const vm = Math.hypot(vx, vy), cap = 1300 * S;
    if (vm > cap) { vx *= cap / vm; vy *= cap / vm; }
    const p = spinT / SPIN;
    if (!pend.big && p >= 0.5) { pend.big = true; fx.push({ type: 'ring', x: tipX, y: tipY, t: 0, life: 1.0, r1: L * 0.5 }); }
    while (pend.next < pend.n && p >= 0.2 + (0.62 * pend.next) / Math.max(1, pend.n - 1)) {
      const i = pend.next++;
      fx.push({ type: 'ring', x: tipX, y: tipY, t: 0, life: 0.55, r1: L * 0.17 });
      fx.push({
        type: 'glyph', ch: pend.text[i], i, sx: tipX, sy: tipY, vx, vy, tx: pend.x0 + i * LW, ty: pend.y0,
        t: 0, rise: 0.12, hold: Math.max(0.4, SIGN_END - spinT - 0.12), swim: 0.8, ang: Math.atan2(vy, vx),
      });
    }
    if (pend.next >= pend.n) pend = null;
  }
  function springPos(f: Glyph, T: number): [number, number] {
    const w = 8, e = Math.exp(-w * T);
    const ax = f.sx - f.tx, ay = f.sy - f.ty;
    return [f.tx + (ax + (f.vx + w * ax) * T) * e, f.ty + (ay + (f.vy + w * ay) * T) * e];
  }
  function chip(f: Glyph, cx: number, cy: number, alpha: number, t: number) {
    if (!g) return;
    g.globalAlpha = clamp(alpha, 0, 1);
    const roll = hash3(f.i, Math.floor(t * 5 + f.i), 3);
    g.fillStyle = ACCENTS[(f.i + Math.floor(t * 3)) % 7];
    g.fillRect(cx, cy - CH * 0.5, LW - PAD, CH * 2 - PAD);
    g.fillStyle = roll < 0.12 ? '#ffffff' : '#0e0f13';
    g.font = FONT_CHIP;
    g.fillText(f.ch, cx + LW / 2 - 0.5, cy + CH / 2 + S);
    g.font = FONT; g.globalAlpha = 1;
  }
  function drawFx(dt: number, t: number) {
    if (!g) return;
    const dot = Math.max(1.5, CW * 0.19) + S;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      if (f.t < 0) continue;
      if (f.type === 'ring') {
        const p = f.t / f.life;
        if (p >= 1) { fx.splice(i, 1); continue; }
        const rad = f.r1 * (1 - Math.pow(1 - p, 3)), a = (1 - p) * 0.9;
        g.fillStyle = `rgba(110,230,255,${a.toFixed(2)})`;
        const steps = Math.max(12, Math.round(rad * 0.6));
        const seen = new Set<number>();
        for (let k = 0; k < steps; k++) {
          const th = (k / steps) * TAU, c = Math.round((f.x + Math.cos(th) * rad) / CW), r = Math.round((f.y + Math.sin(th) * rad * 0.8) / CH), id = r * 10000 + c;
          if (seen.has(id)) continue;
          seen.add(id);
          g.fillRect(c * CW + CW * 0.5 - dot / 2, r * CH + CH * 0.6 - dot / 2, dot, dot);
        }
      } else {
        const T = f.t, end = f.rise + f.hold + f.swim;
        if (T >= end) { fx.splice(i, 1); continue; }
        if (T < f.rise + f.hold) {
          const [x, y] = springPos(f, T);
          if (T < f.rise) {
            g.fillStyle = 'rgba(110,230,255,0.95)';
            g.fillText('.oO'[Math.min(2, Math.floor((T / f.rise) * 3))], snapX(x) + LW / 2, snapY(y) + CH / 2 + S);
          } else {
            const bob = Math.sin(T * 7 + f.i * 0.8) * 2 * S * smoothstep(0.6, 1.0, T);
            chip(f, snapX(x), snapY(y + bob), Math.min(1, (T - f.rise) / 0.08), t);
          }
        } else {
          const p = (T - f.rise - f.hold) / f.swim, d = p * p * 90 * S;
          const x = f.tx + Math.cos(f.ang) * d, y = f.ty + Math.sin(f.ang) * d * 0.6;
          if (p < 0.15) chip(f, snapX(x), snapY(y), 1 - p, t);
          else {
            g.globalAlpha = 1 - p; g.fillStyle = 'rgba(190,212,255,0.9)';
            g.fillText('-', snapX(x) + CW / 2, snapY(y) + CH / 2 + S); g.globalAlpha = 1;
          }
        }
      }
    }
  }

  // ── 主迴圈：沒事就停，不吃 CPU ───────────────────────────────────
  function frame(now: number) {
    if (!on || !g) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (ready) { stepBody(dt); rasterize(t); if (speed > 30 * S) addWake(); drawWake(dt); drawShark(t); }
    drawFx(dt, t);
    const idle = now - lastActivity > IDLE_FREEZE * 1000 && fx.length === 0 && !pend && wake.size === 0 && spinT < 0;
    if (idle) { running = false; return; }   // 畫面凍結在最後一幀
    rafId = requestAnimationFrame(frame);
  }
  function kick() {
    lastActivity = performance.now();
    if (!on || running) return;
    running = true; last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  // ── 事件 ──────────────────────────────────────────────────────────
  function onMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (cv) cv.style.visibility = 'visible';
    if (!ready) resetBody(e.clientX, e.clientY);
    kick();
  }
  function onDown(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    if (e.composedPath().some((n) => n instanceof HTMLElement && n.dataset.sharkIgnore !== undefined)) return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!ready) resetBody(e.clientX, e.clientY);
    burst(e.clientX, e.clientY);
    kick();
  }
  function onLeave() { if (cv) cv.style.visibility = 'hidden'; }

  // ── 隱藏系統游標（含 Graphic Walker 的 shadow DOM） ──────────────
  const patched = new Map<ShadowRoot, CSSStyleSheet | HTMLStyleElement>();
  let observer: MutationObserver | null = null;
  let scanQueued = false;
  function patchRoot(sr: ShadowRoot) {
    if (patched.has(sr)) return;
    try {
      if ('adoptedStyleSheets' in sr && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS_SHADOW);
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
        patched.set(sr, sheet);
      } else {
        const el = document.createElement('style'); el.textContent = CSS_SHADOW; sr.appendChild(el);
        patched.set(sr, el);
      }
    } catch { return; }
    observer?.observe(sr, { childList: true, subtree: true });
    scan(sr);
  }
  function scan(root: ParentNode) {
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) patchRoot(el.shadowRoot); });
  }
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; if (on) scan(document); });
  }
  function unpatchAll() {
    for (const [sr, s] of patched) {
      try {
        if (s instanceof CSSStyleSheet) sr.adoptedStyleSheets = sr.adoptedStyleSheets.filter((x) => x !== s);
        else s.remove();
      } catch { /* ignore */ }
    }
    patched.clear();
  }

  return {
    get active() { return on; },
    enable(at) {
      if (on) return;
      // 系統設定「減少動態效果」時不啟用，保留一般游標
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      on = true;
      cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;visibility:hidden';
      document.body.appendChild(cv);
      g = cv.getContext('2d');
      if (!document.getElementById(STYLE_ID)) {
        const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
      }
      document.documentElement.classList.add('vt-shark');
      observer = new MutationObserver(queueScan);
      observer.observe(document.body, { childList: true, subtree: true });
      scan(document);
      ready = false; spinT = -1; pend = null; fx.length = 0; wake.clear();
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
      document.documentElement.addEventListener('mouseleave', onLeave);
      if (at) { mouse.x = at.x; mouse.y = at.y; resetBody(at.x, at.y); cv.style.visibility = 'visible'; }
      kick();
    },
    disable() {
      if (!on) return;
      on = false; running = false; cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown, { capture: true });
      document.documentElement.removeEventListener('mouseleave', onLeave);
      observer?.disconnect(); observer = null;
      document.documentElement.classList.remove('vt-shark');
      unpatchAll();
      cv?.remove(); cv = null; g = null;
    },
  };
}
