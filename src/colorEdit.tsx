import { useEffect, useMemo, useState } from 'react';

/**
 * Tableau 風格的「編輯色彩」：逐一替「顏色」欄位的每個值指定顏色。
 * 做法：Graphic Walker 的 `scales.color` 可以是函式（吃該欄位的所有值，回傳 vega 的 domain／range）。
 * 對應表依「欄位 fid → 值 → 顏色」存在 localStorage；沒指定的值沿用目前的分類色盤。
 */

import { AUTO_RAMPS, autoAssign, rampAt, type Agg, type ColorMaps, type Val } from './colorScale';
export { distinctValues, makeColorScale } from './colorScale';
export type { ColorMaps } from './colorScale';

export const PALETTES: Record<string, string[]> = {
  'Tableau 10': ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  'Tableau 20': ['#4e79a7', '#a0cbe8', '#f28e2b', '#ffbe7d', '#59a14f', '#8cd17d', '#b6992d', '#f1ce63', '#499894', '#86bcb6', '#e15759', '#ff9d9a', '#79706e', '#bab0ac', '#d37295', '#fabfd2', '#b07aa1', '#d4a6c8', '#9d7660', '#d7b5a6'],
  色盲: ['#1170aa', '#fc7d0b', '#a3acb9', '#57606c', '#5fa2ce', '#c85200', '#7b848f', '#a3cce9', '#ffbc79', '#c8d0d9'],
  'Tableau Classic 10': ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
  高對比: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999', '#17becf', '#111111'],
  柔和: ['#8dd3c7', '#fdb462', '#bebada', '#fb8072', '#80b1d3', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5'],
  交通燈: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'],
  灰階: ['#2b2b2b', '#555555', '#7f7f7f', '#a9a9a9', '#d3d3d3'],
};

const KEY = 'viztailor.colormap.v1';
export function loadColorMaps(): ColorMaps {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') return s as ColorMaps;
  } catch { /* 儲存被封鎖：不記住也無妨 */ }
  return {};
}
export function saveColorMaps(m: ColorMaps) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 同上 */ }
}

export type ColorTarget = {
  fid: string; name: string; values: Val[];
  rows: Array<Record<string, unknown>>;
  measures: Array<{ fid: string; name: string }>;
  defaultMeasure?: string; // 圖表上正在用的度量
};

type Props = {
  target: ColorTarget | null;
  message: string | null; // 例如「請先把欄位拖到顏色」
  onClose: () => void;
  maps: ColorMaps;
  setMaps: (m: ColorMaps) => void;
  cat: string[]; // 目前的分類色盤（沒指定的值用它）
};

