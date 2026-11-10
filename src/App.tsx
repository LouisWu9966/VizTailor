import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { GraphicWalker, type VizSpecStore } from '@kanaries/graphic-walker';
import { buildDataset, parseCsv, type Dataset } from './dataset';
import { listSheets, readSheet } from './excel';
import { I18N_LANG, i18nResources } from './i18n';
import { loadCountries, type GeoFC } from './geo/data';
import { enrichGeo, type GeoReport } from './geo/enrich';
import { installOfflineBasemap, setBasemapData } from './geo/basemap';
import { simplifyFC } from './geo/simplify';
import { installLeafletCss } from './geo/leafletCss';
import { StylePanel, useVizStyle } from './palette';
import { CalcPanel } from './calc/CalcPanel';
import { applyCalcs, EMPTY, type CalcState } from './calc/apply';
import { sigMap, syncCalcFields } from './calc/sync';
import { installPillDrill } from './pillDrill';
import { installGeoGuard } from './geoGuard';
import { SharkToggle } from './SharkToggle';
import notices from '../THIRD-PARTY-NOTICES.md?raw';
import './styles.css';

type GWFields = ComponentProps<typeof GraphicWalker>['fields'];
type GWGeo = ComponentProps<typeof GraphicWalker>['geographicData'];
// one loaded sheet/file: the parsed data, and the same data with geography columns added
type Entry = { raw: Dataset; ds: Dataset; report: GeoReport | null };

installOfflineBasemap(); // graphic-walker's own Leaflet is loaded by the import above
installLeafletCss(); // graphic-walker links leaflet.css from unpkg (offline: never loads) -> inject the bundled copy
type Book = { file: string; buf: ArrayBuffer; sheets: string[] };

