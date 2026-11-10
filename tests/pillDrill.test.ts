import { apply, locate } from '../src/pillDrill.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
};
const el = (id: string) => ({ getAttribute: () => id });
eq('locate multi', locate(el('encode_columns_1_abc')), { channel: 'columns', index: 1 });
eq('locate single', locate(el('encode_color_abc')), { channel: 'color', index: 0 });
eq('locate geoId', locate(el('encode_geoId_0_x')), { channel: 'geoId', index: 0 });
eq('locate dataset item ignored', locate(el('dimension_abc')), null);

const od = { fid: 'Order Date', name: 'Order Date', semanticType: 'temporal', analyticType: 'dimension' };
const profit = { fid: 'Profit', name: 'Profit', semanticType: 'quantitative', analyticType: 'measure', aggName: 'sum' };
function fake() {
  const state = { charts: [{ encodings: { dimensions: [od], measures: [profit], columns: [od], rows: [profit], color: [], filters: [] } }], imported: null as unknown, visIndex: 0 };
  const store = {
    get visIndex() { return state.visIndex; }, set visIndex(v: number) { state.visIndex = v; },
    meta: [od, profit],
    exportCode: () => JSON.parse(JSON.stringify(state.charts)),
    importCode: (c: unknown) => { state.charts = c as typeof state.charts; },
  };
  return { store: store as never, state };
}
{
  const { store, state } = fake();
  apply(store, 'columns', 0, 'year', () => '2025-11-28');
  const e = state.charts[0].encodings as Record<string, any[]>;
  eq('year: pill replaced', e.columns[0].name, '年 (Order Date)');
  eq('year: expression', [e.columns[0].expression.op, e.columns[0].expression.params[0].value, e.columns[0].expression.params[1].value, e.columns[0].expression.params[2].value], ['dateTimeDrill', 'Order Date', 'year', '%Y-%m-%d']);
  eq('year: added to dimensions list', e.dimensions.length, 2);
  eq('year: measures untouched', e.rows[0].fid, 'Profit');
  // 再換成月：新增另一個衍生欄位、舊的保留在清單
  apply(store, 'columns', 0, 'month', () => '2025-11-28');
  eq('month: pill', e.columns[0].name === undefined ? '' : (state.charts[0].encodings as any).columns[0].name, '月 (Order Date)');
  eq('dimensions now 3', (state.charts[0].encodings as any).dimensions.length, 3);
  // 再回到年：重用已存在的衍生欄位，不重複新增
  apply(store, 'columns', 0, 'year');
  eq('year again reuses', (state.charts[0].encodings as any).dimensions.length, 3);
  eq('year again name', (state.charts[0].encodings as any).columns[0].name, '年 (Order Date)');
  // 還原
  apply(store, 'columns', 0, null);
  eq('restore raw', (state.charts[0].encodings as any).columns[0].fid, 'Order Date');
  eq('visIndex kept', state.visIndex, 0);
}
{
  const { store, state } = fake();
  apply(store, 'columns', 0, 'hour', () => '2025-11-28 10:20:30');
  eq('time format', (state.charts[0].encodings as any).columns[0].expression.params[2].value, '%Y-%m-%d %H:%M:%S');
  apply(store, 'filters', 0, 'year'); // 篩選器不處理
  apply(store, 'columns', 5, 'year'); // 不存在的位置
  eq('no crash/no change', (state.charts[0].encodings as any).columns[0].timeUnit, 'hour');
}
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
process.exit(fail ? 1 : 0);
