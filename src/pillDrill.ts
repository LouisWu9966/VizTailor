// 在 Graphic Walker 的「欄／列／顏色…」欄位膠囊上，替日期欄位加一個 ▾，點開直接選 年／季度／月／週／日…
// （像 Tableau：就地換成該粒度，不必到左側欄位清單的選單裡再拖一次）。
// Graphic Walker 在 shadow DOM 裡，沒有提供擴充膠囊的 API，所以這裡用 MutationObserver 補上按鈕，
// 實際換欄位則是匯出圖表 → 修改 → 匯入（與 calc/sync.ts 同一套做法）。版本固定在 0.5.3，升級時要重新確認。
import type { VizSpecStore } from '@kanaries/graphic-walker';

const LEVELS = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second'] as const;
type Level = (typeof LEVELS)[number];
const LABEL: Record<Level, string> = { year: '年', quarter: '季度', month: '月', week: '週', day: '日', hour: '時', minute: '分', second: '秒' };

type Param = { type: string; value: unknown };
type VField = {
  fid: string; name: string; semanticType: string; analyticType: string; aggName?: string; offset?: number;
  expression?: { op: string; params: Param[] };
};
type Chart = { encodings: Record<string, VField[]> };

const CSS = `
.vt-drill{margin-left:4px;padding:0 3px;border:0;background:transparent;color:inherit;font-size:10px;line-height:1;cursor:pointer;opacity:.8;border-radius:3px}
.vt-drill:hover{opacity:1;background:rgba(127,127,127,.25)}
.vt-pop{position:fixed;z-index:99999;min-width:150px;padding:4px;background:#fff;color:#1c2733;border:1px solid #c4cfdb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);font:13px "Microsoft JhengHei","Segoe UI",sans-serif}
.vt-it{padding:5px 12px 5px 24px;border-radius:5px;cursor:pointer;position:relative;white-space:nowrap}
.vt-it:hover{background:#eef2f7}
.vt-it.on::before{content:"✓";position:absolute;left:8px}
.vt-sep{height:1px;margin:4px 2px;background:#e3e8ee}
`;

const drillParam = (f: VField, name: string) => f.expression?.params.find((p) => p.type === name)?.value;
const isDrilled = (f: VField) => f.expression?.op === 'dateTimeDrill';

/** 膠囊的 data-rbd-draggable-id：多欄位容器是 encode_<通道>_<序號>_<欄位>，單欄位容器是 encode_<通道>_<欄位>。 */
export function locate(pill: Pick<Element, 'getAttribute'>): { channel: string; index: number } | null {
  const id = pill.getAttribute('data-rbd-draggable-id') ?? '';
  let m = /^encode_([A-Za-z]+)_(\d+)_/.exec(id);
  if (m) return { channel: m[1], index: +m[2] };
  m = /^encode_([A-Za-z]+)_/.exec(id);
  return m ? { channel: m[1], index: 0 } : null;
}

export function apply(store: VizSpecStore, channel: string, index: number, level: Level | null, sampleOf?: (fid: string) => unknown) {
  const at = store.visIndex;
  const charts = JSON.parse(JSON.stringify(store.exportCode())) as Chart[];
  const e = charts[at]?.encodings;
  const cur = e?.[channel]?.[index];
  if (!e || !cur || channel === 'filters') return;

  const originFid = isDrilled(cur) ? String(drillParam(cur, 'field')) : cur.fid;
  const origin = [...e.dimensions, ...e.measures].find((f) => f.fid === originFid);
  if (!origin) return;

  if (level === null) {
    e[channel][index] = { ...origin };
  } else {
    const home = origin.analyticType === 'dimension' ? 'dimensions' : 'measures';
    let nf = e[home].find((f) => isDrilled(f) && drillParam(f, 'field') === originFid && drillParam(f, 'value') === level);
    if (!nf) {
      const sample = JSON.parse(JSON.stringify(store.meta.find((m) => m.fid === originFid) ?? {})) as { offset?: number };
      const withTime = /\d:\d\d/.test(String(sampleOf?.(originFid) ?? ''));
      const fid = 'vt_' + Math.random().toString(36).slice(2, 10);
      nf = {
        fid, name: `${LABEL[level]} (${origin.name})`, semanticType: 'temporal', analyticType: origin.analyticType, aggName: 'sum',
        computed: true, timeUnit: level,
        expression: {
          op: 'dateTimeDrill', as: fid,
          params: [
            { type: 'field', value: originFid }, { type: 'value', value: level },
            { type: 'format', value: withTime ? '%Y-%m-%d %H:%M:%S' : '%Y-%m-%d' },
            { type: 'offset', value: sample.offset ?? origin.offset ?? new Date().getTimezoneOffset() },
          ],
        },
      } as VField;
      e[home].push(nf);
    }
    e[channel][index] = { ...nf };
  }
  store.importCode(charts as never);
  store.visIndex = at;
}

