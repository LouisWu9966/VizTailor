// Tableau 風格的計算欄位運算式：自寫的小型解析器，不依賴任何套件，也不用 eval / new Function。
// 語法：[欄位] 或 [@參數]、數字、"文字"、TRUE/FALSE/NULL、+ - * / % ^、= == != <> < <= > >=、AND/OR/NOT、
//       IF…THEN…ELSEIF…ELSE…END、CASE x WHEN v THEN r … ELSE d END、函式（見 FUNCS）、// 單行註解。
export type Value = number | string | boolean | null;
export type Ctx = { row: Record<string, Value>; params: Record<string, Value> };
type Fn = (c: Ctx) => Value;

export class CalcError extends Error {
  pos: number;
  constructor(msg: string, pos = 0) { super(msg); this.pos = pos; }
}

type Tok = { t: 'num' | 'str' | 'id' | 'field' | 'op' | 'end'; v: string; pos: number };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '[') {
      const j = src.indexOf(']', i + 1);
      if (j < 0) throw new CalcError('少了結尾的 ]', i);
      out.push({ t: 'field', v: src.slice(i + 1, j).trim(), pos: i });
      i = j + 1; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < n) j++;
        s += src[j++];
      }
      if (j >= n) throw new CalcError('文字少了結尾的引號', i);
      out.push({ t: 'str', v: s, pos: i });
      i = j + 1; continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: num[0], pos: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_㐀-鿿][A-Za-z0-9_㐀-鿿]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0], pos: i }); i += id[0].length; continue; }
    const op = /^(<>|<=|>=|==|!=|[-+*/%^=<>(),])/.exec(src.slice(i));
    if (op) { out.push({ t: 'op', v: op[0], pos: i }); i += op[0].length; continue; }
    throw new CalcError(`無法辨識的字元「${c}」`, i);
  }
  out.push({ t: 'end', v: '', pos: n });
  return out;
}

const isNum = (v: Value): v is number => typeof v === 'number' && Number.isFinite(v);
const numOut = (x: number): Value => (Number.isFinite(x) ? x : null);

function toDate(v: Value): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
const str = (v: Value): string | null => (v === null ? null : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
const dpart = (f: (d: Date) => number) => (a: Value[]): Value => { const d = toDate(a[0]); return d ? f(d) : null; };

const num1 = (f: (x: number) => number) => (a: Value[]) => (isNum(a[0]) ? numOut(f(a[0])) : null);
const txt1 = (f: (s: string) => Value) => (a: Value[]) => { const s = str(a[0]); return s === null ? null : f(s); };

// 函式表：name -> [最少參數, 最多參數, 實作]；預設任何參數為 NULL 就回傳 NULL（例外會特別處理）
const FUNCS: Record<string, [number, number, (a: Value[]) => Value, boolean?]> = {
  ABS: [1, 1, num1(Math.abs)], SQRT: [1, 1, num1(Math.sqrt)], EXP: [1, 1, num1(Math.exp)], LN: [1, 1, num1(Math.log)],
  SIGN: [1, 1, num1(Math.sign)], FLOOR: [1, 1, num1(Math.floor)], CEILING: [1, 1, num1(Math.ceil)],
  INT: [1, 1, num1(Math.trunc)],
  LOG: [1, 2, (a) => (isNum(a[0]) ? numOut(Math.log(a[0]) / Math.log(isNum(a[1]) ? a[1] : 10)) : null)],
  POWER: [2, 2, (a) => (isNum(a[0]) && isNum(a[1]) ? numOut(Math.pow(a[0], a[1])) : null)],
  ROUND: [1, 2, (a) => {
    if (!isNum(a[0])) return null;
    const k = 10 ** (isNum(a[1]) ? a[1] : 0);
    return numOut(Math.round(a[0] * k) / k);
  }],
  MIN: [2, 8, (a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (x! < m! ? x : m)))],
  MAX: [2, 8, (a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (x! > m! ? x : m)))],
  FLOAT: [1, 1, (a) => { const n = typeof a[0] === 'string' ? Number(a[0]) : a[0]; return isNum(n as Value) ? (n as number) : null; }],
  STR: [1, 1, (a) => str(a[0])],
  LEN: [1, 1, txt1((s) => s.length)], UPPER: [1, 1, txt1((s) => s.toUpperCase())], LOWER: [1, 1, txt1((s) => s.toLowerCase())],
  TRIM: [1, 1, txt1((s) => s.trim())],
  LEFT: [2, 2, (a) => (typeof a[0] === 'string' && isNum(a[1]) ? a[0].slice(0, Math.max(0, a[1])) : null)],
  RIGHT: [2, 2, (a) => (typeof a[0] === 'string' && isNum(a[1]) ? (a[1] <= 0 ? '' : a[0].slice(-a[1])) : null)],
  MID: [2, 3, (a) => {
    if (typeof a[0] !== 'string' || !isNum(a[1])) return null;
    const s = Math.max(0, a[1] - 1);
    return isNum(a[2]) ? a[0].slice(s, s + Math.max(0, a[2])) : a[0].slice(s);
  }],
  CONTAINS: [2, 2, (a) => (typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].includes(a[1]) : null)],
  STARTSWITH: [2, 2, (a) => (typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].startsWith(a[1]) : null)],
  ENDSWITH: [2, 2, (a) => (typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].endsWith(a[1]) : null)],
  REPLACE: [3, 3, (a) => (typeof a[0] === 'string' && typeof a[1] === 'string' && typeof a[2] === 'string' ? a[0].split(a[1]).join(a[2]) : null)],
  YEAR: [1, 1, dpart((d) => d.getUTCFullYear())], MONTH: [1, 1, dpart((d) => d.getUTCMonth() + 1)],
  DAY: [1, 1, dpart((d) => d.getUTCDate())], QUARTER: [1, 1, dpart((d) => Math.floor(d.getUTCMonth() / 3) + 1)],
  DATEDIFF: [3, 3, (a) => {
    const u = typeof a[0] === 'string' ? a[0].toLowerCase() : '';
    const x = toDate(a[1]), y = toDate(a[2]);
    if (!x || !y) return null;
    if (u === 'day') return Math.round((y.getTime() - x.getTime()) / 86400000);
    if (u === 'month') return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
    if (u === 'year') return y.getUTCFullYear() - x.getUTCFullYear();
    return null;
  }],
  // 以下函式要看 NULL，不套用「有 NULL 就回 NULL」
  ISNULL: [1, 1, (a) => a[0] === null, true],
  IFNULL: [2, 2, (a) => (a[0] === null ? a[1] : a[0]), true],
  ZN: [1, 1, (a) => (a[0] === null ? 0 : a[0]), true],
  IIF: [3, 4, (a) => (a[0] === true ? a[1] : a[0] === false ? a[2] : (a[3] ?? null)), true],
};
export const FUNCTION_NAMES = Object.keys(FUNCS).sort();

