# MarkHash 開發路線圖

## 專案原則（所有開發工作必須遵守）

1. **所有開發一律在新開的 branch 上進行**，勿直接改 `master`。
2. **這是 GitHub Pages 專案，保持輕量化**：無建置流程、無 node_modules、純靜態檔案，改動越小越好。
3. **部署必須走 GitHub Pages deploy yml**（`.github/workflows/deploy.yml`），不使用「deploy from branch」舊模式。
4. **每次變更前端檔案（html/css/js）必須同步 bump `sw.js` 的 `CACHE_NAME`**：SW 採 cache-first，不改 sw.js 位元組內容就不會觸發更新，既有 PWA 使用者會永遠拿到舊快取。

---

## v6.14 執行時問題修復（branch: `fix/v6.14-runtime`）

依嚴重度排序，逐一修復：

| 順位 | 問題 | 影響 | 狀態 |
|------|------|------|------|
| P0-1 | IME 衝突：Enter 處理器未檢查 `isComposing`，注音/倉頡選字時被插入換行或清單符號 | 中文輸入被打斷（zh-TW 致命傷） | ✅ |
| P0-2 | hash 殘留：清空內容時 `compressToEncodedURIComponent("")` 回傳空字串，`if (hash)` 跳過更新 → 重新整理舊內容復活、分享到錯誤內容 | 資料正確性 | ✅ |
| P0-3 | Service Worker 從未註冊，PWA 離線/安裝完全無效；且 `cache.addAll` 全有或全無（Google Fonts 失敗 → 整個 SW 掛掉）、無 activate 清理舊快取、快取清單缺漏 | 離線功能失效 | ✅ |
| P0-4 | Worker 無聲死亡：CDN `importScripts` 任一失敗 → 預覽永久空白、零提示；補上 `onerror` 容錯與主執行緒備援 | 預覽可靠性 | ✅ |
| P1-1 | 縮網址靜默失敗：is.gd 超過長度上限或回錯誤時，`shortUrl` 為空卻沒有任何提示；另補上 `file://` 協定檢查 | 分享功能 UX | ✅ |
| P1-2 | CDN 依賴未釘版本（`marked`、`marked-katex-extension`），上游 breaking change 會直接弄壞 Worker | 長期穩定性 | ✅ |
| P1-3 | highlight.js dead weight：SW 快取了 `highlight.min.js`、頁面載入兩個 hljs CSS，但程式碼從未使用（無語法高亮） | 輕量化 | ✅ |
| P1-4 | 版本號不同步：manifest.json / README 仍寫 v6.13 | 一致性 | ✅ |
| P1-5 | DOMPurify 3.0.6 → 3.2.4（3.1+ 含 mXSS 安全性修補） | 安全性 | ✅ |

### 修復方式摘要

- **P0-1**：keydown 進入時檢查 `e.isComposing || e.keyCode === 229`，IME 組字期間完全放行原生行為。
- **P0-2**：移除 `if (hash)` 條件，一律 `try { history.replaceState(null, null, '#' + hash) } catch {}`；空字串壓縮後 URL 變成 `#`，重新整理即為空白編輯器。
- **P0-3**：`file.js` 加入 SW 註冊（僅 https/http 環境）；`sw.js` 改為逐檔 `cache.add` + `Promise.allSettled`（單檔失敗不影響其他）、activate 時刪除舊版快取、fetch 加導頁 fallback；快取清單補齊（Roboto Mono 字體 CSS）並移除 hljs。
- **P0-4**：`worker.onerror` 觸發時動態載入 marked/katex/marked-katex-extension 到主執行緒，無縫降級為同步渲染，並以 toast 提示。
- **P1-1**：`shortenUrl` 失敗分支補上 toast；開頭檢查非 http(s) 協定直接提示。
- **P1-2**：釘選 `marked@12.0.2`（peer 範圍 ≥4 <19 內）、`marked-katex-extension@5.1.13`（已驗證 jsdelivr 可取得）。

---

## v6.14.1 Hotfix（branch: `fix/cors-sw-hotfix`，部署後回報問題修復）

