# MarkHash 開發路線圖

## 專案原則（所有開發工作必須遵守）

1. **所有開發一律在新開的 branch 上進行**，勿直接改 `master`。
2. **這是 GitHub Pages 專案，保持輕量化**：無建置流程、無 node_modules、純靜態檔案，改動越小越好。
3. **部署必須走 GitHub Pages deploy yml**（`.github/workflows/deploy.yml`），不使用「deploy from branch」舊模式。

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

## 未來待辦（Backlog，本次不處理）

- 編輯器 `editor.value = ...` 直接賦值破壞原生 undo stack（Ctrl+Z 失效）→ 改用 `setRangeText` 或 `execCommand('insertText')`。
- Enter 邏輯：有選取範圍時未刪除選取內容（只用了 `start` 沒用 `end`）；縮排退回應逐級而非全有全無；Shift+Enter、Shift+Tab 反縮排未支援。
- 匯入檔案編碼：`readAsText` 預設 UTF-8，Big5/GBK 檔案亂碼。
- 分享連結被通訊軟體（LINE 等）截斷時，解壓回 null 靜默開空白 → 補提示「連結可能已損毀」。
- Google Fonts（Material Symbols）在中國被牆 → 考慱 self-host 圖示字型或改用 SVG sprite（與輕量化原則取捨）。
- `downloadFile` 的 `createObjectURL` 未 revoke；`\uE000`/`\uE001` 私用區字元與使用者內容衝突防護。
- `user-scalable=no` 無障礙問題；行動版預設落在空白預覽頁。
- manifest 補 `maskable` icon purpose 與 screenshots。
