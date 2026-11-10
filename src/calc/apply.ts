import type { Dataset, FieldMeta, Row } from '../dataset';
import { compile, CalcError, type Value } from './expr';

export type ParamType = 'number' | 'string' | 'boolean';
export type Param = {
  id: string;
  name: string;
  type: ParamType;
  value: number | string | boolean;
  min?: number; // 數字參數：有 min 和 max 時顯示滑桿
  max?: number;
  step?: number;
  options?: string[]; // 文字參數：有選項時顯示下拉選單
};
export type Calc = { id: string; name: string; formula: string };
export type CalcState = { params: Param[]; calcs: Calc[] };
export const EMPTY: CalcState = { params: [], calcs: [] };

export const describeError = (e: unknown) =>
  e instanceof CalcError ? `${e.message}（第 ${e.pos + 1} 個字元附近）` : e instanceof Error ? e.message : String(e);

export const paramValues = (params: Param[]): Record<string, Value> =>
  Object.fromEntries(params.filter((p) => p.name.trim()).map((p) => [p.name.trim(), p.value]));

/** 把計算欄位逐一算出來接在資料後面（後面的欄位可以引用前面的）。沒有任何計算欄位時原樣回傳同一個物件。 */
export function applyCalcs(ds: Dataset, st: CalcState): { ds: Dataset; errors: Record<string, string>; added: FieldMeta[] } {
  const errors: Record<string, string> = {};
  if (st.calcs.length === 0) return { ds, errors, added: [] };

  const params = paramValues(st.params);
  const fieldNames = new Set(ds.fields.map((f) => f.fid));
  const rows: Row[] = ds.rows.map((r) => ({ ...r }));
  const added: FieldMeta[] = [];

  for (const c of st.calcs) {
    const name = c.name.trim();
    if (!name) { errors[c.id] = '請輸入名稱'; continue; }
    if (fieldNames.has(name)) { errors[c.id] = `已有同名的欄位「${name}」`; continue; }
    let run: ReturnType<typeof compile>['run'];
    try {
      run = compile(c.formula, { fields: fieldNames, params: Object.keys(params) }).run;
    } catch (e) { errors[c.id] = describeError(e); continue; }

    let nums = 0, other = 0;
    const out: Value[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const v = run(rows[i] as Record<string, Value>, params);
      out[i] = v;
      if (v === null) continue;
      if (typeof v === 'number') nums++; else other++;
    }
    const quantitative = nums > 0 && other === 0;
    for (let i = 0; i < rows.length; i++) {
      const v = out[i];
      rows[i][name] = v === null ? null : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v;
    }
    const meta: FieldMeta = {
      fid: name, name,
      semanticType: quantitative ? 'quantitative' : 'nominal',
      analyticType: quantitative ? 'measure' : 'dimension',
    };
    added.push(meta);
    fieldNames.add(name);
  }
  if (added.length === 0) return { ds, errors, added };
  return { ds: { ...ds, rows, fields: [...ds.fields, ...added] }, errors, added };
}
