# VizTailor — 地端拖曳式 BI 工具（Tableau-like）

> 建立日期：2026-11-10　|　狀態：🟡 環境準備中（方案已定：Tauri v2）

---

## 1. 專案目標

打造一個**完全離線、單機執行**的 BI 工具，體驗接近 Tableau Desktop：

| 目標 | 說明 |
|---|---|
| 拖曳建圖 | 把欄位拖到 行 / 列 / 顏色 / 大小 / 形狀 / 篩選 等 shelf，即時產生圖表 |
| 多圖表類型 | 長條、折線、面積、散佈、圓餅、熱力圖、箱型圖、表格、地圖（後期） |
| 資料來源 | CSV / Excel / Parquet / JSON 拖入即可分析；後期加 SQLite、MSSQL、PostgreSQL |
| 資料整理 | 欄位型別調整、計算欄位、聚合（sum/avg/count…）、篩選、排序、分組 |
| 儀表板 | 多張圖表組成 Dashboard，可互動篩選（cross-filter） |
| 儲存／匯出 | 專案檔（.vzt / json）可重開；圖表匯出 PNG / SVG；資料匯出 CSV |
| 打包 | 包成 **單一 .exe**（或 exe + 資料夾），雙擊即開，不需安裝 Python / Node |
| 資料不出機 | 無雲端、無 telemetry，資料全部留在本機 |

### 非目標（暫不做）
- 多人協作 / 伺服器版 / 權限管理
- 即時串流資料

---

## 2. GitHub 調查結果（2026-11-10）

### 2.1 核心元件候選（拖曳式圖表引擎）

| 專案 | 授權 | 說明 | 評估 |
|---|---|---|---|
| **Kanaries/graphic-walker** ⭐推薦 | Apache-2.0 | TypeScript/React 元件，Tableau 式 shelf 拖曳 UI，底層 vega-lite，支援 Web Worker 純前端運算，內建中文 i18n，可匯出 SVG/PNG | 最接近需求、可嵌入、可客製，直接當核心 |
| Kanaries/pygwalker | Apache-2.0 | graphic-walker 的 Python 包裝（Jupyter/Streamlit 用） | 若走 Python 路線可直接用；但受限於它的 UI 殼 |
| Kanaries/Rath | AGPL | 自動化 EDA 平台，內含 graphic-walker | 功能多但 AGPL + 專案已不活躍，不採用 |
| apache/superset、metabase | Apache / AGPL | 伺服器型 BI，需 Docker/DB | 太重，不符「單一 exe」 |
| dataease | GPL-3 | 中國開源 BI，拖曳建圖 | Java 伺服器型，太重 |
| microsoft/charticulator | MIT | 自由度極高的圖表設計器 | 偏「設計」非「分析」，可作參考 |
| finos/perspective | Apache-2.0 | 高效能 pivot/資料表格 + 圖表（WASM） | 可作「資料表格 / 樞紐」補強元件 |

### 2.2 資料引擎候選

| 專案 | 說明 | 評估 |
|---|---|---|
| **DuckDB** ⭐推薦 | 嵌入式 OLAP，直接讀 CSV/Parquet/Excel，單檔、超快 | Tauri 用 `duckdb-rs`；Python 用 `duckdb` pip；純前端用 `duckdb-wasm` |
| graphic-walker 內建 Web Worker 計算 | 小資料量（<數十萬列）夠用 | 第一版可先用，之後接 DuckDB |

### 2.3 桌面殼 / 打包方案

| 方案 | 技術棧 | exe 大小 | 優點 | 缺點 |
|---|---|---|---|---|
| **A. Tauri v2** ⭐推薦 | Rust + React + graphic-walker + duckdb-rs | ~10–20 MB | 單一 exe、啟動快、使用 Windows 內建 WebView2、記憶體小 | 需安裝 Rust toolchain；Rust 端要寫一點 command |
| B. pywebview + PyInstaller | Python (FastAPI/Flask + duckdb + pandas) + React 前端 | ~80–150 MB | 全 Python 後端，與 PdfTailor 技術棧相近，資料處理生態最豐富 | exe 大、onefile 啟動慢（要解壓）、PyInstaller 常漏 hidden import |
| C. Electron | Node + React + duckdb-node | ~150 MB+ | 生態最成熟 | 太肥，不符需求 |
| D. PyGWalker Desktop（Kanaries 官方） | 閉源 | — | 零開發 | 不可客製、不開源，不採用 |

