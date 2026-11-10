import type { GeoFC } from './data';
import { simplifyFC } from './simplify';

// graphic-walker's point map (Leaflet) asks OpenStreetMap for picture tiles, which is impossible
// offline (and blocked by our CSP). Instead we patch Leaflet's TileLayer so that tiles are painted
// onto a <canvas> from the bundled Natural Earth countries: ocean, land, borders and country names.
// graphic-walker bundles its own Leaflet and exposes it as window.L, so the patch reaches it.

const SENTINEL = 'viztailor-offline://';
const OCEAN = '#dbe7f2';
const LAND = '#f8f6f0';
const BORDER = '#a8b3bf';
const LABEL = '#5d6b79';

type Pt = [number, number];
type Poly = { rings: Pt[][]; bb: [number, number, number, number] };
type Label = { text: string; lx: number; ly: number; ml: number };
type Feat = {
  properties: { name?: string; lx?: number; ly?: number; ml?: number };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Pt[][] | Pt[][][] };
};

// three levels of detail: far zoom uses a coarse copy, only close zoom uses the full 1:50m shapes
let lods: Poly[][] = [[], [], []];
let labels: Label[] = [];
const tileCache = new Map<string, HTMLCanvasElement>();
const lodOf = (z: number) => (z <= 2 ? 0 : z <= 4 ? 1 : 2);

function buildPolys(geo: GeoFC): Poly[] {
  const out: Poly[] = [];
  for (const f of geo.features as Feat[]) {
    const g = f.geometry;
    const parts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Pt[][][];
    for (const rings of parts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      out.push({ rings, bb: [x0, y0, x1, y1] });
    }
  }
  return out;
}

export function setBasemapData(geo: GeoFC): void {
  lods = [buildPolys(simplifyFC(geo, 0.5, 1.0)), buildPolys(simplifyFC(geo, 0.1, 0.15)), buildPolys(geo)];
  labels = [];
  for (const f of geo.features as Feat[]) {
    const p = f.properties;
    if (p.name && p.lx !== undefined && p.ly !== undefined) labels.push({ text: p.name, lx: p.lx, ly: p.ly, ml: p.ml ?? 5 });
  }
  tileCache.clear();
}

function drawTile(canvas: HTMLCanvasElement, x: number, y: number, z: number, size: number, dpr: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const world = size * 2 ** z;
  const ox = x * size, oy = y * size;
  const X = (lng: number) => ((lng + 180) / 360) * world - ox;
  const Y = (lat: number) => {
    const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world - oy;
  };
  const latOf = (py: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / world))) * 180) / Math.PI;
  const lng0 = (ox / world) * 360 - 180, lng1 = ((ox + size) / world) * 360 - 180;
  const latN = latOf(oy), latS = latOf(oy + size);

  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = LAND;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.8;
  ctx.lineJoin = 'round';
  for (const p of lods[lodOf(z)]) {
    if (p.bb[2] < lng0 || p.bb[0] > lng1 || p.bb[3] < latS || p.bb[1] > latN) continue;
    ctx.beginPath();
    for (const ring of p.rings) {
      let lx = NaN, ly = NaN;
      ring.forEach(([lng, lat], i) => {
        const px = X(lng), py = Y(lat);
        if (i > 0 && i < ring.length - 1 && Math.abs(px - lx) < 0.4 && Math.abs(py - ly) < 0.4) return; // sub-pixel step
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        lx = px;
        ly = py;
      });
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  }

  // country names: every tile that the text touches draws the whole text, so tiles join up seamlessly
  ctx.font = `${z < 3 ? 11 : 12}px "Microsoft JhengHei", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = LABEL;
  for (const l of labels) {
    if (z < l.ml - 0.5) continue;
    const px = X(l.lx), py = Y(l.ly);
    if (px < -90 || px > size + 90 || py < -12 || py > size + 12) continue;
    ctx.strokeText(l.text, px, py);
    ctx.fillText(l.text, px, py);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function installOfflineBasemap(): boolean {
  const L = (window as any).L;
  const proto = L?.TileLayer?.prototype;
  if (!proto) {
    console.warn('[VizTailor] Leaflet (window.L) not found; offline basemap not installed');
    return false;
  }
  if (proto.__vzOffline) return true;
  const offline = (layer: any) =>
    typeof layer._url === 'string' && (layer._url.startsWith(SENTINEL) || layer._url.includes('tile.openstreetmap.org'));
  const origCreate = proto.createTile;
  const origAttr = proto.getAttribution;

  // Tiles are painted one (or a few) per animation frame so the UI never freezes, finished tiles are cached
  // (panning / zooming back re-uses them), and an error in one tile can no longer stop Leaflet from creating the rest.
  type Job = { canvas: HTMLCanvasElement; x: number; y: number; z: number; size: number; dpr: number; key: string; done: (e: unknown, t: HTMLElement) => void };
  const queue: Job[] = [];
  let raf = 0;
  const pump = () => {
    raf = 0;
    const t0 = performance.now();
    do {
      const j = queue.shift();
      if (!j) break;
      try {
        if (j.canvas.isConnected) {
          drawTile(j.canvas, j.x, j.y, j.z, j.size, j.dpr);
          tileCache.set(j.key, j.canvas);
          if (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value as string);
        }
        j.done(null, j.canvas);
      } catch (e) {
        console.warn('[VizTailor] basemap tile failed', j.key, e);
        j.done(e, j.canvas);
      }
    } while (queue.length && performance.now() - t0 < 10);
    if (queue.length) raf = requestAnimationFrame(pump);
  };

  proto.createTile = function (this: any, coords: { x: number; y: number; z: number }, done: (e: unknown, t: HTMLElement) => void) {
    if (!offline(this)) return origCreate.call(this, coords, done);
    const size: number = this.getTileSize().x;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const n = 2 ** coords.z;
    const wx = ((coords.x % n) + n) % n; // repeated world copies show the same tile
    const key = `${coords.z}/${wx}/${coords.y}/${size}@${dpr}`;
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const hit = tileCache.get(key);
    if (hit) {
      canvas.getContext('2d')?.drawImage(hit, 0, 0);
      setTimeout(() => done(null, canvas), 0);
      return canvas;
    }
    queue.push({ canvas, x: wx, y: coords.y, z: coords.z, size, dpr, key, done });
    if (!raf) raf = requestAnimationFrame(pump);
    return canvas;
  };
  proto.getAttribution = function (this: any) {
    return offline(this) ? '離線底圖 · Natural Earth（公共領域）' : origAttr.call(this);
  };
  proto.__vzOffline = true;
  return true;
}
