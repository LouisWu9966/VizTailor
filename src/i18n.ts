import * as OpenCC from 'opencc-js';
// Relative path on purpose: the package "exports" map does not expose its locale JSON files.
import zhCN from '../node_modules/@kanaries/graphic-walker/dist/locales/zh-CN.json';

// graphic-walker ships en / zh-CN / ja only. We derive Traditional Chinese (Taiwan wording)
// from the zh-CN bundle at startup, then fix a few terms to match Tableau's zh-TW naming.
const toTW = OpenCC.Converter({ from: 'cn', to: 'twp' });

const FIXES: [string, string][] = [
  ['拖拽', '拖曳'],
  ['字段', '欄位'],
  ['可視化', '視覺化'],
  ['堆疊條形圖', '堆疊長條圖'],
  ['並列條形圖', '並列長條圖'],
  ['條形圖', '長條圖'],
  ['散點圖', '散佈圖'],
  ['餅圖', '圓餅圖'],
  ['箱線圖', '箱形圖'],
  ['文本表', '文字表'],
  ['高亮表', '醒目提示表'],
  // opencc 沒轉到的大陸用語／技術用語 → 台灣慣用
  ['型別', '類型'],
  ['質量', '品質'],
  ['反饋', '回饋'],
  ['當前', '目前'],
  ['匹配', '符合'],
  ['點擊', '點選'],
  ['語義', '語意'],
  ['方差', '變異數'],
  ['均值', '平均值'],
  ['行數', '列數'],
];

// 依鍵名整句覆蓋：Tableau 繁中的命名（欄＝columns、列＝rows），以及 zh-CN 語言檔缺漏／筆誤的鍵
const KEY_OVERRIDES: Record<string, string> = {
  'constant.draggable_key.columns': '欄',
  'constant.draggable_key.rows': '列',
  'constant.draggable_key.details': '詳細資料',
  'constant.draggable_key.text': '文字',
  'constant.mark_type.text': '文字',
  'constant.mark_type.bar': '長條圖',
  'constant.mark_type.point': '散佈圖',
  'constant.mark_type.tick': '刻度',
  'constant.mark_type.boxplot': '箱形圖',
  'constant.aggregator.sum': '總計',
  'field_menu.semantic_type.types.quantitative': '定量',
  'config.type': '比例尺類型', // zh-CN 缺
  'field_menu.drill.levels.weekday': '星期幾', // zh-CN 鍵名拼成 weekdat
  'main.tabpanel.askviz.placeholder': '想從資料集畫出什麼圖表？', // zh-CN 缺
};

function convert(v: unknown, path = ''): unknown {
  if (typeof v === 'string') {
    if (KEY_OVERRIDES[path]) return KEY_OVERRIDES[path];
    let s = toTW(v);
    for (const [a, b] of FIXES) s = s.split(a).join(b);
    // 台灣用「」『』，不用簡體式的 “ ” ‘ ’
    return s.replace(/“([^”]*)”/g, '「$1」').replace(/‘([^’]*)’/g, '『$1』');
  }
  if (Array.isArray(v)) return v.map((x, i) => convert(x, `${path}.${i}`));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x, path ? `${path}.${k}` : k)]));
  }
  return v;
}

// 補上 zh-CN 語言檔沒有、但被覆蓋表指定的鍵
function fillMissing(res: Record<string, unknown>) {
  for (const [path, text] of Object.entries(KEY_OVERRIDES)) {
    const keys = path.split('.');
    let o = res;
    for (const k of keys.slice(0, -1)) o = ((o[k] as Record<string, unknown>) ??= {});
    o[keys[keys.length - 1]] ??= text;
  }
  return res;
}

export const I18N_LANG = 'zh-TW';
export const i18nResources: Record<string, Record<string, unknown>> = {
  [I18N_LANG]: fillMissing(convert(zhCN) as Record<string, unknown>),
};