/** 回傳解除函式。getStore 在點擊時才呼叫（GW 掛載後 storeRef 才有值）。 */
export function installPillDrill(stage: HTMLElement, getStore: () => VizSpecStore | null, sampleOf?: (fid: string) => unknown): () => void {
  let shadow: ShadowRoot | null = null;
  let obs: MutationObserver | null = null;
  let popup: HTMLElement | null = null;
  let raf = 0;
  const closePopup = () => { popup?.remove(); popup = null; };

  const decorate = () => {
    raf = 0;
    const store = getStore();
    if (!shadow || !store) return;
    const enc = store.currentVis.encodings as unknown as Record<string, VField[]>;
    shadow.querySelectorAll('[data-rbd-draggable-id^="encode_"]').forEach((pill) => {
      if (pill.querySelector(':scope > .vt-drill')) return;
      const loc = locate(pill);
      const f = loc && loc.channel !== 'filters' ? enc[loc.channel]?.[loc.index] : undefined;
      if (!f || f.semanticType !== 'temporal') return;
      const btn = document.createElement('button');
      btn.className = 'vt-drill';
      btn.type = 'button';
      btn.title = '選擇日期粒度（年／季度／月／日…）';
      btn.textContent = '▾';
      for (const ev of ['mousedown', 'pointerdown', 'touchstart', 'keydown']) btn.addEventListener(ev, (x) => x.stopPropagation()); // 別觸發拖曳
      btn.addEventListener('click', (x) => { x.stopPropagation(); x.preventDefault(); openMenu(btn, pill); });
      pill.appendChild(btn);
    });
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(decorate); };

  const openMenu = (btn: HTMLElement, pill: Element) => {
    closePopup();
    const store = getStore();
    const loc = locate(pill);
    if (!shadow || !store || !loc) return;
    const f = (store.currentVis.encodings as unknown as Record<string, VField[]>)[loc.channel]?.[loc.index];
    if (!f) return;
    const cur = isDrilled(f) ? (drillParam(f, 'value') as Level) : null;
    const host = shadow.host.getBoundingClientRect(); // 宿主有 contain:layout，fixed 定位是相對宿主
    const r = btn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'vt-pop';
    pop.style.left = `${r.left - host.left}px`;
    pop.style.top = `${r.bottom - host.top + 4}px`;
    const item = (label: string, on: boolean, level: Level | null) => {
      const d = document.createElement('div');
      d.className = 'vt-it' + (on ? ' on' : '');
      d.textContent = label;
      d.addEventListener('mousedown', (x) => x.stopPropagation());
      d.addEventListener('click', (x) => { x.stopPropagation(); closePopup(); apply(store, loc.channel, loc.index, level, sampleOf); });
      return d;
    };
    for (const l of LEVELS) pop.appendChild(item(LABEL[l], cur === l, l));
    const sep = document.createElement('div'); sep.className = 'vt-sep'; pop.appendChild(sep);
    pop.appendChild(item('原始日期（不分組）', cur === null, null));
    shadow.appendChild(pop);
    popup = pop;
  };

  const onDocDown = (e: Event) => { if (popup && !e.composedPath().includes(popup)) closePopup(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePopup(); };
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);

  // Graphic Walker 的 shadow host 要等 React 掛載後才出現，所以先觀察 stage 直到找到
  const attach = () => {
    if (shadow) return;
    for (const el of stage.querySelectorAll('*')) {
      if (el.shadowRoot) {
        shadow = el.shadowRoot;
        const st = document.createElement('style');
        st.textContent = CSS;
        shadow.appendChild(st);
        obs = new MutationObserver(schedule);
        obs.observe(shadow, { childList: true, subtree: true });
        schedule();
        return;
      }
    }
  };
  const waiter = new MutationObserver(attach);
  waiter.observe(stage, { childList: true, subtree: true });
  attach();

  return () => {
    waiter.disconnect();
    obs?.disconnect();
    cancelAnimationFrame(raf);
    closePopup();
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
}
