import { buildDataset, type Cell } from '../src/dataset.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('FAIL', label, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
};
const mk = (head: string[], ...cols: Cell[][]): Cell[][] => [head, ...cols[0].map((_, i) => cols.map((c) => c[i]))];
const build = (head: string, vals: Cell[], extra?: [string, Cell[]]) => {
  const m = extra ? mk([head, extra[0]], vals, extra[1]) : mk([head, 'k'], vals, vals.map(() => 'x'));
  return buildDataset('t', m, 1);
};
const info = (d: ReturnType<typeof build>) => ({ t: d.fields[0].semanticType, a: d.fields[0].analyticType, v: d.rows.map((r) => r[d.fields[0].fid]) });

// 日期
eq('iso', info(build('日期', ['2025-11-28', '2025/1/2'])), { t: 'temporal', a: 'dimension', v: ['2025-11-28', '2025-01-02'] });
eq('iso time', info(build('Order Date', ['2025-11-28 3:04', '2025-11-29T10:00:05'])).v, ['2025-11-28 03:04:00', '2025-11-29 10:00:05']);
eq('cjk', info(build('日期', ['2025年11月28日', '2025年1月2日'])).v, ['2025-11-28', '2025-01-02']);
eq('fullwidth', info(build('日期', ['２０２５-１１-２８', '2025-11-29'])).v, ['2025-11-28', '2025-11-29']);
eq('roc slash', info(build('日期', ['114/11/28', '114/01/02'])).v, ['2025-11-28', '2025-01-02']);
eq('roc cjk', info(build('日期', ['民國114年11月28日', '民國99年1月2日'])).v, ['2025-11-28', '2010-01-02']);
eq('mdy', info(build('Date', ['11/28/2025', '01/02/2025'])).v, ['2025-11-28', '2025-01-02']);
eq('dmy by content', info(build('Date', ['28/11/2025', '01/02/2025'])).v, ['2025-11-28', '2025-02-01']);
eq('ambiguous default mdy + note', build('Date', ['03/04/2025', '05/06/2025']).notes?.some((n) => n.includes('無法判斷')), true);
eq('dmon', info(build('Date', ['28-Nov-2025', '2 Jan 2025'])).v, ['2025-11-28', '2025-01-02']);
eq('mond', info(build('Date', ['Nov 28, 2025', 'January 2, 2025'])).v, ['2025-11-28', '2025-01-02']);
eq('ymd8 with hint', info(build('訂單日期', ['20251128', '20250102'])), { t: 'temporal', a: 'dimension', v: ['2025-11-28', '2025-01-02'] });
eq('ymd8 no hint stays number', info(build('編碼', ['20251128', '20250102'])).t, 'quantitative');
eq('excel serial with hint', info(build('Order Date', [45989, 45658])).v, ['2025-11-28', '2025-01-01']);
eq('serial no hint stays number', info(build('Sales', [45989, 45658])).t, 'quantitative');
eq('invalid date is text', info(build('日期', ['2025-02-30', '2025-13-01'])).t, 'nominal');
eq('mixed >5% text', info(build('日期', ['2025-01-01', '2025-01-02', 'abc'])).t, 'nominal');

// 數字
eq('thousands', info(build('金額', ['1,234', '5,678.5'])).v, [1234, 5678.5]);
eq('currency', info(build('金額', ['$1,200', 'NT$3,400', '¥5'])).v, [1200, 3400, 5]);
eq('neg paren', info(build('金額', ['(1,200)', '50'])).v, [-1200, 50]);
eq('neg currency', info(build('金額', ['-$5', '$-6'])).v, [-5, -6]);
eq('yuan suffix', info(build('金額', ['120元', '3,000圓'])).v, [120, 3000]);
eq('percent', info(build('毛利率', ['12%', '8.5％'])).v, [12, 8.5]);
eq('percent note', build('毛利率', ['12%', '8%']).notes?.some((n) => n.includes('%')), true);
eq('fullwidth num', info(build('數量', ['１２', '３'])).v, [12, 3]);
eq('list is not number', info(build('標籤', ['1,2,3', '4,5'])).t, 'nominal');
eq('bad grouping not number', info(build('金額', ['1,23', '4,5'])).t, 'nominal');
eq('leading zero text', info(build('電話', ['0912', '0923'])).t, 'nominal');
eq('sci', info(build('v', ['1e3', '2.5E-1'])).v, [1000, 0.25]);

// 編號欄
eq('Row ID dimension', info(build('Row ID', [1, 2, 3])), { t: 'nominal', a: 'dimension', v: ['1', '2', '3'] });
eq('Postal Code dimension', info(build('Postal Code', [10001, 94105])).a, 'dimension');
eq('客戶編號', info(build('客戶編號', [1001, 1002])).a, 'dimension');
eq('Profit stays measure', info(build('Profit', [1, 2.5])).a, 'measure');
eq('Quantity stays measure', info(build('Quantity', [3, 4])).a, 'measure');
eq('Discount (code in word) stays measure', info(build('Barcode count', [3, 4])).a, 'measure');
eq('float ID stays measure', info(build('ID score', [1.5, 2.5])).a, 'measure');
eq('ID note', build('Row ID', [1, 2]).notes?.some((n) => n.includes('編號')), true);

// 一般
eq('text', info(build('名稱', ['a', 'b'])).t, 'nominal');
eq('null kept', info(build('金額', ['1', '', '3'])).v, [1, null, 3]);
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
process.exit(fail ? 1 : 0);