### 2.4 可用的 Claude Skills（GitHub，尚未下載／尚未 vet）

| Skill | 來源 | 用途 |
|---|---|---|
| tauri-desktop | travisjneuman/.claude | Tauri 2.0 專案建置、IPC、plugin、打包 |
| tauri-development | mindrally/skills | Tauri TS+Rust 實務、避免過多 IPC 的 pattern |
| desktop-framework-tauri | agents-inc/skills | Tauri 2.x capability/permission 系統、tray、打包 |
| desktop-app | popup-studio-ai/bkit-claude-code | Electron/Tauri 通用桌面 App 開發 |
| rust-desktop-applications | bobmatnyc/claude-mpm-skills | Rust 桌面 App 決策樹 |
| （本機已有）frontend-design、ui-ux-pro-max、design-taste-frontend | 本機 skills 資料夾 | UI 設計 |
| （本機已有）dataviz | Claude 內建 | 圖表配色／版面規範 |
| （本機已有）skill-vet | 本機 skills 資料夾 | **下載任何新 skill 前必跑** |

> ⚠️ 規則：任何外部 skill 下載前先用 skill-vet 檢查，使用者同意後才安裝。

---

## 3. 建議架構（方案 A：Tauri v2）

```
VizTailor/
├─ src/                      # React + TypeScript 前端 (Vite)
│  ├─ components/
│  │  ├─ Explorer/           # 包 @kanaries/graphic-walker
│  │  ├─ DataSource/         # 匯入 CSV/Excel/Parquet、欄位型別編輯
│  │  ├─ Dashboard/          # 多圖表網格 (react-grid-layout)
│  │  └─ Shell/              # 側欄、工具列、分頁
│  ├─ stores/                # zustand：資料集、圖表 spec、專案檔
│  └─ lib/duck.ts            # invoke() 呼叫 Rust DuckDB
├─ src-tauri/                # Rust 後端
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ commands/db.rs      # duckdb-rs：open / query / import
│  │  └─ commands/project.rs # 專案檔讀寫 (.vzt = json)
│  └─ tauri.conf.json        # bundle → NSIS / 單一 exe
├─ docs/
├─ PROJECT.md                # ← 本檔
└─ README.md
```

資料流：`檔案拖入 → Rust DuckDB 建表 → 前端取欄位 meta → graphic-walker 拖曳 → 需要聚合時走 DuckDB SQL (computation service) → vega-lite 渲染`

### 若改走方案 B（Python）
```
backend/ (FastAPI + duckdb + pandas) ──HTTP/127.0.0.1──> pywebview 視窗 (載入 React build)
PyInstaller --onedir  →  dist/VizTailor/VizTailor.exe（建議 onedir + Inno Setup，比 onefile 穩）
```

---

## 4. 里程碑與進度

| # | 里程碑 | 狀態 | 備註 |
|---|---|---|---|
| M0 | 需求確認、技術選型 | ✅ 完成 | 2026-11-10 決定：方案 A Tauri v2，完全離線，資料源以 CSV/Excel 為主 |
| M0.5 | 開發環境準備 | ✅ 完成（待首次編譯驗證） | Node 20.19.6 ✅ / Git ✅ / Python ✅ / WebView2 ✅ / Rust 1.99.1 ✅ / VS Build Tools 2022 (C++ + Win SDK) 已安裝，待 `tauri info` 確認 |
| M1 | 專案骨架：Tauri + Vite + React，能開視窗 | ✅ 完成（2026-11-10 使用者實測可開啟） | Tauri 2.12 / React 19 / Vite 8 / TS 5.9 |
| M2 | 嵌入 graphic-walker，載入 CSV 拖曳出第一張圖 | ✅ 完成（實測 global_superstore_2016.csv：51,290 列 × 24 欄可載入） | graphic-walker 0.5.3；UTF-8→Big5 自動 fallback；型別自動推斷 |
| M2.5 | 繁體中文介面 + Excel 多工作表 | 🟡 程式已寫，待 `npm install` 後實測 | 見下方技術備忘 |
| M2.6 | 離線地圖：世界國界底圖 + 國家填充地圖 + 城市名稱自動補經緯度 | 🟡 程式已寫，待實測 | 見技術備忘「離線地圖」 |
| M3 | 接 DuckDB：匯入 CSV/Excel/Parquet、大資料聚合 | ⬜ | |
| M4 | 專案檔存檔／讀檔、圖表匯出 PNG/SVG | ⬜ | |
| M5 | Dashboard 多圖表排版 + cross-filter | ⬜ | |
| M6 | 打包 .exe（圖示、版本號、簽名游標 LouisTool 雙髻鯊） | ⬜ | |
| M7 | 資料庫連線（SQLite / MSSQL）、計算欄位 UI 強化 | ⬜ | 後期 |