| # | 問題 | 根因 | 修復 | 狀態 |
|---|------|------|------|------|
| H-1 | Console 警告 `apple-mobile-web-app-capable` deprecated | Chrome 要求新 meta 名稱 | 補上 `<meta name="mobile-web-app-capable" content="yes">`（舊 tag 保留給 iOS） | ✅ |
| H-2 | 縮網址 CORS error（`No 'Access-Control-Allow-Origin'`） | allorigins proxy 不穩（408 逾時），且錯誤回應不帶 CORS headers，瀏覽器誤報為 CORS 問題；且分享連結經雙重編碼後 proxy 請求長達數 KB | 實測確認 **is.gd 原生支援 CORS（ACAO: \*）→ 改為直接呼叫**，擺脫 proxy 單點故障；tinyurl 無開放 CORS（ACAO 僅允許自家）→ 維持走 proxy，失敗時有 toast 提示。實測 is.gd：URL 上限 5000 字元（超過回 `errorcode:1`），≥4KB 時間歇性 `database insert failed`，且錯誤回應不帶 ACAO（瀏覽器會顯示為 CORS/網路錯誤，由 toast 統一提示） | ✅ |
| H-3 | `sw.js: Uncaught TypeError: Failed to convert value to 'Response'`（×2） | fetch 失敗且非 navigate 請求時，catch 回傳 `undefined` 給 `respondWith` | 一律回傳 `Response.error()`；navigate fallback 亦保證非 undefined；`CACHE_NAME` bump 至 `v6.14.1` 觸發舊快取清理 | ✅ |

---

## v6.14.2（branch: `fix/style-tag-preview`）：文件開頭 `<style>` 不生效

| 問題 | 根因（經 jsdom 全管線實測重現） | 修復 | 狀態 |
|------|------|------|------|
| Markdown 文件開頭的 `<style>` 不生效，內文中段的 `<style>` 卻正常 | DOMPurify fragment 模式用 `DOMParser` 解析成完整 Document 後**只消毒 `<body>`**。按 HTML 解析規範，出現在文件開頭（前方無任何 body 內容）的 `<style>` 會被放進 `<head>` → 不在 body → 被**靜默丟棄**（連 `DOMPurify.removed` 都無紀錄）。`<style>` 本身其實在 html profile 允許清單內，故放在段落後面就會生效 | `SANITIZE_OPTS` 加 `WHOLE_DOCUMENT: true`，消毒範圍涵蓋 `<head>`；輸出含 `<html><head>` 包裝，經 `preview.innerHTML` 賦值時瀏覽器會剝除外層標籤、保留 style 元素於原位。實測 KaTeX（inline/display/MathML/mathvariant）、表格、程式碼區塊皆不受影響 | ✅ |

備註：
- 安全性：`<style>` 允許是 DOMPurify html profile 的既有行為（內文中段本來就會生效），本次修復只是讓文件開頭的行為一致，未擴大攻擊面。CSS 無法執行 JS，但分享連結本就允許他人 CSS 注入（樣式偽造/追蹤），屬既有設計取捨。
- 本次同時 bump `CACHE_NAME` 至 `v6.14.2`（原則 4 首次落實）。

---

## v6.14.3（branch: `fix/preview-style-isolation`）：預覽樣式隔離 + 原始碼區塊縮排

| # | 問題 | 根因 | 修復 | 狀態 |
|---|------|------|------|------|
| S-1 | 文件內 `<style>`（如 `* { font-size: 60px }`）把編輯區/整個介面字體放大 | `<style>` 是文檔級作用域：預覽插入的 style 元素影響整份頁面，並非僅預覽區 | 預覽改為 **Shadow DOM**（`#preview` attachShadow），文件樣式被隔離在 shadow tree 內無法外洩；KaTeX 與 github-markdown CSS 改以 constructable stylesheet `adoptedStyleSheets` 注入 shadow 內（KaTeX 字型相對路徑改寫為 CDN 絕對路徑），並移除 index.html 對應的兩個 `<link>`。不支援的舊瀏覽器自動退回舊行為 | ✅ |
| S-2 | `<style>/<script>` 區塊內按 Enter 會自動填清單符號（CSS 的 `* {` 被誤判為 `* ` 清單） | Enter 智慧清單的 regex `/^(\s*)([-*+]\s+)?/` 不認識原始碼區塊 | 新增 `inRawBlock()`（追蹤游標前未閉合的 `<style>`/`<script>` tag），區塊內 Enter：**不填清單符號**，改為智慧縮排——沿用目前縮排、行尾 `{`/`:` 加一層（4 空格）、行首 `}` 退一層 | ✅ |

