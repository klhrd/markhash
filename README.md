# MarkHash v6.13

這是一個輕量化的 Markdown 線上編輯器 PWA，支援即時預覽、KaTeX 數學公式以及透過 URL Hash 進行無伺服器分享。

## 🌟 特色功能

- **即時預覽**：採用 Web Worker 處理 Marked.js 解析，效能流暢。
- **高壓縮比分享**：使用 LZ-String 壓縮文字並儲存於 URL Hash，無需資料庫。
- **PWA 支援**：可安裝至手機或電腦，支援離線使用。
- **數學公式**：內建 KaTeX 支援。
- **縮網址整合**：整合 Is.gd 與 TinyURL 服務。

## 🚀 如何使用

1. 直接開啟 `index.html`。
2. 在左側輸入 Markdown 語法，右側即時顯示結果。
3. 點擊分享按鈕即可複製含有內容的長連結或產生縮網址。

## 🛠 技術棧

- 原生 JavaScript (ES6+)
- [Marked.js](https://marked.js.org/) (Markdown 解析)
- [LZ-String](https://pieroxy.net/lua/lz-string/) (資料壓縮)
- [KaTeX](https://katex.org/) (數學公式)