---

## 5. 已決定事項與待辦

### 已決定（2026-11-10）
- 技術方案：**A. Tauri v2**（Rust + React + graphic-walker + DuckDB）
- **完全地端執行**：不使用任何雲端服務；不啟用 updater plugin；CSP 限制為 `self`；不裝 tauri-plugin-http；不帶 telemetry
- 主要資料來源：**CSV / Excel**（M3 以 DuckDB 讀取；Excel 需評估 duckdb excel 擴充或 calamine crate，注意離線時擴充需內建）
- Skills 已 vet 並安裝：本機 skills 資料夾的 `tauri`（desktop-framework-tauri、tauri-desktop；tauri-development 因 v1 過時未裝）

### 環境檢查結果（2026-11-10）
| 項目 | 狀態 |
|---|---|
| Node.js | ✅ v20.19.6 |
| Git / Python 3.11 / winget | ✅ |
| WebView2 Runtime | ✅ 157.0.4341.42 |
| Rust (rustup/cargo/rustc) | ❌ 需安裝（`winget install --id Rustlang.Rustup -e`） |
| MSVC C++ Build Tools + Windows SDK | ❓ 偵測到的 cl.exe 在 ScopeCppSDK，不一定完整，待確認 `VC\Tools\MSVC` 與 Windows Kits |

### 待辦
1. 安裝 Rust，確認 `cargo -V` / `rustc -V`
2. 確認 MSVC + Windows SDK，缺則補裝「使用 C++ 的桌面開發」
3. 介面語言（預設繁中，英文可切換——待確認）
4. 進入 M1：`npm create tauri-app` 建立骨架

---

## 6. 變更紀錄

| 日期 | 內容 |
|---|---|
| 2026-11-10 | 建立專案、完成 GitHub 調查與架構草案 |
| 2026-11-10 | 決定方案 A（Tauri v2）；環境檢查完成（缺 Rust）；tauri skills vet 後安裝至本機 skills 資料夾 |
| 2026-11-10 | 建立 M1/M2 骨架原始碼（Tauri v2 + React 19 + graphic-walker 0.5.3 + CSV 載入）；Rust 1.99.1 與 VS Build Tools 安裝完成 |
| 2026-11-10 | M1、M2 實測通過（51,290 列 CSV）；新增 zh-TW 介面與 Excel 多工作表（待實測） |
| 2026-11-10 | 新增離線地圖（M2.6，待實測）：世界國界離線底圖、國家填充地圖、城市名稱自動補經緯度；修正 `dataset.ts` 一處型別錯誤；新增第 8 節 Tableau 功能對照 |

---

## 7. 技術備忘

- **完全離線的落實**：CSP `connect-src` 只允許 `self`／`ipc`，未安裝 http / shell / fs / updater plugin，capability 僅 `core:default`。graphic-walker 的 AskViz／vlChat 為選用功能，不啟用即無對外連線。
- **CSP 含 `unsafe-eval`**：vega 的表達式需要 eval；因 `connect-src` 鎖死、無外部腳本來源，風險可接受。首次實測若圖表可正常顯示，之後可嘗試移除 `unsafe-eval` 驗證（vega-interpreter）。
- **`dragDropEnabled: false`**：讓網頁內可接收檔案拖放（Tauri 預設會攔截）。
- **產出單一 exe**：`npm run tauri build -- --no-bundle` → `src-tauri\target\release\viztailor.exe`（前端已內嵌，可單檔執行）。安裝檔（NSIS）留到 M6。
- **Excel**：M3 再處理（候選：Rust `calamine` crate 離線解析，或 DuckDB excel 擴充——後者需內建擴充檔才能離線）。
- **繁體中文（M2.5）**：graphic-walker 只內建 en／zh-CN／ja。`src/i18n.ts` 啟動時用 `opencc-js`（cn→twp，台灣用語）把 zh-CN 語言檔轉成 zh-TW，再用 `FIXES` 表修正術語（欄位、長條圖、散佈圖、圓餅圖…）。若有翻得不順的詞，直接在 `FIXES` 加一行即可。
- **Excel 多工作表（M2.5）**：前端用 SheetJS（`xlsx@0.20.3`，官方 CDN tarball，npm 上的 0.18.5 已過時有漏洞，故不用）。支援 .xlsx／.xlsm／.xlsb／.xls／.ods。開檔只讀工作表名稱，點選哪個分頁才解析哪個（快取）；日期儲存格直接讀儲存格序號轉成 YYYY-MM-DD，不經時區運算；標題列自動略過上方的標題文字列。
- **已知限制**：①一次只分析一個工作表（跨工作表 JOIN 要等 M3 DuckDB）；②切換工作表會重置該圖表（M4 做專案檔時一併保存圖表設定）；③合併儲存格標題、多層表頭尚未處理。

