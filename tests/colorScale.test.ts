import assert from 'node:assert/strict';
import { distinctValues, makeColorScale } from '../src/colorScale.ts';
const mod = { distinctValues, makeColorScale };

const rows = [{ c: 'b' }, { c: 'a' }, { c: 'b' }, { c: null }, { c: 'c' }];
assert.deepEqual(mod.distinctValues(rows, 'c'), ['a', 'b', 'c']);
assert.equal(mod.makeColorScale({}, ['#111']), undefined);
assert.equal(mod.makeColorScale({ f: {} }, ['#111']), undefined);
const fn = mod.makeColorScale({ c: { b: '#ff0000' }, other: { zzz: '#00ff00' } }, ['#111111', '#222222']);
assert.deepEqual(fn({ semanticType: 'nominal', theme: 'light', values: ['b', 'a', 'c', 'a'] }), { domain: ['a', 'b', 'c'], range: ['#111111', '#ff0000', '#111111'] });
assert.deepEqual(fn({ semanticType: 'nominal', theme: 'light', values: ['x', 'y'] }), {});
assert.deepEqual(fn({ semanticType: 'quantitative', theme: 'light', values: [1, 2] }), {});
const nf = mod.makeColorScale({ n: { '2': '#abcdef' } }, ['#000']);
assert.deepEqual(nf({ semanticType: 'ordinal', theme: 'light', values: [10, 2] }), { domain: [2, 10], range: ['#abcdef', '#000'] });
console.log('colorScale ALL PASS');

import { autoAssign, rampAt } from '../src/colorScale.ts';
assert.equal(rampAt(['#000000', '#ffffff'], 0), '#000000');
assert.equal(rampAt(['#000000', '#ffffff'], 1), '#ffffff');
assert.equal(rampAt(['#000000', '#ffffff'], 0.5), '#808080');
const sales = [{ c: 'US', s: 100 }, { c: 'TW', s: 30 }, { c: 'US', s: 50 }, { c: 'JP', s: 60 }, { c: 'TW', s: null }];
const r1 = autoAssign(sales, 'c', 's', 'sum', ['#ffffff', '#ff0000'], 'rank');
assert.deepEqual(r1.ranked.map((x) => x.v), ['US', 'JP', 'TW']);
assert.deepEqual(r1.colors, { US: '#ff0000', JP: '#ff8080', TW: '#ffffff' });
const r2 = autoAssign(sales, 'c', 's', 'sum', ['#ffffff', '#ff0000'], 'value', true);
assert.equal(r2.colors.US, '#ffffff'); assert.equal(r2.colors.TW, '#ff0000');
assert.equal(autoAssign(sales, 'c', 's', 'count', ['#ffffff', '#ff0000'], 'rank').ranked[0].n, 2);
console.log('autoAssign ALL PASS');
