# VizTailor

在自己的電腦上離線使用的拖曳式資料視覺化工具，操作類似 Tableau。雙擊 `viztailor.exe` 即可使用，不用安裝、不用登入、不用網路。

## 它能做什麼

- 開啟 **CSV**（UTF-8 或 Big5）與 **Excel**（.xlsx / .xls，多個工作表可切換）。
- 把欄位拖曳到 列／欄／顏色／大小，做出長條圖、折線圖、散佈圖、熱力圖、圓餅圖、箱形圖等。
- **地圖**：資料裡有城市或國家名稱時，自動補上經緯度與國家欄位，可做符號地圖與填充地圖（國家層級）。
- 介面為繁體中文。

## 資料安全（重點）

| 疑慮 | 說明 |
|---|---|
| 資料會不會被上傳？ | **不會。** 程式只讀你自己開啟的檔案，沒有帳號登入、沒有自動更新，並被設定為禁止連到任何外部網址。 |
| 需要網路嗎？ | **不需要。** 世界地圖與城市座標資料都已內建。 |
| 會改動我的原始檔嗎？ | **不會。** 檔案只讀取，補上的欄位只存在畫面中。 |
| 想自己驗證？ | 在 Windows 防火牆對 `viztailor.exe` 新增一條「封鎖所有輸出連線」規則，程式功能完全不受影響。 |
| 會儲存或備份我的資料嗎？ | 程式本身不會。關閉視窗後，畫面上的圖表和補上的欄位即消失。 |

## 系統需求

- Windows 10 / 11（64 位元）。
- Microsoft WebView2 執行環境（Windows 11 內建；Windows 10 若已更新 Edge 通常也有）。
- 不需要安裝 Node、Rust 或任何開發工具。

## 使用方式

1. 雙擊 `viztailor.exe`。
2. 把 CSV 或 Excel 檔拖進視窗，或按「開啟檔案…」。
3. 從左側欄位清單把欄位拖到圖表區。
4. 地圖：資料有城市欄時，上方綠色提示條會顯示補上座標的結果，也可以在那裡換城市欄。
   - 符號地圖：標記選「興趣點」，放入「經度」「緯度」。
   - 填充地圖：標記選「區域圖」，把「Country」或「國家(地圖)」拖到「地理 ID」。

## 已知限制

- 一次分析一個工作表；跨工作表合併要等後續版本。
- 地圖為國家層級，沒有街道與地形。
- 城市座標只涵蓋人口 5,000 以上的城市，找不到的名稱會在提示條列出。
- 尚不能存檔／讀檔圖表設定（規劃中）。

## 授權與第三方元件

VizTailor 完全使用免費、可商用的元件，不需要購買授權：

- 圖表引擎：[Graphic Walker](https://github.com/Kanaries/graphic-walker)（Apache-2.0，附 Kanaries 品牌標示要求，**請勿移除工具列上的 Kanaries 標誌**）
- 桌面殼：Tauri（MIT / Apache-2.0）
- 地圖資料：Natural Earth（公共領域）、GeoNames（CC BY 4.0）
- 完整清單與授權條件見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；風險與評估見 [PROJECT.md](PROJECT.md) 第 9 節。

## 開發者

```powershell
cd VizTailor
npm install
npm run tauri info          # 檢查環境（Rust / MSVC / WebView2）
npm run tauri dev           # 開發模式（第一次會編譯 Rust，約 3–10 分鐘）
npm run tauri build -- --no-bundle   # 產出 src-tauri\target\release\viztailor.exe
# 或直接雙擊 build-release.bat（檢查環境→建置→複製成 release\VizTailor.exe）
```

開發機需要 Visual Studio Build Tools（編譯自家程式需要有效的 Visual Studio 授權）；使用者執行 exe 不需要。

測試資料在 `sample-data/`：CSV 兩種編碼、Excel 多工作表、世界城市（含／不含座標）。