- **離線地圖（M2.6）**
  - 資料（`public/geo/`，已隨程式內嵌）：`world-countries.json`（Natural Earth 1:50m 國界，公共領域，已去除南極洲、座標取 2 位小數；Taiwan 顯示名改為「台灣」）、`country-aliases.json`（國名別名表，含中英日、ISO 代碼、常見簡稱）、`cities.json`（GeoNames cities5000，CC BY 4.0，約 5.3 萬城市，含漢字別名與大城市的拉丁別名）。授權說明見 `public/geo/NOTICE.txt`，App 底部標示出處。
  - **底圖**：graphic-walker 的點地圖（Leaflet）預設向 OpenStreetMap 抓圖磚，離線不可行。`src/geo/basemap.ts` 修補 Leaflet `TileLayer.createTile`（GW 把 Leaflet 打包在內並掛在 `window.L`），遇到 OSM 網址就改用 canvas 依內建國界繪製：海洋、陸地、國界、繁中國名。已用無頭 Chrome 驗證繪製正確。放大倍數越高越粗（50m 資料，適合國家／區域層級，不是街道地圖）。
  - **填充地圖**：`<GraphicWalker geographicData={{type:'GeoJSON', data, key:'name'}}>`。graphic-walker 以「地理 ID 欄的值 === 地理檔 feature 的 `properties.name`」精確比對，所以 `name` 預設是繁中國名（= `國家(地圖)` 欄）；另外會把使用者原國家欄出現過的每種寫法（United States／US／美国…）各複製一個共用幾何的 feature，讓原欄位（如 Country）也能直接拖進「地理 ID」。（2026-11-10 實測回報：原 Country 欄拖進去沒上色，原因即此，已修）
  - **自動補欄位**（`src/geo/enrich.ts`，載入檔案後執行）：①已有經度／緯度欄（lat/lng/經度/緯度…）→ 標上 `geoRole`；②偵測國家欄（≥70% 的值對得上國名／ISO／別名）→ 新增 `國家(地圖)` 欄（填充地圖的 key）；③沒有座標時偵測城市欄（≥60% 對得上）→ 新增 `經度`、`緯度`，有國家欄時用來區分同名城市（Paris, FR／Paris, US）。畫面上方有提示條，可換城市欄或關閉補座標。
  - 比對規則：簡繁、大小寫、重音、標點、「市／縣／區／City」後綴、「St.」=「Saint」皆正規化；同名城市無國家資訊時取人口最多者。已測：Taipei／台北／臺北市、新北、桃園、Sao Paulo、München、Bombay、Roma 等皆正確。
  - **限制**：只有人口 5,000 以上的城市；小鎮或行政區（如部分台灣區名）可能對不到，提示條會列出找不到的名稱；爭議領土依 Natural Earth 預設；沒有街道／地形底圖（已決定不做階段三）。

---

## 8. Tableau 功能對照（2026-11-10，依 graphic-walker 0.5.3 功能清單，尚未逐項實測）