備註：
- Shadow DOM 隔離後，使用者文件中的 `<style>` 可正常美化預覽區（含 `*` 萬用選擇器），但 `body`/`html`/`:root` 選擇器在 shadow 內不會命中（可改用 `.markdown-body` 選擇器）。
- `CACHE_NAME` bump 至 `v6.14.3`（原則 4）。

---

## v6.14.4（branch: `feat/editor-syntax-colors`）：編輯器 HTML/CSS/LaTeX 語法上色

| # | 項目 | 說明 | 狀態 |
|---|------|------|------|
| C-1 | `<style>/<script>` 區塊語法上色 | 區塊先抽成 placeholder（內容不再被 Markdown 規則誤判——CSS 的 `* {` 不再變清單紫、`#id` 不再變標題藍），內部另標色：HTML 標籤 teal、CSS 選擇器橘/屬性藍/值綠/註解灰斜體/字串琥珀；未閉合區塊（輸入中）比照處理 | ✅ |
| C-2 | 內聯 HTML 標籤上色 | 一般文句中的 `<div>`、`<br/>` 等標籤以 teal 另標色 | ✅ |
| C-3 | LaTeX `\command` 另標色 | 數學式整體維持 magenta，反斜線指令（`\frac`、`\sum` 等）另標深一階的色 | ✅ |
| C-4 | 引言規則修復（既有 bug） | 原規則匹配原始大於符號，但文字在該階段已跳脫為實體形式，引言上色從未生效；改為匹配跳脫後的形式 | ✅ |

備註：
- 上色為 regex 迷你實作（輕量化原則），非完整語言解析器；多重偽類選擇器跨行等少數邊角會有色偏，屬可接受範圍。
- 開發備忘：編輯工具會將參數中的 HTML 實體字元（amp/lt/gt）解碼，撰寫此類字面值時須以 `\u0026` Unicode 跳脫形式寫進 JS 原始碼。
- `CACHE_NAME` bump 至 `v6.14.4`（原則 4）。

---

## v6.14.5（branch: `style/selection`）：::selection 選取反白優化

| # | 項目 | 說明 | 狀態 |
|---|------|------|------|
| V-1 | 選取色改為半透明主題色調 | 以 `--selection-bg`（亮/暗各一）取代瀏覽器預設實心反白：編輯器的語法著色可透過選取範圍顯現（textarea 文字本身透明，預設實心選取色會整片蓋掉語法顏色）。只設 background、不設 color，避免透明文字被染色而與底層高亮文字重疊 | ✅ |
| V-2 | Shadow DOM 內補選取規則 | 文件樣式進不了 shadow tree，預覽區的選取規則補進 `localSheet`（CSS 變數可跨邊界繼承，自動跟隨亮/暗主題） | ✅ |

- `CACHE_NAME` bump 至 `v6.14.5`（原則 4）。

---

## v6.14.6（branch: `feat/mobile-init-share-menu`）：初始頁面邏輯與分享選單改版

| # | 項目 | 說明 | 狀態 |
|---|------|------|------|
| M-1 | 行動版初始頁面 | 空白文件落在編輯頁（作者情境），帶內容的分享連結落在展示頁（讀者情境）；桌機雙欄不受影響 | ✅ |
| M-2 | 分享選單改版 | 移除 Is.gd / TinyURL 縮網址（含 `shortenUrl()` 與 proxy 相關程式碼），改為 **Copy URL**（複製完整連結）與 **Share**（Web Share API 系統分享面板；不支援的環境退回複製、AbortError 靜默略過）；選項與相關 toast 全部英文化 | ✅ |
| M-3 | Import/Export 標籤 | 選單文字去除中文，僅保留英文（Import / Export） | ✅ |