export function ColorEditor({ target, message, onClose, maps, setMaps, cat }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [pal, setPal] = useState('Tableau 20');
  const [q, setQ] = useState('');
  const [mea, setMea] = useState('');
  const [agg, setAgg] = useState<Agg>('sum');
  const [ramp, setRamp] = useState('紅');
  const [mode, setMode] = useState<'rank' | 'value'>('rank');
  const [rev, setRev] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null); // 一鍵排色後，清單改依度量由高到低排

  useEffect(() => {
    setDraft(target ? { ...(maps[target.fid] ?? {}) } : {});
    setSel(new Set());
    setAnchor(null);
    setQ('');
    setOrder(null);
    setMea(target?.defaultMeasure ?? target?.measures[0]?.fid ?? '');
    // 只在開啟（換目標）時重設草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.fid]);

  const items = useMemo(() => {
    if (!target) return [] as { v: string; color: string }[];
    const base = target.values.map((v, i) => ({ v: String(v), color: draft[String(v)] ?? cat[i % cat.length] }));
    if (!order) return base;
    const pos = new Map(order.map((v, i) => [v, i]));
    return [...base].sort((a, b) => (pos.get(a.v) ?? 1e9) - (pos.get(b.v) ?? 1e9));
  }, [target, draft, cat, order]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k ? items.filter((x) => x.v.toLowerCase().includes(k)) : items;
    return list.slice(0, 600);
  }, [items, q]);

  if (!target && !message) return null;

  const click = (v: string, e: React.MouseEvent) => {
    const next = new Set(e.ctrlKey || e.metaKey ? sel : []);
    if (e.shiftKey && anchor) {
      const names = shown.map((x) => x.v);
      const a = names.indexOf(anchor), b = names.indexOf(v);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(names[i]);
    } else if ((e.ctrlKey || e.metaKey) && sel.has(v)) next.delete(v);
    else next.add(v);
    if (!e.shiftKey) setAnchor(v);
    setSel(next);
  };
  const assign = (c: string) => {
    if (sel.size === 0) return;
    setDraft((d) => { const n = { ...d }; sel.forEach((v) => { n[v] = c; }); return n; });
  };
  const assignPalette = () => {
    const colors = PALETTES[pal];
    setDraft(Object.fromEntries(items.map((x, i) => [x.v, colors[i % colors.length]])));
  };
  const auto = () => {
    if (!target || !mea) return;
    const r = autoAssign(target.rows, target.fid, mea, agg, AUTO_RAMPS[ramp], mode, rev);
    setDraft(r.colors);
    setOrder(r.ranked.map((x) => x.v));
    setSel(new Set());
  };
  const commit = () => {
    if (!target) return;
    const next = { ...maps };
    if (Object.keys(draft).length === 0) delete next[target.fid]; else next[target.fid] = draft;
    setMaps(next);
  };

  return (
    <div className="ce-back" onMouseDown={onClose}>
      <div className="ce" role="dialog" aria-label="編輯色彩" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <h3>編輯色彩{target ? ` [${target.name}]` : ''}</h3>
          <button className="geo-close" onClick={onClose} aria-label="關閉">×</button>
        </div>
        {!target ? (
          <div className="ce-msg">{message}</div>
        ) : (
          <>
            <div className="ce-body">
              <div className="ce-col">
                <div className="ce-h">選擇資料項（{items.length} 項；Ctrl／Shift 可多選）</div>
                <input className="ce-search" placeholder="搜尋…" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="ce-list">
                  {shown.map((x) => (
                    <div key={x.v} className={`ce-item${sel.has(x.v) ? ' on' : ''}`} onClick={(e) => click(x.v, e)}>
                      <span className="ce-sw" style={{ background: x.color }} />
                      <span className="ce-name">{x.v}</span>
                    </div>
                  ))}
                  {items.length > shown.length && <div className="hint">只顯示前 {shown.length} 項，請用搜尋縮小範圍</div>}
                </div>
              </div>
              <div className="ce-col">
                <div className="ce-auto">
                  <div className="ce-h"><b>一鍵排色</b>：依度量高低自動配深淺</div>
                  {target.measures.length === 0 ? <div className="hint">這份資料沒有數值欄位。</div> : (
                    <>
                      <div className="ce-row">
                        <select value={mea} onChange={(e) => setMea(e.target.value)} aria-label="度量">
                          {target.measures.map((m) => <option key={m.fid} value={m.fid}>{m.name}</option>)}
                        </select>
                        <select value={agg} onChange={(e) => setAgg(e.target.value as Agg)} aria-label="彙總">
                          <option value="sum">加總</option><option value="mean">平均</option><option value="count">筆數</option>
                        </select>
                      </div>
                      <div className="ce-row">
                        <select value={ramp} onChange={(e) => setRamp(e.target.value)} aria-label="色帶">
                          {Object.keys(AUTO_RAMPS).map((k) => <option key={k}>{k}</option>)}
                        </select>
                        <span className="ce-ramp" style={{ background: `linear-gradient(to right, ${[0, .25, .5, .75, 1].map((t) => rampAt(AUTO_RAMPS[ramp], rev ? 1 - t : t)).join(',')})` }} title="低 → 高" />
                      </div>
                      <div className="ce-row">
                        <select value={mode} onChange={(e) => setMode(e.target.value as 'rank' | 'value')} aria-label="分布方式">
                          <option value="rank">依名次（深淺平均分布）</option><option value="value">依數值比例</option>
                        </select>
                        <label className="ce-custom"><input type="checkbox" checked={rev} onChange={(e) => setRev(e.target.checked)} />反轉</label>
                      </div>
                      <button className="mini pri" onClick={auto}>一鍵排色</button>
                    </>
                  )}
                </div>
                <div className="ce-h">或手動：選取色彩調色盤</div>
                <select value={pal} onChange={(e) => setPal(e.target.value)}>
                  {Object.keys(PALETTES).map((k) => <option key={k}>{k}</option>)}
                </select>
                <div className="ce-grid">
                  {PALETTES[pal].map((c, i) => (
                    <button key={i} className="ce-cell" style={{ background: c }} title={c} onClick={() => assign(c)} />
                  ))}
                </div>
                <div className="ce-row">
                  <button className="mini" onClick={assignPalette}>指派調色盤</button>
                  <label className="ce-custom">自訂色彩…
                    <input type="color" onChange={(e) => assign(e.target.value)} disabled={sel.size === 0} />
                  </label>
                </div>
                <div className="hint">先在左邊選資料項，再點右邊的色塊指派；「指派調色盤」會依序把這組顏色套給全部資料項。</div>
              </div>
            </div>
            <div className="ce-foot">
              <button className="mini" onClick={() => { setDraft({}); setSel(new Set()); setOrder(null); }}>重設</button>
              <span style={{ flex: 1 }} />
              <button className="mini pri" onClick={() => { commit(); onClose(); }}>確定</button>
              <button className="mini" onClick={onClose}>取消</button>
              <button className="mini" onClick={commit}>套用</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