| Tableau 功能 | VizTailor | 備註 |
|---|---|---|
| 資料窗格（維度／度量、類型圖示、度量名稱／度量值、計數） | ✅ | |
| 欄／列拖曳、標記卡（色彩、大小、透明度、形狀、詳細資料、文字） | ✅ | |
| 工具提示自訂 | 🟡 | 預設顯示，細部格式不可自訂 |
| 篩選器 | ✅ | |
| 頁面（動畫） | ❌ | 不規劃 |
| Show Me 圖表類型 | 🟡 約 14 種 | 缺：樹狀圖、泡泡圖、甘特圖、子彈圖、雙軸／組合圖、桑基圖 |
| 為我選擇 | 🟡 | 只有標記類型「自動」 |
| 地圖（符號地圖、填充地圖、自動產生經緯度） | 🟡 | M2.6：國家層級離線底圖；無街道／地形 |
| 多張工作表 | ✅ | |
| 儀表板 | ⬜ | M5 |
| 故事 | ❌ | 未規劃 |
| 分析面板（趨勢線、參考線、預測、群集） | ❌ | 趨勢線／參考線有機會補 |
| 計算欄位 | 🟡 | 基礎（需開實驗功能）、分箱、對數；無 LOD／表計算／參數／集／群組／階層 |
| 多資料表關聯、聯集 | ⬜ | M3 DuckDB |
| 資料庫連線 | ⬜ | M7 |
| 復原／重做、列欄互換、排序、匯出 PNG/SVG | ✅ | |
| 儲存工作簿 | ⬜ | M4 |
| 簡報模式、分享、伺服器 | ➖ | 離線單機不需要 |

建議補齊順序：地圖（M2.6）→ 專案存檔（M4）→ 儀表板（M5）→ 趨勢線／參考線 → 多資料表關聯（M3）。

---

## 9. 授權與安全評估（2026-11-10）

**費用**：執行與散布都不需付費。圖表引擎、桌面殼、前端框架、資料來源皆為免費授權（明細見 `THIRD-PARTY-NOTICES.md`）。唯一與費用有關的是**開發機**的 Visual Studio Build Tools：Microsoft 授權要求編譯自家（非開源）程式需有有效的 Visual Studio 授權（Community／Professional／Enterprise 皆可，視公司規模而定）。只在開發機需要，使用者執行 exe 不需要。

**授權注意事項**
- graphic-walker：Apache-2.0 + Branding License。須在介面標明以其為基礎、保留 Kanaries 標誌（工具列上的鳥）。已在底部加上標示；**不可移除標誌**，否則授權自動終止。
- react-leaflet（含於 graphic-walker）：Hippocratic License 2.1，非 OSI 開源授權，公司法務可能要審。
- GeoNames：CC BY 4.0，已在 App 底部標示。

**安全面**
- 對外連線：CSP `connect-src` 只允許 self／ipc；未啟用 http／shell／fs／updater plugin。graphic-walker 程式碼內含 kanaries.net（AI 功能、圖表資訊）與示範資料集的外部網址，皆被 CSP 擋下、且未設定 AI 功能，不會送出資料。
- 供應鏈：正式版內嵌約 422 個 npm 套件（多為 graphic-walker 的間接相依）。正式發佈前在開發機跑 `npm audit --omit=dev`、`cargo audit`，並固定 `package-lock.json`（xlsx 來自 SheetJS CDN，鎖定 integrity hash）。
- exe 未簽章：公司電腦的 SmartScreen／Defender／AppLocker 可能攔截。解法：用公司程式碼簽署憑證簽章（M6），或請資安白名單。
- CSP 含 `unsafe-eval`（vega 需要）。
- 開啟 Excel 時由 SheetJS 解析：只開信任來源的檔案，並保持 0.20.2 以上版本（已修 2023–2024 年的已知弱點）。

## 10. 色彩與大小面板、release 腳本（2026-11-10）
- `src/palette.tsx`：頂端「色彩與大小」面板（原生 `<input type=color>`，不新增套件）。可改分類色盤（10 色）、連續／發散色階（2～3 色標＋反轉）、預設單色、「大小」欄位的標記面積範圍（預設 40～1200，讓散佈圖點更顯眼）；設定存 localStorage。
- 實作：產生 `vizThemeConfig`（vega `range.category/ramp/heatmap/diverging/ordinal` ＋ 各 mark 預設色）與 `scales.size`，傳給 `<GraphicWalker>`；地圖的色階（`useColorScale`）讀同一份 theme，所以填充地圖／興趣點一併套用。
- 限制：發散色階不會以 0 為中點（色標在 min～max 間等距），Profit 這類正負值的中點會偏移；需要時另做。GW 設定面板內選的「色盤」會覆蓋此處設定。
- `build-release.bat`：雙擊 → 檢查 node/npm/cargo → `npm run tauri build -- --no-bundle` → 複製為 `release\VizTailor.exe` 並顯示大小。**尚未實際執行**。
- 參數與計算欄位已改為自建，見 §11。

