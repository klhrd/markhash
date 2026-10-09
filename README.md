# MarkHash

A lightweight, zero-build Markdown editor PWA. Your document lives entirely in the URL hash — no database, no accounts. Share the link and you share the document.

## ✨ Features

- **Live split-view editing** — Markdown is parsed in a Web Worker (marked.js), with a debounced syntax-highlighting overlay on top of the editor; Markdown syntax, HTML tags, CSS blocks and LaTeX commands each get their own colors
- **Serverless sharing** — content is compressed with LZ-String into the URL hash; copy the full URL or use the system share sheet (Web Share API). Damaged or truncated links are detected and reported instead of silently opening empty
- **Isolated preview** — the preview renders inside a Shadow DOM, so `<style>` blocks in your document can style the preview without leaking into the editor or the rest of the UI
- **Math typesetting** — KaTeX with the proper serif fonts, hoisted at document level with `font-display: swap`
- **Three view modes** — split view (desktop default), editor-only and preview-only; one click cycles through them. On mobile, the initial view follows the content source: shared links open on the preview, drafts and empty documents on the editor
- **Smart, undo-friendly editing** — list continuation, ordered-list renumbering, auto-indent inside code fences and `<style>/<script>` blocks, Tab indent; every edit goes through `execCommand` so the native undo stack (Ctrl+Z) is preserved, and Enter handling is IME-safe
- **Draft autosave** — an unsaved draft is kept in localStorage and restored on your next visit
- **Import / Export** — import via file picker or drag & drop; export via download, Ctrl+S, or Print to PDF
- **Installable PWA** — offline-capable through a Service Worker with tolerant per-asset caching and stale-cache cleanup
- **Dark mode** — automatic light/dark palettes for the UI, the editor and the preview (including print output)
- **Lightweight by design** — plain HTML/CSS/JS, no build step, no node_modules

## 🚀 Usage

1. Open the GitHub Pages URL. (Opening `index.html` locally works for editing, but sharing and the Service Worker require an http/https origin.)
2. Type Markdown on the left, see it rendered live on the right.
3. Use the share menu to copy the full URL or open the system share sheet.

## 📁 Project structure

```
├── index.html / manifest.json / sw.js   # entry point, PWA manifest, service worker
├── js/file.js                           # application logic
├── css/style.css                        # UI styles
├── images/icons/                        # app icons
├── tests/sample.md                      # full-feature test document
├── tools/logo.html                      # SVG logo design & export tool
└── docs/roadmap.md                      # development log, principles and backlog
```

## 📦 Deployment

- Deploys through the GitHub Actions workflow (`.github/workflows/deploy.yml`) — pushing to `master` publishes automatically; changes under `docs/`, `tools/` or the README do not trigger a deploy (`tests/` does — the live sample document is part of the site)
- Repository settings: Pages → Build and deployment → Source must be set to **GitHub Actions**
- Any change to frontend files (html/css/js) must bump `CACHE_NAME` in `sw.js` — the cache-first Service Worker will not refresh them otherwise (see principle 4 in `docs/roadmap.md`)

## 🛠 Tech stack

- Vanilla JavaScript (ES6+), no build step
- [marked.js](https://marked.js.org/) + [marked-katex-extension](https://github.com/UziTech/marked-katex-extension) — Markdown parsing and math integration
- [KaTeX](https://katex.org/) — math typesetting
- [DOMPurify](https://github.com/cure53/DOMPurify) — output sanitization (WHOLE_DOCUMENT mode)
- [LZ-String](https://pieroxy.net/lua/lz-string/) — URL-hash compression
- Shadow DOM + constructable stylesheets — style isolation for the preview
