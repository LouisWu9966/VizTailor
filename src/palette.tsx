import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { GraphicWalker } from '@kanaries/graphic-walker';

type GWTheme = ComponentProps<typeof GraphicWalker>['vizThemeConfig'];
type GWScales = ComponentProps<typeof GraphicWalker>['scales'];

export type VizStyle = {
  cat: string[]; // 分類（離散）色盤
  ramp: string[]; // 連續／發散色階，2～3 個色標
  reverse: boolean;
  primary: string; // 沒有拖到「顏色」時的預設單色
  sizeMin: number; // 「大小」欄位對應的最小／最大標記面積
  sizeMax: number;
};

const CATS: Record<string, string[]> = {
  'Tableau 10': ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  色盲友善: ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#000000', '#999999', '#7f3c8d'],
  高對比: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999', '#17becf', '#111111'],
  柔和: ['#8dd3c7', '#fdb462', '#bebada', '#fb8072', '#80b1d3', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5'],
};
const RAMPS: Record<string, string[]> = {
  藍: ['#deebf7', '#08519c'],
  綠: ['#e5f5e0', '#006d2c'],
  橘: ['#fee6ce', '#a63603'],
  '橘—白—藍（發散）': ['#d95f02', '#f7f7f7', '#1f78b4'],
  '紅—黃—綠（發散）': ['#d73027', '#ffffbf', '#1a9850'],
  '紫—白—綠（發散）': ['#7b3294', '#f7f7f7', '#008837'],
};

export const DEFAULT_STYLE: VizStyle = {
  cat: CATS['Tableau 10'],
  ramp: RAMPS['藍'],
  reverse: false,
  primary: '#4e79a7',
  sizeMin: 40, // 預設標記偏小，散佈圖看不清楚；放大後點才顯眼
  sizeMax: 1200,
};

const KEY = 'viztailor.style.v1';
function load(): VizStyle {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && Array.isArray(s.cat) && Array.isArray(s.ramp)) return { ...DEFAULT_STYLE, ...s };
  } catch { /* 無痕或儲存被封鎖：用預設即可 */ }
  return DEFAULT_STYLE;
}

/** 目前的樣式 + 轉成 Graphic Walker 吃的 theme／scales（物件穩定，才不會每次 render 都重畫圖表）。 */
export function useVizStyle() {
  const [style, setStyle] = useState<VizStyle>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(style)); } catch { /* 同上 */ }
  }, [style]);

  const { theme, scales } = useMemo(() => {
    const ramp = style.reverse ? [...style.ramp].reverse() : style.ramp;
    const c = style.primary;
    const one = {
      background: 'transparent',
      range: { category: style.cat, ordinal: ramp, ramp, heatmap: ramp, diverging: ramp },
      bar: { fill: c }, circle: { fill: c }, line: { stroke: c }, point: { stroke: c },
      rect: { fill: c }, tick: { fill: c }, area: { fill: c }, arc: { fill: c },
    };
    return {
      theme: { light: one, dark: one } as unknown as GWTheme,
      scales: { size: { rangeMin: style.sizeMin, rangeMax: style.sizeMax } } as GWScales,
    };
  }, [style]);

  return { style, setStyle, theme, scales };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function Swatches({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  return (
    <div className="sw-row">
      {colors.map((c, i) => (
        <input key={i} type="color" value={c} title={c}
          onChange={(e) => onChange(colors.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
    </div>
  );
}

export function StylePanel({ style, setStyle }: { style: VizStyle; setStyle: (s: VizStyle) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const set = (p: Partial<VizStyle>) => setStyle({ ...style, ...p });
  const catName = Object.keys(CATS).find((k) => same(CATS[k], style.cat)) ?? '自訂';
  const rampName = Object.keys(RAMPS).find((k) => same(RAMPS[k], style.ramp)) ?? '自訂';
  const num = (v: string, fb: number) => (Number.isFinite(Number(v)) && v !== '' ? Math.max(1, Number(v)) : fb);

  return (
    <div className="style-wrap" ref={box}>
      <button onClick={() => setOpen(!open)}>色彩與大小</button>
      {open && (
        <div className="style-pop" role="group" aria-label="編輯色彩與大小">
          <h3>編輯色彩</h3>
          <label>分類色盤（文字／類別欄位）</label>
          <select value={catName} onChange={(e) => CATS[e.target.value] && set({ cat: CATS[e.target.value] })}>
            {Object.keys(CATS).map((k) => <option key={k}>{k}</option>)}
            {catName === '自訂' && <option>自訂</option>}
          </select>
          <Swatches colors={style.cat} onChange={(cat) => set({ cat })} />

          <label>連續／發散色階（數值欄位，例如 Profit）</label>
          <select value={rampName} onChange={(e) => RAMPS[e.target.value] && set({ ramp: RAMPS[e.target.value] })}>
            {Object.keys(RAMPS).map((k) => <option key={k}>{k}</option>)}
            {rampName === '自訂' && <option>自訂</option>}
          </select>
          <div className="sw-line">
            <Swatches colors={style.ramp} onChange={(ramp) => set({ ramp })} />
            <button className="mini" onClick={() => set({ ramp: style.ramp.length === 3 ? [style.ramp[0], style.ramp[2]] : [style.ramp[0], '#f7f7f7', style.ramp[1]] })}>
              {style.ramp.length === 3 ? '移除中間色' : '加入中間色'}
            </button>
            <label className="chk"><input type="checkbox" checked={style.reverse} onChange={(e) => set({ reverse: e.target.checked })} />反轉</label>
          </div>

          <label>預設單色（沒有放「顏色」時）</label>
          <div className="sw-row"><input type="color" value={style.primary} onChange={(e) => set({ primary: e.target.value })} /></div>

          <h3>大小</h3>
          <label>「大小」欄位的標記面積：最小／最大（越大越顯眼）</label>
          <div className="sw-line">
            <input type="number" min={1} step={10} value={style.sizeMin} onChange={(e) => set({ sizeMin: num(e.target.value, style.sizeMin) })} />
            <span>～</span>
            <input type="number" min={1} step={50} value={style.sizeMax} onChange={(e) => set({ sizeMax: num(e.target.value, style.sizeMax) })} />
          </div>

          <div className="sw-line">
            <button className="mini" onClick={() => setStyle(DEFAULT_STYLE)}>還原預設</button>
            <span className="hint">會套用到所有圖表（含地圖），並記住設定。</span>
          </div>
        </div>
      )}
    </div>
  );
}