## 11. 參數與計算欄位（2026-11-10，程式完成，**尚未在 app 內實測**）
- 背景：graphic-walker 0.5.3 沒有 Tableau 式參數；它的「新增計算欄位」是實驗功能且為 SQL 運算式，本機運算引擎沒有 SQL（需 M3 DuckDB）。調查過的現成函式庫都不採用：expr-eval 有嚴重 CVE、HyperFormula 是 GPLv3、其餘（@antv/expr、jsep 系、fparser）語法不是 Tableau 式。→ 自寫，零新增相依套件，不用 eval／new Function。
- `src/calc/expr.ts`：詞法＋Pratt 解析＋閉包求值。`[欄位]`、`[@參數]`、`+ - * / % ^`、比較、`AND/OR/NOT`（三值邏輯）、`IF/ELSEIF/ELSE/END`、`CASE/WHEN`、約 40 個函式（數學／文字／日期／ISNULL·IFNULL·ZN·IIF）、`//` 註解。NULL 與除以 0 → NULL。錯誤帶字元位置。`tests/expr.test.ts`（85 項）全過：`node --experimental-strip-types tests/expr.test.ts`。
- `src/calc/apply.ts`：`applyCalcs(ds, state)` 逐列算出新欄位（可引用前面的計算欄位），型別自動判定（全數字→度量，否則維度；布林→"TRUE"/"FALSE"）。`src/calc/sync.ts`：新增／刪除計算欄位時，用 `storeRef` 匯出→修補→匯入圖表，保留已拖好的圖。`src/calc/CalcPanel.tsx`：右側抽屜（參數：數字滑桿／輸入、文字下拉、布林；計算欄位：公式編輯＋即時檢查＋插入欄位／參數／函式）。狀態依 `raw.id` 分開存，重新補座標不會遺失。
- 限制：只支援逐列計算；聚合（SUM）與 LOD 待 M3 DuckDB。參數與計算欄位只存在記憶體，關閉即消失（M4 專案存檔時再納入）。
- 待實測：①新增計算欄位後左側欄位清單是否出現、已拖好的圖是否保留；②改參數值圖表是否重算（`data` prop 變動）；③5 萬列資料拖滑桿是否順暢。

## 12. 匯入格式判斷、繁體用語統一（2026-11-10，程式完成，尚未在 app 內實測）
- `src/dataset.ts` 欄位型別判斷擴充（單元測試 `tests/dataset.test.ts` 全過）：
  - 日期：`2025-11-28`／`2025/11/28`、`2025年11月28日`、`11/28/2025`（整欄有第一位 >12 則判為日/月/年，全部不確定則預設月/日並在提示條說明）、`28-Nov-2025`、`Nov 28, 2025`、民國（`114/11/28`、`民國114年11月28日`，換算成西元）、帶時間；欄名像日期（date／日期／時間／…日）時另認 `20251128` 與 Excel 日期序號。日期欄一律是「時間」類型，可用欄位選單的「時間粒度」展開年／季／月／週／日。
  - 數字：千分位須為正確 `1,234` 形式（`1,2,3` 之類是文字）、貨幣符號（$、NT$、元…）、結尾 %（移除 %，數值以百分點表示並提示）、全形數字、`(1,200)` 負數。
  - 編號欄：欄名含 ID／Code／Zip／Postal／編號／代碼／代號／郵遞區號／序號，且全為整數 → 當維度（文字），不被加總。
  - 判斷結果與假設會顯示在畫面上方的黃色提示條（`Dataset.notes`）。測試檔：`sample-data/mixed-formats.csv`。
- 繁體用語：自寫介面文字已掃描，沒有簡體字或大陸用語（地理比對用的簡體正規表示式除外）。`src/i18n.ts` 補了 opencc 沒轉到的用語（質量→品質、反饋→回饋、當前→目前、匹配→符合、點擊→點選、型別→類型、語義→語意、方差→變異數、均值→平均值）、簡體式引號 “ ” 改「」，並依 Tableau 繁中命名覆蓋：欄（columns）／列（rows）、詳細資料、文字、長條圖、散佈圖、總計；補上 zh-CN 語言檔缺漏／筆誤的鍵（比例尺類型、星期幾）。
- 仍是英文：Q1／Q3、GeoJSON／TopoJSON 等專有名詞。

