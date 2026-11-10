import Papa from 'papaparse';

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type FieldMeta = {
  fid: string;
  name: string;
  semanticType: 'quantitative' | 'nominal' | 'temporal';
  analyticType: 'dimension' | 'measure';
  geoRole?: 'longitude' | 'latitude' | 'none';
};
export type Dataset = { id: number; name: string; rows: Row[]; fields: FieldMeta[]; notes?: string[] };

// UTF-8 first (strict); Taiwanese Excel often saves CSV as Big5/CP950, so fall back to it.
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('big5').decode(buf);
  }
}

const NUM_RE = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const pad = (s: string | number) => String(s).padStart(2, '0');
const CUR = /^(-?)\s*(?:NT\$|NTD|TWD|US\$|USD|HK\$|RMB|CNY|JPY|[$¥€£])\s*/i;

const isPct = (raw: string) => /[%％]\s*$/.test(raw.trim());

/** 數字：支援千分位（須是正確的 1,234 形式）、貨幣符號（$、NT$、元…）、結尾 %、全形數字、(1,200) 負數。 */
function asNumber(raw: string): number | null {
  let s = raw.normalize('NFKC').trim();
  let neg = false;
  const par = /^\((.*)\)$/.exec(s);
  if (par) { neg = true; s = par[1].trim(); }
  s = s.replace(CUR, '$1').replace(/\s*(?:%|元|圓|NTD|TWD|USD)$/i, '').trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (s.includes(',')) return null; // "1,2,3" 這種清單不是數字
  if (!NUM_RE.test(s)) return null;
  // keep IDs like "007" or phone numbers as text
  if (/^-?0\d/.test(s) && !s.includes('.')) return null;
  const n = Number(s);
  return neg ? -n : n;
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function monthOf(w: string): number | null {
  const x = w.toLowerCase();
  if (x.length < 3) return null;
  const i = MONTH_NAMES.findIndex((m) => m.startsWith(x) || (x === 'sept' && m === 'september'));
  return i < 0 ? null : i + 1;
}

function ymd(y: number, m: number, d: number, h?: string, mi?: string, sec?: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null; // 例如 2 月 30 日
  const day = `${y}-${pad(m)}-${pad(d)}`;
  if (h === undefined) return day;
  if (+h > 23 || +mi! > 59 || (sec !== undefined && +sec > 59)) return null;
  return `${day} ${pad(h)}:${mi}:${sec ?? '00'}`;
}

const T = '(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?';
const RE_ISO = new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${T}$`);
const RE_CJK = new RegExp(`^(\\d{4})年(\\d{1,2})月(\\d{1,2})日?${T}$`);
const RE_ROC_CJK = new RegExp(`^民國\\s*(\\d{1,3})年(\\d{1,2})月(\\d{1,2})日?${T}$`);
const RE_ROC = new RegExp(`^(1\\d\\d)[-/.](\\d{1,2})[-/.](\\d{1,2})${T}$`);
const RE_SLASH = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})${T}$`);
const RE_DMON = new RegExp(`^(\\d{1,2})[- ]([A-Za-z]{3,9})\\.?[- ,]*(\\d{4})${T}$`);
const RE_MOND = new RegExp(`^([A-Za-z]{3,9})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})${T}$`);

export type DateOrder = 'mdy' | 'dmy';
export type DateKind = 'iso' | 'roc' | 'slash' | 'other';

/** 轉成 YYYY-MM-DD[ HH:mm:ss]；認不得就回 null。order：像 03/04/2025 這種寫法先月後日（mdy）或先日後月（dmy）。 */
function parseDate(raw: string, order: DateOrder = 'mdy'): { v: string; kind: DateKind } | null {
  const s = raw.normalize('NFKC').trim();
  let m: RegExpExecArray | null;
  const out = (v: string | null, kind: DateKind) => (v ? { v, kind } : null);
  if ((m = RE_ISO.exec(s))) return out(ymd(+m[1], +m[2], +m[3], m[4], m[5], m[6]), 'iso');
  if ((m = RE_CJK.exec(s))) return out(ymd(+m[1], +m[2], +m[3], m[4], m[5], m[6]), 'iso');
  if ((m = RE_ROC_CJK.exec(s))) return out(ymd(+m[1] + 1911, +m[2], +m[3], m[4], m[5], m[6]), 'roc');
  if ((m = RE_ROC.exec(s))) return out(ymd(+m[1] + 1911, +m[2], +m[3], m[4], m[5], m[6]), 'roc');
  if ((m = RE_SLASH.exec(s))) {
    const [a, b] = [+m[1], +m[2]];
    return out(order === 'mdy' ? ymd(+m[3], a, b, m[4], m[5], m[6]) : ymd(+m[3], b, a, m[4], m[5], m[6]), 'slash');
  }
  if ((m = RE_DMON.exec(s))) { const mo = monthOf(m[2]); return mo ? out(ymd(+m[3], mo, +m[1], m[4], m[5], m[6]), 'other') : null; }
  if ((m = RE_MOND.exec(s))) { const mo = monthOf(m[1]); return mo ? out(ymd(+m[3], mo, +m[2], m[4], m[5], m[6]), 'other') : null; }
  return null;
}

/** 看整欄的 aa/bb/yyyy：有第一位 >12 → 日/月；有第二位 >12 → 月/日；都沒有就是無法判斷（預設月/日）。 */
function slashOrder(values: string[]): { order: DateOrder; ambiguous: boolean; any: boolean } {
  let first = false, second = false, any = false;
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/.exec(v.normalize('NFKC').trim());
    if (!m) continue;
    any = true;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  if (first && !second) return { order: 'dmy', ambiguous: false, any };
  if (second && !first) return { order: 'mdy', ambiguous: false, any };
  return { order: 'mdy', ambiguous: any && !first && !second, any };
}

