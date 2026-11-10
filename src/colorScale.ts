export type ColorMaps = Record<string, Record<string, string>>;
export type Val = string | number;

const cmp = (a: Val, b: Val) => (typeof a === 'number' && typeof b === 'number' ? a - b : a < b ? -1 : a > b ? 1 : 0);

/** 某欄位的所有不同值（保留原始型別），由小到大，與 vega 預設排序一致 */
export function distinctValues(rows: Array<Record<string, unknown>>, fid: string, limit = 5000): Val[] {
  const s = new Map<string, Val>();
  for (const r of rows) {
    const v = r[fid];
    if (v == null || v === '') continue;
    const k = String(v);
    if (!s.has(k)) {
      s.set(k, typeof v === 'number' ? v : k);
      if (s.size >= limit) break;
    }
  }
  return [...s.values()].sort(cmp);
}

export type Info = { semanticType: string; theme: string; values: unknown[] };
/** 交給 `<GraphicWalker scales={{ color }}>` 的函式；沒有對應表時回傳 undefined（完全不干涉原本的行為） */
export function makeColorScale(maps: ColorMaps, cat: string[]) {
  const fids = Object.keys(maps).filter((f) => Object.keys(maps[f]).length > 0);
  if (fids.length === 0) return undefined;
  return (info: Info): { domain?: Val[]; range?: string[] } => {
    if (info.semanticType === 'quantitative') return {};
    const seen = new Map<string, Val>();
    for (const v of info.values) {
      if (v == null || v === '') continue;
      const k = String(v);
      if (!seen.has(k)) seen.set(k, typeof v === 'number' ? v : k);
    }
    // 這個圖的顏色欄位是哪一個？以「對應表的值與實際值重疊最多」的欄位為準
    let best: string | null = null, bestN = 0;
    for (const f of fids) {
      let n = 0;
      for (const k of Object.keys(maps[f])) if (seen.has(k)) n++;
      if (n > bestN) { bestN = n; best = f; }
    }
    if (!best) return {};
    const map = maps[best];
    const domain = [...seen.values()].sort(cmp);
    return { domain, range: domain.map((v, i) => map[String(v)] ?? cat[i % cat.length]) };
  };
}


/** 漸層色帶（淺 → 深；發散型為 低 → 中 → 高） */
export const AUTO_RAMPS: Record<string, string[]> = {
  紅: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
  橘: ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603'],
  藍: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  綠: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'],
  紫: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'],
  灰: ['#f0f0f0', '#cccccc', '#969696', '#636363', '#252525'],
  '紅—黃—綠（低紅高綠）': ['#d73027', '#fdae61', '#ffffbf', '#a6d96a', '#1a9850'],
  '藍—白—紅（低藍高紅）': ['#2166ac', '#92c5de', '#f7f7f7', '#f4a582', '#b2182b'],
};

/** 在色帶上取 t（0..1）位置的顏色（線性內插） */
export function rampAt(stops: string[], t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = parseInt(stops[i].slice(1), 16), b = parseInt(stops[i + 1].slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

export type Agg = 'sum' | 'mean' | 'count';
/**
 * 一鍵排色：依度量（如 Sales 加總）替顏色欄位的每個值配色，值越高越靠色帶尾端（越深）。
 * mode 'rank'：依名次平均分布（不怕極端值）；'value'：依數值比例。
 */
export function autoAssign(
  rows: Array<Record<string, unknown>>, fid: string, measure: string, agg: Agg,
  stops: string[], mode: 'rank' | 'value', reverse = false,
): { colors: Record<string, string>; ranked: Array<{ v: string; n: number }> } {
  const acc = new Map<string, { s: number; c: number }>();
  for (const r of rows) {
    const k = r[fid];
    if (k == null || k === '') continue;
    const m = Number(r[measure]);
    let a = acc.get(String(k));
    if (!a) acc.set(String(k), (a = { s: 0, c: 0 }));
    if (agg === 'count') a.c++;
    else if (r[measure] != null && r[measure] !== '' && Number.isFinite(m)) { a.s += m; a.c++; }
  }
  const ranked = [...acc].map(([v, a]) => ({ v, n: agg === 'count' ? a.c : agg === 'mean' ? (a.c ? a.s / a.c : 0) : a.s }))
    .sort((p, q) => q.n - p.n); // 高 → 低
  const hi = ranked[0]?.n ?? 0, lo = ranked[ranked.length - 1]?.n ?? 0;
  const colors: Record<string, string> = {};
  ranked.forEach((x, i) => {
    let t = mode === 'rank' ? (ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1) : hi > lo ? (x.n - lo) / (hi - lo) : 1;
    if (reverse) t = 1 - t;
    colors[x.v] = rampAt(stops, t);
  });
  return { colors, ranked };
}