## 13. 日期欄位膠囊的粒度選單、頁尾精簡（2026-11-10，程式完成，**尚未在 app 內實測**）
- `src/pillDrill.ts`：欄／列／顏色等區域裡的日期欄位膠囊右側多一個 ▾，點開直接選 年／季度／月／週／日／時／分／秒／原始日期，就地換成該粒度（同 Tableau 膠囊選單）。原生的「左側欄位 ▾ → 時間粒度」仍可用。
- 做法：Graphic Walker 沒有擴充膠囊的 API，且在 shadow DOM 內 → 用 `MutationObserver` 找 `[data-rbd-draggable-id^="encode_"]` 的膠囊補按鈕；換欄位時 `exportCode()` → 修改 → `importCode()`（衍生欄位格式與 GW 的 `createDateDrillField` 相同，已存在的粒度會重用）。單元測試 `tests/pillDrill.test.ts`（以假 store 驗證）。**依賴 GW 0.5.3 的 DOM 屬性與 `data-rbd-draggable-id` 格式，升級 GW 時要重驗。**
- 頁尾改為一行：「基於 Graphic Walker（Kanaries）· 城市座標 © GeoNames（CC BY 4.0）· 第三方授權」。需揭露的只留這兩項（GW 品牌條款、GeoNames CC BY 4.0）；Natural Earth 為公共領域，不必標示。完整授權清單收進頁尾的「第三方授權」連結（彈出視窗，內容即 `THIRD-PARTY-NOTICES.md`，隨程式打包），不佔版面。
- 待實測：①日期膠囊是否出現 ▾、點選後圖表是否換成年／月；②按 ▾ 不會誤觸拖曳；③換粒度後左側欄位清單多出「年 (Order Date)」等衍生欄位屬正常現象。

## 14. LouisTool 雙髻鯊簽名游標（尚未在 app 內實測）

- `src/sharkCursor.ts`：移植自本機 desktop-shark-cursor 技能的網頁原型（DotMatrixSharkCursor 的 canvas 版，Label `LouisTool`、Kind `hammerhead`）。全離線、純 canvas、無 eval。鯊魚長度與點陣格子整體縮為 70%（`SHARK_SCALE = 0.7`）。
- 吻端 = 游標熱點；靜止 2.5 秒後停止重畫（CPU ≈ 0）；系統開「減少動態效果」時不啟用。
- 隱藏系統游標：`html.vt-shark * { cursor: none }`，並用 adoptedStyleSheets 注入 Graphic Walker 的 shadow DOM（MutationObserver 追蹤新出現的 shadow root）。
- 甩尾特效只在「點空白處」觸發：點到按鈕、輸入框、欄位 pill、圖表（canvas/svg）、地圖、面板、對話框都不觸發（`INTERACTIVE` 選擇器，可自行增減）。
- `src/SharkToggle.tsx`：footer 左下角開關「🦈 簽名游標：開／一般游標」，預設開，localStorage `viztailor.shark.v1`。
- 待實測：拖曳欄位時是否被干擾、GW 內部游標是否都隱藏、空白判斷是否合適。

## 15. 填充地圖防當機（尚未在 app 內實測）

- 現象（2026-11-10 回報）：「地理 ID」同時放 Country 與 Row ID → WebView「Out of Memory」，離線底圖磚也畫不完。
- 原因：graphic-walker 的 Leaflet 填充地圖是「每一列（每個分組）畫一個完整的國家多邊形」；Row ID 有 5 萬種值 → 5 萬個多邊形。
- 對策 `src/geoGuard.ts`：用 mobx `reaction` 監看目前圖表（同一個 tick 內反應，早於資料查詢完成）。填充地圖時：「地理 ID」只留第一個欄位；標記數（各維度不同值數的乘積，上限 600）過大就依基數由大到小拿掉 color/opacity/text/details 的維度欄位；「不聚合」且列數 > 600 時改成聚合。拿掉後在頁面上方顯示黃色提示。
- `mobx` 補進 package.json／package-lock（原本只是 graphic-walker 的相依套件，已安裝同一份 6.16.1）。
- 測試：`tests/geoGuard.test.ts`。

## 16. 離線地圖變慢／載不完整的修正（尚未在 app 內實測）

