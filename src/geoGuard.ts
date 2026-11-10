import { reaction } from 'mobx';
import type { VizSpecStore } from '@kanaries/graphic-walker';

/**
 * 填充地圖（Leaflet）是「每一列資料畫一個完整的國家多邊形」。圖上若混進高基數欄位（例如 Row ID 有 5 萬種值），
 * 就會一次畫出 5 萬個多邊形 → 記憶體不足、整個畫面當掉（WebView 顯示「Out of Memory」）。
 * 這裡監看目前的圖表：只要是填充地圖，就把會讓「標記數」爆量的欄位拿掉，並通知使用者。
 */

type Row = Record<string, unknown>;
type F = { fid: string; name?: string; analyticType?: string };
type Vis = { config?: { geoms?: string[]; defaultAggregated?: boolean }; encodings?: Record<string, F[] | undefined> };

const LIMIT = 600; // 世界國家約 250 個（含別名約 450 個 feature），超過就視為不合理
const OTHER = ['color', 'opacity', 'text', 'details'] as const;

const cache = new WeakMap<Row[], Map<string, number>>();
function distinct(rows: Row[], fid: string): number {
  let m = cache.get(rows);
  if (!m) cache.set(rows, (m = new Map()));
  const hit = m.get(fid);
  if (hit !== undefined) return hit;
  const s = new Set<unknown>();
  for (const r of rows) s.add(r[fid]);
  m.set(fid, s.size);
  return s.size;
}

type Plan = { drop: Map<string, string>; aggregate: boolean };

export function plan(vis: Vis, rows: Row[]): Plan | null {
  if (vis.config?.geoms?.[0] !== 'choropleth') return null;
  const enc = vis.encodings ?? {};
  const geo = enc.geoId ?? [];
  if (geo.length === 0) return null;
  const drop = new Map<string, string>(); // fid -> display name
  const nm = (f: F) => f.name ?? f.fid;

  for (const f of geo.slice(1)) drop.set(f.fid, nm(f)); // 「地理 ID」只該放一個欄位
  let geoKept: F | null = geo[0];
  if (distinct(rows, geo[0].fid) > LIMIT) { drop.set(geo[0].fid, nm(geo[0])); geoKept = null; }

  const others: F[] = [];
  for (const ch of OTHER) {
    for (const f of enc[ch] ?? []) if (f.analyticType === 'dimension' && !drop.has(f.fid) && !others.some((o) => o.fid === f.fid)) others.push(f);
  }
  others.sort((a, b) => distinct(rows, b.fid) - distinct(rows, a.fid));
  const marks = () => Math.min(rows.length, (geoKept ? distinct(rows, geoKept.fid) : 1) * others.reduce((p, f) => p * distinct(rows, f.fid), 1));
  while (others.length > 0 && marks() > LIMIT) {
    const f = others.shift() as F;
    drop.set(f.fid, nm(f));
  }
  const aggregate = vis.config?.defaultAggregated === false && rows.length > LIMIT;
  return drop.size === 0 && !aggregate ? null : { drop, aggregate };
}

export function installGeoGuard(getStore: () => VizSpecStore | null, getRows: () => Row[] | undefined, notify: (msg: string) => void): () => void {
  let timer = 0;
  let dispose: () => void = () => {};
  let busy = false;

  const fix = (store: VizSpecStore) => {
    const rows = getRows();
    if (busy || !rows) return;
    const p = plan(store.currentVis as unknown as Vis, rows);
    if (!p) return;
    busy = true;
    try {
      const idx = store.visIndex;
      const charts = JSON.parse(JSON.stringify(store.exportCode())) as Array<{ encodings: Record<string, F[]>; config: { defaultAggregated?: boolean } }>;
      const c = charts[idx];
      if (!c) return;
      for (const ch of ['geoId', ...OTHER]) if (Array.isArray(c.encodings[ch])) c.encodings[ch] = c.encodings[ch].filter((f) => !p.drop.has(f.fid));
      if (p.aggregate) c.config.defaultAggregated = true;
      store.importCode(charts as never);
      store.visIndex = Math.min(idx, charts.length - 1);
      const parts: string[] = [];
      if (p.drop.size) {
        const names = [...p.drop.entries()].map(([fid, n]) => `「${n}」（${distinct(rows, fid).toLocaleString()} 種值）`).join('、');
        parts.push(`填充地圖會為每一種值畫出一個完整的國家多邊形，${names}太多，會讓記憶體不足，已自動從這張圖拿掉。填充地圖只適合放國家（或州／省）這類最多數百種的欄位。`);
      }
      if (p.aggregate) parts.push('已自動改成「聚合」模式（不聚合會逐列畫出多邊形）。');
      notify(parts.join(''));
    } finally {
      busy = false;
    }
  };

  const arm = () => {
    const store = getStore();
    if (!store) { timer = window.setTimeout(arm, 300); return; } // graphic-walker 尚未掛載
    dispose = reaction(
      () => {
        const v = store.currentVis as unknown as Vis;
        const e = v.encodings ?? {};
        return JSON.stringify([v.config?.geoms, v.config?.defaultAggregated, ...['geoId', ...OTHER].map((k) => (e[k] ?? []).map((f) => f.fid))]);
      },
      () => fix(store),
      { fireImmediately: true },
    );
  };
  arm();
  return () => { window.clearTimeout(timer); dispose(); };
}
