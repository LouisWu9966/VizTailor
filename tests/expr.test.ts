import { compile, CalcError, type Value } from '../src/calc/expr.ts';

let fail = 0;
const row = { Profit: 50, Sales: 200, Name: 'Alice', Day: '2024-03-15', Zero: 0, N: null as Value };
const params = { 門檻: 100, 文字: 'x', 開: true };
const known = { fields: Object.keys(row), params: Object.keys(params) };
function t(src: string, want: Value) {
  let got: Value | string;
  try { got = compile(src, known).run(row, params); } catch (e) { got = 'ERR:' + (e as Error).message; }
  const ok = Object.is(got, want);
  if (!ok) { fail++; console.log('FAIL', src, '=>', got, 'want', want); }
}
function bad(src: string, frag: string) {
  try { compile(src, known); fail++; console.log('FAIL (no error)', src); }
  catch (e) { if (!(e instanceof CalcError) || !e.message.includes(frag)) { fail++; console.log('FAIL msg', src, (e as Error).message); } }
}
t('1+2*3', 7); t('(1+2)*3', 9); t('2^3^2', 512); t('-2^2', -4); t('10 % 3', 1); t('7 / 2', 3.5);
t('[Profit] / [Sales]', 0.25); t('[Profit] / [Zero]', null); t('[N] + 1', null); t('[Profit] - [@門檻]', -50);
t('[門檻] * 2', 200);
t('IF [Sales] > [@門檻] THEN "高" ELSE "低" END', '高');
t('IF [Sales] > 500 THEN "A" ELSEIF [Sales] > 150 THEN "B" ELSE "C" END', 'B');
t('IF [N] > 1 THEN 1 END', null);
t('if [Profit] > 0 and not [Sales] < 100 then "ok" else "no" end', 'ok');
t('CASE [Name] WHEN "Bob" THEN 1 WHEN "Alice" THEN 2 ELSE 3 END', 2);
t('[Name] + "-" + STR([Profit])', 'Alice-50');
t('ROUND(2.567, 2)', 2.57); t('ROUND(2.5)', 3); t('ABS(-3)', 3); t('MAX(3, 9, 5)', 9); t('MIN("b","a")', 'a');
t('ISNULL([N])', true); t('IFNULL([N], 7)', 7); t('ZN([N])', 0); t('IIF([Profit] > 10, "y", "n")', 'y');
t('UPPER([Name])', 'ALICE'); t('LEFT([Name], 2)', 'Al'); t('RIGHT([Name], 2)', 'ce'); t('MID([Name], 2, 3)', 'lic');
t('CONTAINS([Name], "lic")', true); t('LEN([Name])', 5); t('REPLACE([Name], "l", "L")', 'ALice');
t('YEAR([Day])', 2024); t('MONTH([Day])', 3); t('DAY([Day])', 15); t('QUARTER([Day])', 1);
t('DATEDIFF("day", "2024-03-01", [Day])', 14); t('DATEDIFF("month", "2023-12-01", [Day])', 3);
t('[Profit] = 50', true); t('[Profit] <> 50', false); t('[Name] = 50', false); t('[N] = 1', null);
t('TRUE AND NULL', null); t('FALSE AND NULL', false); t('TRUE OR NULL', true);
t('[開] AND [Profit] > 0', true);
t('// 註解\n1 + 1', 2); t('[Profit] // 尾端註解', 50);
t('SQRT(-1)', null); t('LOG(100)', 2); t('POWER(2, 10)', 1024); t('INT(-2.7)', -2);
bad('1 +', '結束'); bad('[Nope] + 1', '找不到欄位'); bad('[@Nope]', '找不到參數'); bad('FOO(1)', '不認得');
bad('IF 1 THEN 2', 'END'); bad('ROUND()', '需要'); bad('1 2', '多出來'); bad('(1', '）'.replace('）', ')')); bad('"abc', '引號'); bad('[a', ']');
bad('1 # 2', '無法辨識');
// 不能執行任意程式碼
bad('constructor', '不認得'); bad('alert(1)', '不認得');
const c = compile('IF [Profit] > [@門檻] THEN [Sales] END', known);
if (c.fields.join() !== 'Profit,Sales' || c.params.join() !== '門檻') { fail++; console.log('FAIL refs', c.fields, c.params); }
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
process.exit(fail ? 1 : 0);