- `CACHE_NAME` bump 至 `v6.14.6`（原則 4）。
- 縮網址服務的長度限制與 proxy 單點故障問題（見 v6.14.1 H-2）隨功能移除一併消失；完整連結分享回歸 MarkHash 的 hash 原生機制。

---

## v6.14.7（branch: `feat/ux-polish`）：編輯體驗修復 + Quick Wins（依使用者決策）

| # | 項目 | 說明 | 狀態 |
|---|------|------|------|
| U-1 | Undo/redo 修復 | 新增 `applyEdit()`：`setSelectionRange` + `execCommand('insertText'/'delete')`（原生 undo 堆疊、原生 input），失敗退 `setRangeText`；改寫全部 5 個編輯點（Tab / raw-block Enter / 清單三分支），**同時修好有選取範圍時不刪除選取內容** | ✅ |
| U-2 | highlightContent debounce 40ms | 原本每按鍵同步跑 15+ regex pass；Markdown 渲染本來就有 150ms debounce，高亮現在跟進 | ✅ |
| U-3 | `codeContext()` 取代 `inRawBlock` | ```/~~~ 圍籬與 `<style>/<script>` 都走智慧縮排（圍籬內不再誤填清單符號，與高亮層一致）；行內 code 以等長空白消除（`` `<script>` `` 教學文字不誤觸發）；圍籬計數先於行內消除以保護 ``` 行首 | ✅ |
| U-4 | UI 全英文 + 移除版本標籤（使用者決策） | worker toast、placeholder 英文化；`lang=en`；version-tag 元素與樣式移除；title/manifest/README 均為純 `MarkHash` | ✅ |
| U-5 | Quick Wins | favicon、亮/暗 theme-color、icon 按鈕 aria-label、meta description + OG tags、暗色模式預覽 code block 覆寫（localSheet）、hash 解壓失敗 toast、safe-area-inset-bottom、Esc 關閉選單、清空時 URL 移除 `#` | ✅ |

實作中發現與修正：`compressToEncodedURIComponent('')` 實際回傳 `'Q'`（並非空字串），且 LZString 對**無效輸入也可能回傳空字串**（非僅 null）——「損毀連結」偵渤改為**往返驗證**（`compress(decompress(h)) === h`，已驗證對空文件、CJK、長文皆確定性往返）；空內容判定改用 `len`/`text` 而非 hash 真值，清空後 URL 乾淨回到 pathname。

- `CACHE_NAME` bump 至 `v6.14.7`（原則 4；版本顯示已移除，快取版本為內部維護用）。

## 未來待辦（Backlog，本次不處理）

- 編輯器 `editor.value = ...` 直接賦值破壞原生 undo stack（Ctrl+Z 失效）→ 改用 `setRangeText` 或 `execCommand('insertText')`。
- Enter 邏輯：有選取範圍時未刪除選取內容（只用了 `start` 沒用 `end`）；縮排退回應逐級而非全有全無；Shift+Enter、Shift+Tab 反縮排未支援。
- 匯入檔案編碼：`readAsText` 預設 UTF-8，Big5/GBK 檔案亂碼。
- 分享連結被通訊軟體（LINE 等）截斷時，解壓回 null 靜默開空白 → 補提示「連結可能已損毀」。
- Google Fonts（Material Symbols）在中國被牆 → 考慱 self-host 圖示字型或改用 SVG sprite（與輕量化原則取捨）。
- `downloadFile` 的 `createObjectURL` 未 revoke；`\uE000`/`\uE001` 私用區字元與使用者內容衝突防護。
- `user-scalable=no` 無障礙問題；行動版預設落在空白預覽頁。
- manifest 補 `maskable` icon purpose 與 screenshots。
