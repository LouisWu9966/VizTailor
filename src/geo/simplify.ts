import type { GeoFC } from './data';

// Douglas–Peucker simplification of the bundled Natural Earth 1:50m countries.
// The full-detail shapes have ~100k points and ~1,500 island parts; drawing them once per map tile (basemap) or as one
// Leaflet polygon per part (graphic-walker's filled map) is what made the map slow and incomplete.
// Coarser copies (and without specks of islands) are plenty for a world map and ~10-50x cheaper to draw.

type Pt = [number, number];
type Geom = { type: 'Polygon'; coordinates: Pt[][] } | { type: 'MultiPolygon'; coordinates: Pt[][][] };
type Feat = { type?: string; properties?: Record<string, unknown>; geometry: Geom };

export function simplifyRing(r: Pt[], tol: number): Pt[] {
  const n = r.length;
  if (n <= 4) return r;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const t2 = tol * tol;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const b = stack.pop() as number, a = stack.pop() as number;
    const [ax, ay] = r[a], [bx, by] = r[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = r[i][0], py = r[i][1];
      let d2: number;
      if (l2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > md) { md = d2; mi = i; }
    }
    if (md > t2 && mi >= 0) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  const out = r.filter((_, i) => keep[i] === 1);
  return out.length >= 4 ? out : r;
}

const span = (ring: Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return Math.max(x1 - x0, y1 - y0);
};

/** tol: simplification tolerance in degrees; minSpan: drop island parts smaller than this (degrees) — the largest part of a country always stays */
export function simplifyFC(geo: GeoFC, tol: number, minSpan: number): GeoFC {
  const features = (geo.features as Feat[]).map((f) => {
    const g = f.geometry;
    const parts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Pt[][][];
    const sized = parts.map((rings) => ({ rings, s: span(rings[0]) }));
    const biggest = sized.reduce((m, p) => (p.s > m.s ? p : m), sized[0]);
    const kept = sized
      .filter((p) => p === biggest || p.s >= minSpan)
      .map((p) => p.rings.map((ring, i) => (i === 0 || span(ring) >= tol * 3 ? simplifyRing(ring, tol) : null)).filter((x): x is Pt[] => x !== null));
    const geometry: Geom = g.type === 'Polygon' ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
    return { ...f, geometry };
  });
  return { ...geo, features } as GeoFC;
}