const EXCEL_RE = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;
const tick = () => new Promise<void>((r) => setTimeout(r, 0)); // let the "loading" state paint

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [raw, setRaw] = useState<Dataset | null>(null);
  const [report, setReport] = useState<GeoReport | null>(null);
  const [noteOpen, setNoteOpen] = useState(true);
  const [world, setWorld] = useState<GeoFC | null>(null);
  const { style, setStyle, theme, scales } = useVizStyle();
  const [calcMap, setCalcMap] = useState<Record<number, CalcState>>({}); // 參數／計算欄位，依「哪一份資料」(raw.id) 分開存
  const [calcOpen, setCalcOpen] = useState(false);
  const storeRef = useRef<VizSpecStore | null>(null);
  const calcSync = useRef<{ key: number; map: Map<string, string> }>({ key: -1, map: new Map() });
  const stageRef = useRef<HTMLElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [geoWarn, setGeoWarn] = useState<string | null>(null);
  const seq = useRef(0);
  const cache = useRef(new Map<string, Entry>());
  const curKey = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCountries()
      .then((c) => {
        setBasemapData(c.geo);
        setWorld(c.geo);
      })
      .catch((e) => console.warn('[VizTailor] 世界地圖資料載入失敗', e));
  }, []);
  // GeoJSON handed to graphic-walker for the filled map. It matches rows by exact value of feature property "name"
  // (graphic-walker: properties[geoKey] === value of the 地理 ID field). Canonical names are the zh-TW country names
  // (= the 國家(地圖) column). On top of that, every distinct spelling found in the user's own country column
  // ("United States", "US", "美国" ...) gets an extra feature sharing the same geometry, so that column works as 地理 ID too.
  // lighter shapes for graphic-walker: it draws one Leaflet polygon per island part (full 1:50m has ~1,500 of them)
  const worldLite = useMemo(() => (world ? simplifyFC(world, 0.06, 0.6) : null), [world]);
  const geoData = useMemo(() => {
    if (!worldLite) return undefined;
    type Feat = { properties: Record<string, unknown> };
    const base = worldLite.features as Feat[];
    const byIso = new Map(base.map((f) => [f.properties.iso3 as string, f]));
    const names = new Set(base.map((f) => f.properties.name as string));
    const extra: Feat[] = [];
    for (const [raw, iso3] of report?.country?.variants ?? []) {
      const f = byIso.get(iso3);
      if (!f || names.has(raw)) continue;
      names.add(raw);
      extra.push({ ...f, properties: { ...f.properties, name: raw } });
    }
    return { type: 'GeoJSON', data: { type: 'FeatureCollection', features: [...base, ...extra] }, key: 'name' } as unknown as GWGeo;
  }, [worldLite, report]);

  const rawId = raw?.id ?? -1;
  const calcState = calcMap[rawId] ?? EMPTY;
  const setCalcState = useCallback((st: CalcState) => setCalcMap((m) => ({ ...m, [rawId]: st })), [rawId]);
  const applied = useMemo(() => (ds ? applyCalcs(ds, calcState) : null), [ds, calcState]);
  const view = applied?.ds ?? ds;
  const viewRef = useRef(view);
  viewRef.current = view;
  // 新增／刪除計算欄位時，把變動補進 graphic-walker 已存在的圖表（保留使用者已拖好的設定）
  useEffect(() => {
    if (!view || !applied) return;
    const cur = calcSync.current;
    calcSync.current = cur.key !== view.id
      ? { key: view.id, map: sigMap(applied.added) }
      : { key: view.id, map: syncCalcFields(storeRef.current, applied.added, cur.map) };
  }, [applied, view]);

  // 日期欄位膠囊上的粒度選單（年／季度／月／日…）
  const hasData = !!ds;
  useEffect(() => {
    const stage = stageRef.current;
    return stage && hasData ? installPillDrill(stage, () => storeRef.current, (fid) => viewRef.current?.rows.find((r) => r[fid] != null)?.[fid]) : undefined;
  }, [hasData]);

  // 填充地圖若放進高基數欄位（如 Row ID）會一次畫出數萬個多邊形而當機：自動拿掉並提示
  useEffect(() => {
    if (!hasData) return undefined;
    setGeoWarn(null);
    return installGeoGuard(() => storeRef.current, () => viewRef.current?.rows, setGeoWarn);
  }, [ds?.id, hasData]);

  const show = useCallback((e: Entry) => {
    setDs(e.ds);
    setRaw(e.raw);
    setReport(e.report);
    setNoteOpen(true);
  }, []);

  // parse result -> add geography columns (never fatal: on any failure the plain data is shown)
  const withGeo = useCallback(async (d: Dataset): Promise<Entry> => {
    try {
      const out = await enrichGeo(d);
      return { raw: d, ...out };
    } catch (err) {
      console.warn('[VizTailor] 地理欄位處理失敗', err);
      return { raw: d, ds: d, report: null };
    }
  }, []);

  const regeo = useCallback(
    async (col: string | null) => {
      if (!raw) return;
      setBusy(true);
      try {
        await tick();
        const out = await enrichGeo(raw, { cityCol: col }, ++seq.current);
        const e: Entry = { raw, ...out };
        if (curKey.current) cache.current.set(curKey.current, e);
        show(e);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [raw, show],
  );

  const openSheet = useCallback(async (b: Book, name: string) => {
    setError(null);
    setBusy(true);
    setSheet(name);
    try {
      await tick();
      const key = `${b.file}::${name}`;
      let e = cache.current.get(key);
      if (!e) {
        e = await withGeo(buildDataset(`${b.file} › ${name}`, readSheet(b.buf, name), ++seq.current));
        cache.current.set(key, e);
      }
      curKey.current = key;
      show(e);
    } catch (e) {
      setDs(null);
      setError(`工作表「${name}」：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [show, withGeo]);

  const load = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        await tick();
        cache.current.clear();
        if (EXCEL_RE.test(file.name)) {
          const sheets = listSheets(buf);
          if (sheets.length === 0) throw new Error('活頁簿裡沒有工作表');
          const b: Book = { file: file.name, buf, sheets };
          setBook(b);
          await openSheet(b, sheets[0]);
        } else {
          setBook(null);
          setSheet(null);
          curKey.current = '';
          show(await withGeo(parseCsv(file.name, buf, ++seq.current)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [openSheet, show, withGeo],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void load(f);
  };

  return (
    <div
      className={'app' + (hover ? ' hover' : '')}
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
    >
      <header className="bar">
        <strong className="brand">VizTailor</strong>
        <button onClick={() => inputRef.current?.click()}>開啟檔案…</button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = '';
          }}
        />
        {ds && <span className="meta">{ds.name} · {ds.rows.length.toLocaleString()} 列 · {ds.fields.length} 欄</span>}
        {busy && <span className="meta">讀取中…</span>}
        <StylePanel style={style} setStyle={setStyle} />
        <button disabled={!ds} onClick={() => setCalcOpen((o) => !o)}>參數與計算欄位</button>
        <span className="spacer" />
        <span className="offline">離線執行 · 資料不外送</span>
      </header>

      {book && (
        <nav className="sheets" aria-label="工作表">
          <span className="sheets-label">工作表</span>
          {book.sheets.map((s) => (
            <button
              key={s}
              className={'sheet' + (s === sheet ? ' active' : '')}
              disabled={busy}
              onClick={() => void openSheet(book, s)}
            >
              {s}
            </button>
          ))}
        </nav>
      )}

      {error && <div className="error" onClick={() => setError(null)}>{error}</div>}

      {report && noteOpen && (
        <div className="geo-note">
          <div className="geo-lines">
            {report.latLng && <div>偵測到經度／緯度欄位（「{report.latLng.lng}」「{report.latLng.lat}」），可直接做地圖。</div>}
            {!report.latLng && (
              <div>
                城市欄：
                <select value={report.city?.col ?? ''} disabled={busy} onChange={(e) => void regeo(e.target.value || null)}>
                  <option value="">（不補座標）</option>
                  {report.textCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {report.city && (
                  <>
                    {' '}已補上「經度」「緯度」：{report.city.matched}／{report.city.total} 個城市找到座標
                    {report.city.missed.length > 0 && `（找不到：${report.city.missed.join('、')}）`}
                  </>
                )}
              </div>
            )}
            {report.country && (
              <div>
                「{report.country.col}」欄有 {report.country.matched}／{report.country.total} 個國家名稱對得上世界地圖；做填充地圖時，把「{report.country.col}」（或另外加的「國家(地圖)」）拖到「地理 ID」即可。
              </div>
            )}
          </div>
          <button className="geo-close" onClick={() => setNoteOpen(false)} aria-label="關閉">×</button>
        </div>
      )}

      {raw?.notes && raw.notes.length > 0 && noteOpen && (
        <div className="geo-note data-note">
          <div className="geo-lines">
            {raw.notes.map((n) => <div key={n}>{n}</div>)}
          </div>
          <button className="geo-close" onClick={() => setNoteOpen(false)} aria-label="關閉">×</button>
        </div>
      )}

      {geoWarn && (
        <div className="geo-note data-note">
          <div className="geo-lines"><div>{geoWarn}</div></div>
          <button className="geo-close" onClick={() => setGeoWarn(null)} aria-label="關閉">×</button>
        </div>
      )}

      <main className="stage" ref={stageRef}>
        {ds && view ? (
          <GraphicWalker
            key={ds.id}
            storeRef={storeRef}
            data={view.rows}
            fields={view.fields as unknown as GWFields}
            i18nLang={I18N_LANG}
            i18nResources={i18nResources}
            appearance="light"
            geographicData={geoData}
            vizThemeConfig={theme}
            scales={scales}
          />
        ) : (
          <div className="empty">
            <h1>把 CSV 或 Excel 檔拖進來，或按「開啟檔案…」</h1>
            <p>支援 CSV（UTF-8／Big5）與 Excel（.xlsx／.xls，多個工作表可在上方切換）。欄位拖曳到 列／欄／顏色／大小 即可建立圖表。</p>
          </div>
        )}
      </main>
      <CalcPanel open={calcOpen && !!ds} onClose={() => setCalcOpen(false)} state={calcState} setState={setCalcState} baseFields={ds?.fields ?? []} errors={applied?.errors ?? {}} />
      <footer className="credit">
        <SharkToggle />
        <span>基於 Graphic Walker（Kanaries）· 城市座標 © GeoNames（CC BY 4.0）· <button className="link" onClick={() => setAboutOpen(true)}>第三方授權</button></span>
      </footer>
      {aboutOpen && (
        <div className="about-back" onClick={() => setAboutOpen(false)}>
          <div className="about" role="dialog" aria-label="第三方授權" onClick={(e) => e.stopPropagation()}>
            <div className="cd-head"><h3>第三方授權</h3><button className="geo-close" onClick={() => setAboutOpen(false)} aria-label="關閉">×</button></div>
            <pre>{notices}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
