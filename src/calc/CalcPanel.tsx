import { useEffect, useRef, useState } from 'react';
import type { FieldMeta } from '../dataset';
import { compile, FUNCTION_NAMES } from './expr';
import { describeError, type Calc, type CalcState, type Param, type ParamType } from './apply';

const uid = () => Math.random().toString(36).slice(2, 9);
const TYPE_LABEL: Record<ParamType, string> = { number: '數字', string: '文字', boolean: '布林' };

/** 參數目前值的控制項；輸入中先放在本地，停 0.2 秒才真的更新（避免拖滑桿時每一格都重畫整張圖）。 */
function ParamControl({ p, onValue }: { p: Param; onValue: (v: number | string | boolean) => void }) {
  const [local, setLocal] = useState<string | number | boolean>(p.value);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setLocal(p.value), [p.value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const commit = (v: string | number | boolean) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onValue(v), 200);
  };

  if (p.type === 'boolean') {
    return <label className="chk"><input type="checkbox" checked={local === true} onChange={(e) => { setLocal(e.target.checked); onValue(e.target.checked); }} />{local === true ? 'TRUE' : 'FALSE'}</label>;
  }
  if (p.type === 'string') {
    if (p.options && p.options.length > 0) {
      return (
        <select value={String(local)} onChange={(e) => { setLocal(e.target.value); onValue(e.target.value); }}>
          {!p.options.includes(String(local)) && <option>{String(local)}</option>}
          {p.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      );
    }
    return <input type="text" value={String(local)} onChange={(e) => commit(e.target.value)} />;
  }
  const slider = p.min !== undefined && p.max !== undefined && p.max > p.min;
  const onNum = (s: string) => { setLocal(s); if (s.trim() !== '' && Number.isFinite(Number(s))) commit(Number(s)); };
  return (
    <span className="pc-num">
      {slider && <input type="range" min={p.min} max={p.max} step={p.step ?? (p.max! - p.min!) / 100} value={Number(local) || 0} onChange={(e) => commit(Number(e.target.value))} />}
      <input type="number" value={String(local)} step={p.step ?? 'any'} onChange={(e) => onNum(e.target.value)} />
    </span>
  );
}

const numOrUndef = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined);

