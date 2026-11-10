import css from './leaflet.css?inline';

// graphic-walker 的地圖（Leaflet）需要 leaflet.css 才能把底圖磚與多邊形圖層定位好；它原本從 unpkg.com 載入，
// 離線（且被 CSP 擋下）時載不到 → 底圖磚散落、只看到幾塊、填色不出現（「破圖」）。
// 這裡把隨程式打包的同一份樣式，注入 graphic-walker 的每個 shadow root。
let sheet: CSSStyleSheet | null = null;
const done = new WeakSet<ShadowRoot>();

function adopt(sr: ShadowRoot): void {
  if (done.has(sr)) return;
  done.add(sr);
  try {
    if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(css); }
    sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
  } catch {
    const el = document.createElement('style');
    el.textContent = css;
    sr.appendChild(el);
  }
}

export function installLeafletCss(): void {
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) adopt(el.shadowRoot); });
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  queue();
}
