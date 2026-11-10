import type { VizSpecStore } from '@kanaries/graphic-walker';
import type { FieldMeta } from '../dataset';

const sig = (f: FieldMeta) => `${f.analyticType}|${f.semanticType}`;
export const sigMap = (fs: FieldMeta[]) => new Map(fs.map((f) => [f.fid, sig(f)]));

/**
 * graphic-walker 只在建立圖表時才把欄位放進左側欄位清單；之後新增／刪除計算欄位要自己補。
 * 做法：匯出目前所有圖表 → 把新欄位加進「維度／度量」清單、把已刪除（或類型改變）的欄位從所有位置拿掉 → 再匯入。
 * 已經拖好的圖表設定會保留。重複呼叫是安全的（已存在就不再加）。
 */
export function syncCalcFields(store: VizSpecStore | null, now: FieldMeta[], prev: Map<string, string>): Map<string, string> {
  const next = sigMap(now);
  if (!store) return next;
  const gone = new Set<string>();
  for (const [k, v] of prev) if (next.get(k) !== v) gone.add(k);
  const add = now.filter((f) => prev.get(f.fid) !== sig(f));
  if (gone.size === 0 && add.length === 0) return next;

  const idx = store.visIndex;
  const charts = JSON.parse(JSON.stringify(store.exportCode())) as Array<{ encodings: Record<string, Array<{ fid: string }>> }>;
  for (const c of charts) {
    const e = c.encodings;
    for (const k of Object.keys(e)) {
      if (Array.isArray(e[k])) e[k] = e[k].filter((x) => !gone.has(x.fid));
    }
    for (const f of add) {
      const list = f.analyticType === 'measure' ? e.measures : e.dimensions;
      if (!list || e.dimensions.some((x) => x.fid === f.fid) || e.measures.some((x) => x.fid === f.fid)) continue;
      list.push({
        fid: f.fid, name: f.name, basename: f.name, semanticType: f.semanticType, analyticType: f.analyticType,
        ...(f.analyticType === 'measure' ? { aggName: 'sum' } : {}),
      } as unknown as { fid: string });
    }
  }
  store.importCode(charts as never);
  store.visIndex = Math.min(idx, charts.length - 1);
  return next;
}