function ParamForm({ draft, others, onSave, onCancel }: { draft: Param; others: string[]; onSave: (p: Param) => void; onCancel: () => void }) {
  const [p, setP] = useState(draft);
  const [optText, setOptText] = useState((draft.options ?? []).join(', '));
  const name = p.name.trim();
  const err = !name ? '請輸入名稱' : /[\]]/.test(name) || name.startsWith('@') ? '名稱不能含 ] 或以 @ 開頭' : others.includes(name) ? '已有同名的參數' : '';
  const setType = (type: ParamType) => setP({ ...p, type, value: type === 'number' ? 0 : type === 'boolean' ? false : '' });
  const save = () => {
    const options = p.type === 'string' ? optText.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined;
    let value = p.value;
    if (p.type === 'string' && options && options.length > 0 && !options.includes(String(value))) value = options[0];
    onSave({ ...p, name, options, value });
  };
  return (
    <div className="cp-form">
      <label>名稱<input value={p.name} autoFocus onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="例如：利潤門檻" /></label>
      <label>資料類型
        <select value={p.type} onChange={(e) => setType(e.target.value as ParamType)}>
          {(Object.keys(TYPE_LABEL) as ParamType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label>目前值
        {p.type === 'boolean'
          ? <select value={String(p.value)} onChange={(e) => setP({ ...p, value: e.target.value === 'true' })}><option value="false">FALSE</option><option value="true">TRUE</option></select>
          : <input value={String(p.value)} type={p.type === 'number' ? 'number' : 'text'} onChange={(e) => setP({ ...p, value: p.type === 'number' ? Number(e.target.value) : e.target.value })} />}
      </label>
      {p.type === 'number' && (
        <div className="cp-row">
          <label>最小值（選填）<input type="number" value={p.min ?? ''} onChange={(e) => setP({ ...p, min: numOrUndef(e.target.value) })} /></label>
          <label>最大值（選填）<input type="number" value={p.max ?? ''} onChange={(e) => setP({ ...p, max: numOrUndef(e.target.value) })} /></label>
          <label>間隔（選填）<input type="number" value={p.step ?? ''} onChange={(e) => setP({ ...p, step: numOrUndef(e.target.value) })} /></label>
        </div>
      )}
      {p.type === 'number' && <div className="hint">最小值與最大值都填，就會出現滑桿。</div>}
      {p.type === 'string' && <label>選項（選填，用逗號分隔；有選項會變成下拉選單）<input value={optText} onChange={(e) => setOptText(e.target.value)} placeholder="例如：高, 中, 低" /></label>}
      {err && <div className="cp-err">{err}</div>}
      <div className="cp-btns"><button className="mini" onClick={onCancel}>取消</button><button className="mini primary" disabled={!!err} onClick={save}>確定</button></div>
    </div>
  );
}

function CalcForm({ draft, fieldNames, paramNames, takenNames, onSave, onCancel }: {
  draft: Calc; fieldNames: string[]; paramNames: string[]; takenNames: string[]; onSave: (c: Calc) => void; onCancel: () => void;
}) {
  const [c, setC] = useState(draft);
  const area = useRef<HTMLTextAreaElement>(null);
  const name = c.name.trim();
  let err = !name ? '請輸入名稱' : takenNames.includes(name) ? `已有同名的欄位「${name}」` : '';
  if (!err) {
    if (!c.formula.trim()) err = '請輸入公式';
    else { try { compile(c.formula, { fields: fieldNames, params: paramNames }); } catch (e) { err = describeError(e); } }
  }
  const insert = (text: string) => {
    const el = area.current;
    const a = el?.selectionStart ?? c.formula.length, b = el?.selectionEnd ?? c.formula.length;
    const next = c.formula.slice(0, a) + text + c.formula.slice(b);
    setC({ ...c, formula: next });
    window.setTimeout(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length); }, 0);
  };
  return (
    <div className="cp-form">
      <label>名稱<input value={c.name} autoFocus onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="例如：利潤率" /></label>
      <label>公式
        <textarea ref={area} rows={5} spellCheck={false} value={c.formula} onChange={(e) => setC({ ...c, formula: e.target.value })}
          placeholder={'[Profit] / [Sales]\n\nIF [Profit] > [@利潤門檻] THEN "達標" ELSE "未達標" END'} />
      </label>
      <div className="cp-ins">
        <select value="" onChange={(e) => e.target.value && insert(`[${e.target.value}]`)}><option value="">插入欄位…</option>{fieldNames.map((f) => <option key={f}>{f}</option>)}</select>
        <select value="" onChange={(e) => e.target.value && insert(`[@${e.target.value}]`)}><option value="">插入參數…</option>{paramNames.map((f) => <option key={f}>{f}</option>)}</select>
        <select value="" onChange={(e) => e.target.value && insert(`${e.target.value}()`)}><option value="">插入函式…</option>{FUNCTION_NAMES.map((f) => <option key={f}>{f}</option>)}</select>
      </div>
      {err ? <div className="cp-err">{err}</div> : <div className="cp-ok">公式正確</div>}
      <div className="cp-btns"><button className="mini" onClick={onCancel}>取消</button><button className="mini primary" disabled={!!err} onClick={() => onSave({ ...c, name })}>確定</button></div>
    </div>
  );
}

type Editing = { kind: 'param'; draft: Param; isNew: boolean } | { kind: 'calc'; draft: Calc; isNew: boolean } | null;