- 現象：填充地圖／符號地圖的底圖磚只出現一部分，等很久也不完整。
- 原因（推論，尚未用瀏覽器分析器證實）：底圖每一塊磚都用完整 1:50m 世界邊界（約 9.5 萬個點、1,500 個島嶼部分）重畫一次；GW 的填充地圖又為每個島嶼部分各建一個 Leaflet 多邊形＋提示框；磚在主執行緒上同步繪製，一旦其中一塊拋錯，Leaflet 會停止建立其餘的磚。
- 對策：
  - `src/geo/simplify.ts`：Douglas–Peucker 簡化 ＋ 丟掉小島（每個國家保留最大塊）。
  - `src/geo/basemap.ts`：三級細節（縮放 ≤2 用粗版 7 千點、≤4 用中版 2 萬點、其餘完整）；磚每個動畫影格只畫幾塊（不凍結介面）；畫好的磚快取 160 塊；單塊失敗只記錄警告、不再中斷其餘磚；世界重複區塊（x 超出範圍）取對應的磚。
  - `src/App.tsx`：傳給 GW 的填充地圖幾何改用簡化版（容差 0.06°、略過小於 0.6° 的島嶼，約 590 塊）。國家名稱↔幾何的對應（含原欄位各種寫法）不變。
- 測試：`tests/simplify.test.ts`。若仍不完整，請在 `npm run tauri dev` 的視窗按 F12 看 Console 是否有 `basemap tile failed`。

## 17. 地圖「破圖」的真正原因：leaflet.css 沒載到（尚未在 app 內實測）

- graphic-walker 在 shadow root 裡用 `<link href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">` 載入 Leaflet 樣式；離線＋CSP（`style-src 'self' 'unsafe-inline'`）下載不到 → 底圖磚沒有絕對定位（散落、只看到幾塊）、多邊形圖層不顯示。§16 的簡化只是加速，不是破圖主因。
- 對策：`src/geo/leaflet.css`（Leaflet 1.9.4 樣式的本地副本，BSD-2，已移除圖片規則）＋ `src/geo/leafletCss.ts`（以 adoptedStyleSheets 注入每個 shadow root），`App.tsx` 啟動時呼叫 `installLeafletCss()`。

## 18. 打包版「Computation service … Failed to fetch」（待重新打包驗證）

- 現象：打包後的 exe（`tauri.localhost`）改顏色時跳出 Oops！`TypeError: Failed to fetch at blob:http://tauri.localhost/...`。
- 原因：graphic-walker 的運算 worker（`transform.worker`，以 blob 方式啟動）內含 `fetch("data:application/octet-stream;base64,…")` 來解壓縮資料；CSP 的 `connect-src` 沒有 `data:`／`blob:`，被擋。
- 對策：`tauri.conf.json` 的 `csp` 與 `devCsp` 的 `connect-src` 加上 `data: blob:`（只是本機內嵌資料，不開放任何外部網路）。需重新執行 `build-release.bat`。

## 19. 編輯色彩（Tableau 風格逐值上色）

- 頂部按鈕「編輯色彩」：讀取目前放在「顏色」的欄位，左邊列出該欄位所有值（可搜尋、Ctrl／Shift 多選），右邊選調色盤（Tableau 10／20、色盲、Classic 10、高對比、柔和、交通燈、灰階）後點色塊指派；另有「指派調色盤」（依序套給全部）、自訂色（原生色彩選擇器）、重設／確定／取消／套用。
- 實作：Graphic Walker 的 `scales.color` 可為函式，回傳 vega 的 `{domain, range}`。函式拿不到欄位 id，所以以「對應表（欄位→值→顏色）與實際值重疊最多」的欄位為準；沒指定的值沿用「色彩與大小」的分類色盤。純函式在 `src/colorScale.ts`（測試：`tests/colorScale.test.ts`），UI 在 `src/colorEdit.tsx`。
- 對應表存 localStorage `viztailor.colormap.v1`（依欄位 id，不分資料集）。
- 限制：連續（數值）欄位是漸層，不支援逐值；請改成維度或用「色彩與大小」換漸層。
- **一鍵排色**（編輯色彩對話框右上）：選度量（預設取圖表上正在用的）、彙總（加總／平均／筆數）、色帶（紅／橘／藍／綠／紫／灰＋兩種發散）、分布（依名次／依數值比例）、反轉 → 自動替每個值配深淺，左側清單改依度量由高到低排。純函式 `autoAssign`／`rampAt` 在 `src/colorScale.ts`。以整份資料計算，不跟圖表篩選連動；資料換了要再按一次。