const DATE_HEAD = /date|time|日期|時間|日$/i;
const ID_HEAD = /(^|[\s_\-.(（])(id|code|zip|postal)([\s_\-.)）]|$)|編號|代碼|代號|郵遞區號|序號|流水號/i;
const YMD8 = (v: string) => /^\d{8}$/.test(v) && ymd(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8)) !== null;
const serialToDay = (n: number) => { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };

const isBlank = (v: Cell) => v === null || (typeof v === 'string' && v.trim() === '');

/**
 * matrix: raw rows (CSV or one Excel sheet). The header row is the first row that is
 * "wide enough" (>= 60% of the widest of the first 20 rows), so title lines above a table are skipped.
 */
export function buildDataset(name: string, matrix: Cell[][], id: number): Dataset {
  const nonEmpty = matrix.filter((r) => r.some((v) => !isBlank(v)));
  const count = (r: Cell[]) => r.reduce<number>((n, v) => n + (isBlank(v) ? 0 : 1), 0);
  const widest = Math.max(0, ...nonEmpty.slice(0, 20).map(count));
  const hi = nonEmpty.findIndex((r) => count(r) >= widest * 0.6);
  if (hi < 0 || nonEmpty.length - hi < 2) throw new Error('沒有可用的資料列（至少需要 1 列標題 + 1 列資料）');

  const head = nonEmpty[hi];
  const body = nonEmpty.slice(hi + 1);
  const width = Math.max(head.length, ...body.map((r) => r.length));

  const seen = new Map<string, number>();
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    const base = String(head[i] ?? '').trim() || `col_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    names.push(n === 1 ? base : `${base}_${n}`);
  }

  const notes: string[] = [];
  const idCols: string[] = [];
  const conv: ((v: Cell) => Cell)[] = [];
  const fields: FieldMeta[] = names.map((h, i) => {
    const cells = body.map((r) => r[i] ?? null).filter((v) => !isBlank(v)) as (string | number)[];
    const texts = cells.map((v) => String(v));
    const n = cells.length;
    const ratio = (k: number) => (n > 0 ? k / n : 0);
    const hint = DATE_HEAD.test(h);
    const so = slashOrder(texts);
    const dated = (v: string | number) => typeof v === 'string' && parseDate(v, so.order) !== null;

    // 日期（文字寫法）
    if (ratio(cells.filter(dated).length) >= 0.95) {
      const kinds = new Set(texts.map((t) => parseDate(t, so.order)?.kind));
      if (kinds.has('roc')) notes.push(`欄位「${h}」的民國年已換算成西元年。`);
      if (so.any && so.order === 'dmy') notes.push(`欄位「${h}」的日期依內容判定為「日/月/年」。`);
      if (so.ambiguous) notes.push(`欄位「${h}」的日期（例如 ${texts.find((t) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(t))}）無法判斷是「月/日」或「日/月」，目前以「月/日/年」處理。`);
      conv[i] = (v) => (v === null ? null : (parseDate(String(v), so.order)?.v ?? String(v)));
      return { fid: h, name: h, semanticType: 'temporal', analyticType: 'dimension' };
    }
    // 欄名看起來是日期：20251128、Excel 日期序號
    if (hint && ratio(texts.filter(YMD8).length) >= 0.95) {
      conv[i] = (v) => (v === null ? null : String(v).length === 8 && YMD8(String(v)) ? ymd(+String(v).slice(0, 4), +String(v).slice(4, 6), +String(v).slice(6, 8)) : String(v));
      return { fid: h, name: h, semanticType: 'temporal', analyticType: 'dimension' };
    }
    if (hint && ratio(cells.filter((v) => typeof v === 'number' && Number.isInteger(v) && v >= 20000 && v <= 60000).length) >= 0.95) {
      conv[i] = (v) => (typeof v === 'number' ? (serialToDay(v) ?? String(v)) : v === null ? null : String(v));
      return { fid: h, name: h, semanticType: 'temporal', analyticType: 'dimension' };
    }
    // 數字
    const nums = cells.map((v) => (typeof v === 'number' ? v : asNumber(v)));
    if (ratio(nums.filter((x) => x !== null).length) >= 0.95) {
      if (ID_HEAD.test(h) && nums.every((x) => x === null || Number.isInteger(x))) {
        idCols.push(h);
        conv[i] = (v) => (v === null ? null : String(v));
        return { fid: h, name: h, semanticType: 'nominal', analyticType: 'dimension' };
      }
      if (texts.some(isPct)) notes.push(`欄位「${h}」的 % 已移除，數值以百分點表示（12% → 12）。`);
      conv[i] = (v) => (v === null ? null : typeof v === 'number' ? v : asNumber(v));
      return { fid: h, name: h, semanticType: 'quantitative', analyticType: 'measure' };
    }
    conv[i] = (v) => (v === null ? null : String(v).trim());
    return { fid: h, name: h, semanticType: 'nominal', analyticType: 'dimension' };
  });
  if (idCols.length) notes.push(`欄位${idCols.map((c) => `「${c}」`).join('')}看起來是編號，已當成維度（文字）處理，不會被加總。`);

  const rows: Row[] = body.map((r) => {
    const out: Row = {};
    fields.forEach((f, i) => {
      const v = r[i] ?? null;
      out[f.fid] = isBlank(v) ? null : conv[i](v);
    });
    return out;
  });

  return { id, name, rows, fields, notes };
}

export function parseCsv(name: string, buf: ArrayBuffer, id: number): Dataset {
  const res = Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: 'greedy' });
  return buildDataset(name, res.data as Cell[][], id);
}