function cmp(op: string, a: Value, b: Value): Value {
  if (a === null || b === null) return null;
  if (typeof a !== typeof b) return op === '!=' || op === '<>' ? true : op === '=' || op === '==' ? false : null;
  switch (op) {
    case '=': case '==': return a === b;
    case '!=': case '<>': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    default: return a >= b;
  }
}

function arith(op: string, a: Value, b: Value): Value {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
    const x = str(a), y = str(b);
    return x === null || y === null ? null : x + y;
  }
  if (!isNum(a) || !isNum(b)) return null;
  switch (op) {
    case '+': return numOut(a + b);
    case '-': return numOut(a - b);
    case '*': return numOut(a * b);
    case '/': return b === 0 ? null : numOut(a / b);
    case '%': return b === 0 ? null : numOut(a % b);
    default: return numOut(Math.pow(a, b));
  }
}

const KEYWORDS = new Set(['IF', 'THEN', 'ELSEIF', 'ELSE', 'END', 'CASE', 'WHEN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'NULL']);
const BIN: Record<string, [number, boolean]> = { // op -> [優先順序, 右結合]
  OR: [1, false], AND: [2, false],
  '=': [4, false], '==': [4, false], '!=': [4, false], '<>': [4, false], '<': [4, false], '<=': [4, false], '>': [4, false], '>=': [4, false],
  '+': [5, false], '-': [5, false], '*': [6, false], '/': [6, false], '%': [6, false], '^': [8, true],
};

export type Compiled = { run: (row: Record<string, Value>, params: Record<string, Value>) => Value; fields: string[]; params: string[] };

/** 解析並編譯；找不到欄位／參數、語法錯誤都會丟出 CalcError（含字元位置）。 */
export function compile(src: string, known: { fields: Iterable<string>; params: Iterable<string> }): Compiled {
  const fieldSet = new Set(known.fields), paramSet = new Set(known.params);
  const usedF = new Set<string>(), usedP = new Set<string>();
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const kw = (t: Tok) => (t.t === 'id' ? t.v.toUpperCase() : '');
  const isKw = (w: string) => kw(peek()) === w;
  const take = () => toks[p++];
  const expectKw = (w: string) => { if (!isKw(w)) throw new CalcError(`這裡應該要有 ${w}`, peek().pos); p++; };
  const expectOp = (o: string) => { const t = peek(); if (t.t !== 'op' || t.v !== o) throw new CalcError(`這裡應該要有「${o}」`, t.pos); p++; };

  function binOp(): [string, number, boolean] | null {
    const t = peek();
    const key = t.t === 'op' ? t.v : kw(t);
    const e = BIN[key];
    return e ? [key, e[0], e[1]] : null;
  }

  function expr(minPrec: number): Fn {
    let left = unary();
    for (;;) {
      const b = binOp();
      if (!b || b[1] < minPrec) return left;
      take();
      const right = expr(b[2] ? b[1] : b[1] + 1);
      const [op] = b, l = left, r = right;
      left =
        op === 'AND' ? (c) => { const x = l(c), y = r(c); return x === false || y === false ? false : x === null || y === null ? null : true; }
        : op === 'OR' ? (c) => { const x = l(c), y = r(c); return x === true || y === true ? true : x === null || y === null ? null : false; }
        : BIN[op][0] === 4 ? (c) => cmp(op, l(c), r(c))
        : (c) => arith(op, l(c), r(c));
    }
  }

  function unary(): Fn {
    const t = peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      take();
      const f = expr(7);
      return t.v === '-' ? (c) => { const v = f(c); return isNum(v) ? -v : null; } : f;
    }
    if (isKw('NOT')) {
      take();
      const f = expr(3);
      return (c) => { const v = f(c); return typeof v === 'boolean' ? !v : null; };
    }
    return primary();
  }

  function primary(): Fn {
    const t = take();
    if (t.t === 'num') { const n = Number(t.v); return () => n; }
    if (t.t === 'str') { const s = t.v; return () => s; }
    if (t.t === 'field') return ref(t);
    if (t.t === 'op' && t.v === '(') { const f = expr(0); expectOp(')'); return f; }
    if (t.t === 'id') {
      const k = t.v.toUpperCase();
      if (k === 'TRUE') return () => true;
      if (k === 'FALSE') return () => false;
      if (k === 'NULL') return () => null;
      if (k === 'IF') return ifExpr();
      if (k === 'CASE') return caseExpr();
      if (KEYWORDS.has(k)) throw new CalcError(`這裡不能放 ${k}`, t.pos);
      return call(t, k);
    }
    throw new CalcError(t.t === 'end' ? '運算式在這裡就結束了，後面還缺東西' : `看不懂「${t.v}」`, t.pos);
  }

  function ref(t: Tok): Fn {
    const name = t.v;
    if (name.startsWith('@')) {
      const pn = name.slice(1).trim();
      if (!paramSet.has(pn)) throw new CalcError(`找不到參數「${pn}」`, t.pos);
      usedP.add(pn);
      return (c) => c.params[pn] ?? null;
    }
    if (fieldSet.has(name)) { usedF.add(name); return (c) => c.row[name] ?? null; }
    if (paramSet.has(name)) { usedP.add(name); return (c) => c.params[name] ?? null; }
    throw new CalcError(`找不到欄位或參數「${name}」`, t.pos);
  }

  function ifExpr(): Fn {
    const branches: [Fn, Fn][] = [];
    let other: Fn = () => null;
    for (;;) {
      const cond = expr(0);
      expectKw('THEN');
      branches.push([cond, expr(0)]);
      if (isKw('ELSEIF')) { take(); continue; }
      if (isKw('ELSE')) { take(); other = expr(0); }
      expectKw('END');
      break;
    }
    return (c) => { for (const [k, v] of branches) if (k(c) === true) return v(c); return other(c); };
  }

  function caseExpr(): Fn {
    const subject = expr(0);
    const whens: [Fn, Fn][] = [];
    let other: Fn = () => null;
    while (isKw('WHEN')) {
      take();
      const w = expr(0);
      expectKw('THEN');
      whens.push([w, expr(0)]);
    }
    if (whens.length === 0) throw new CalcError('CASE 後面至少要有一個 WHEN', peek().pos);
    if (isKw('ELSE')) { take(); other = expr(0); }
    expectKw('END');
    return (c) => { const s = subject(c); for (const [w, r] of whens) if (cmp('=', s, w(c)) === true) return r(c); return other(c); };
  }

  function call(t: Tok, name: string): Fn {
    const def = FUNCS[name];
    if (!def) throw new CalcError(`不認得的函式或關鍵字「${t.v}」`, t.pos);
    expectOp('(');
    const args: Fn[] = [];
    if (!(peek().t === 'op' && peek().v === ')')) {
      for (;;) {
        args.push(expr(0));
        if (peek().t === 'op' && peek().v === ',') { take(); continue; }
        break;
      }
    }
    expectOp(')');
    const [lo, hi, impl, raw] = def;
    if (args.length < lo || args.length > hi) throw new CalcError(`${name} 需要 ${lo === hi ? lo : `${lo}～${hi}`} 個參數，目前是 ${args.length} 個`, t.pos);
    return (c) => {
      const a = args.map((f) => f(c));
      if (!raw && a.some((x) => x === null)) return null;
      return impl(a);
    };
  }

  const root = expr(0);
  if (peek().t !== 'end') throw new CalcError(`多出來的內容「${peek().v}」`, peek().pos);
  return { run: (row, params) => root({ row, params }), fields: [...usedF], params: [...usedP] };
}
