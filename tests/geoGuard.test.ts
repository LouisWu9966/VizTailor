import { plan } from '../src/geoGuard.ts';
import assert from 'node:assert/strict';

const rows = Array.from({ length: 51290 }, (_, i) => ({ rid: i, country: 'C' + (i % 165), city: 'T' + (i % 3000), seg: 'S' + (i % 3) }));
const f = (fid: string, analyticType = 'dimension') => ({ fid, name: fid, analyticType });
const choro = (enc: Record<string, unknown[]>, defaultAggregated = true) => ({ config: { geoms: ['choropleth'], defaultAggregated }, encodings: enc });

// 使用者的情況：地理 ID 同時放 Country 與 Row ID
let p = plan(choro({ geoId: [f('country'), f('rid')], color: [f('cnt', 'measure')] }) as never, rows);
assert.deepEqual([...p!.drop.keys()], ['rid']);

// 只有 Country：不處理
assert.equal(plan(choro({ geoId: [f('country')], color: [f('sales', 'measure')] }) as never, rows), null);

// Row ID 單獨當地理 ID：拿掉
p = plan(choro({ geoId: [f('rid')] }) as never, rows);
assert.deepEqual([...p!.drop.keys()], ['rid']);

// Country + 明細放 City（165×3000 → 超量）：拿掉 City，保留小的 Segment
p = plan(choro({ geoId: [f('country')], details: [f('seg'), f('city')] }) as never, rows);
assert.deepEqual([...p!.drop.keys()], ['city']);

// 不聚合：改成聚合
p = plan(choro({ geoId: [f('country')] }, false) as never, rows);
assert.equal(p!.aggregate, true);

// 其他圖種：不處理
assert.equal(plan({ config: { geoms: ['bar'] }, encodings: { geoId: [f('rid')] } } as never, rows), null);
console.log('ALL PASS');