export function CalcPanel({ open, onClose, state, setState, baseFields, errors }: {
  open: boolean; onClose: () => void; state: CalcState; setState: (s: CalcState) => void; baseFields: FieldMeta[]; errors: Record<string, string>;
}) {
  const [ed, setEd] = useState<Editing>(null);
  if (!open) return null;
  const base = baseFields.map((f) => f.fid);
  const paramNames = state.params.map((p) => p.name.trim()).filter(Boolean);

  const saveParam = (p: Param, isNew: boolean) => {
    setState({ ...state, params: isNew ? [...state.params, p] : state.params.map((x) => (x.id === p.id ? p : x)) });
    setEd(null);
  };
  const saveCalc = (c: Calc, isNew: boolean) => {
    setState({ ...state, calcs: isNew ? [...state.calcs, c] : state.calcs.map((x) => (x.id === c.id ? c : x)) });
    setEd(null);
  };
  const calcContext = (id: string) => {
    // 公式裡只能引用「原始欄位 + 排在它前面的計算欄位」
    const i = state.calcs.findIndex((x) => x.id === id);
    const before = (i < 0 ? state.calcs : state.calcs.slice(0, i)).map((x) => x.name.trim()).filter(Boolean);
    return { fieldNames: [...base, ...before], taken: [...base, ...state.calcs.filter((x) => x.id !== id).map((x) => x.name.trim())] };
  };

  return (
    <aside className="calc-drawer" aria-label="參數與計算欄位">
      <div className="cd-head"><h3>參數與計算欄位</h3><button className="geo-close" onClick={onClose} aria-label="關閉">×</button></div>
      <div className="cd-body">
        <section>
          <h4>參數 <span className="hint">像 Tableau 的參數：改一個數值，用到它的計算欄位和圖表就跟著更新</span></h4>
          {state.params.length === 0 && ed?.kind !== 'param' && <div className="hint">還沒有參數。</div>}
          {state.params.map((p) =>
            ed?.kind === 'param' && ed.draft.id === p.id ? (
              <ParamForm key={p.id} draft={ed.draft} others={paramNames.filter((n) => n !== p.name.trim())} onSave={(x) => saveParam(x, false)} onCancel={() => setEd(null)} />
            ) : (
              <div className="cd-item" key={p.id}>
                <div className="cd-title"><b>{p.name || '（未命名）'}</b><span className="tag">{TYPE_LABEL[p.type]}</span>
                  <span className="sp" />
                  <button className="mini" onClick={() => setEd({ kind: 'param', draft: p, isNew: false })}>編輯</button>
                  <button className="mini" onClick={() => setState({ ...state, params: state.params.filter((x) => x.id !== p.id) })}>刪除</button>
                </div>
                <ParamControl p={p} onValue={(v) => setState({ ...state, params: state.params.map((x) => (x.id === p.id ? { ...x, value: v } : x)) })} />
              </div>
            ),
          )}
          {ed?.kind === 'param' && ed.isNew
            ? <ParamForm draft={ed.draft} others={paramNames} onSave={(x) => saveParam(x, true)} onCancel={() => setEd(null)} />
            : <button className="mini primary" onClick={() => setEd({ kind: 'param', isNew: true, draft: { id: uid(), name: '', type: 'number', value: 0 } })}>＋ 新增參數</button>}
        </section>

        <section>
          <h4>計算欄位 <span className="hint">公式算出來的新欄位，會出現在左側欄位清單</span></h4>
          {state.calcs.length === 0 && ed?.kind !== 'calc' && <div className="hint">還沒有計算欄位。</div>}
          {state.calcs.map((c) => {
            const ctx = calcContext(c.id);
            return ed?.kind === 'calc' && ed.draft.id === c.id ? (
              <CalcForm key={c.id} draft={ed.draft} fieldNames={ctx.fieldNames} paramNames={paramNames} takenNames={ctx.taken} onSave={(x) => saveCalc(x, false)} onCancel={() => setEd(null)} />
            ) : (
              <div className="cd-item" key={c.id}>
                <div className="cd-title"><b>{c.name || '（未命名）'}</b><span className="sp" />
                  <button className="mini" onClick={() => setEd({ kind: 'calc', draft: c, isNew: false })}>編輯</button>
                  <button className="mini" onClick={() => setState({ ...state, calcs: state.calcs.filter((x) => x.id !== c.id) })}>刪除</button>
                </div>
                <code className="cd-formula">{c.formula}</code>
                {errors[c.id] && <div className="cp-err">{errors[c.id]}</div>}
              </div>
            );
          })}
          {ed?.kind === 'calc' && ed.isNew
            ? <CalcForm draft={ed.draft} fieldNames={calcContext('').fieldNames} paramNames={paramNames} takenNames={calcContext('').taken} onSave={(x) => saveCalc(x, true)} onCancel={() => setEd(null)} />
            : <button className="mini primary" onClick={() => setEd({ kind: 'calc', isNew: true, draft: { id: uid(), name: '', formula: '' } })}>＋ 新增計算欄位</button>}
        </section>

        <details className="cd-help">
          <summary>公式語法說明</summary>
          <ul>
            <li>欄位：<code>[Sales]</code>；參數：<code>[@門檻]</code>（沒有同名欄位時可省略 @）</li>
            <li>運算：<code>+ - * / % ^</code>、比較 <code>= &lt;&gt; &lt; &lt;= &gt; &gt;=</code>、<code>AND OR NOT</code></li>
            <li>條件：<code>IF … THEN … ELSEIF … ELSE … END</code>、<code>CASE [欄位] WHEN 值 THEN 結果 … END</code></li>
            <li>函式：{FUNCTION_NAMES.join('、')}</li>
            <li>遇到空值（NULL）或除以 0，結果是空值；<code>// </code> 後面是註解</li>
            <li>目前是「逐列」計算；<code>SUM()</code> 這類聚合與 LOD 運算式還不支援</li>
          </ul>
        </details>
      </div>
    </aside>
  );
}
