import { simplifyFC } from '../src/geo/simplify.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const geo = JSON.parse(readFileSync(new URL('../public/geo/world-countries.json', import.meta.url), 'utf-8'));
const count = (g: { features: { geometry: { type: string; coordinates: unknown } }[] }) => {
  let parts = 0, pts = 0;
  for (const f of g.features) {
    const ps = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
    parts += ps.length;
    for (const rings of ps) for (const r of rings) pts += r.length;
  }
  return { parts, pts };
};
console.log('full  ', count(geo), geo.features.length, 'features');
for (const [tol, ms] of [[0.5, 1.0], [0.1, 0.15], [0.04, 0.12]] as const) {
  const t = performance.now();
  const s = simplifyFC(geo, tol, ms);
  console.log(`tol ${tol}`, count(s), Math.round(performance.now() - t) + 'ms');
  assert.equal(s.features.length, geo.features.length);
  for (const f of s.features) {
    const ps = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
    assert.ok(ps.length >= 1 && ps.every((rs) => rs[0].length >= 4), 'every country keeps a valid outer ring');
  }
}
console.log('ALL PASS');
