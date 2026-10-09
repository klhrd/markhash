const editor = document.getElementById('editor');
const editorHighlighting = document.getElementById('editor-highlighting');
const sizeText = document.getElementById('sizeText');
const sizeDot = document.getElementById('sizeDot');
const urlStats = document.getElementById('urlStats');

// v6.14 CDN 依賴（一律釘選版本，避免上游 breaking change）
const CDN = {
    marked: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
    lzString: 'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js',
    katex: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
    katexExt: 'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.13/lib/index.umd.js',
    katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    markdownCss: 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css'
};

// v6.14.3 預覽採 Shadow DOM 隔離：文件內 <style> 只作用於預覽區，
// 不會外洩影響編輯器與整個介面（如 * { font-size: 60px }）
const previewHost = document.getElementById('preview');
let preview = previewHost;
let previewShadow = null;
if (previewHost.attachShadow && window.CSSStyleSheet && CSSStyleSheet.prototype.replaceSync) {
    previewShadow = previewHost.attachShadow({ mode: 'open' });
    preview = document.createElement('div');
    preview.className = 'markdown-body';
    previewShadow.appendChild(preview);
    const localSheet = new CSSStyleSheet();
    localSheet.replaceSync('.markdown-body{background:transparent!important;color:var(--text-primary)!important;line-height:1.8}.katex-display{background:transparent!important;color:inherit;padding:10px 0}::selection{background:var(--selection-bg)}@media (prefers-color-scheme: dark){.markdown-body pre{background-color:#161b22;color:#e6edf3}.markdown-body pre code{background-color:transparent;color:inherit}.markdown-body code{background-color:rgba(110,118,129,0.4)}.markdown-body table tr{background-color:transparent}}');
    previewShadow.adoptedStyleSheets = [localSheet];
    Promise.all([
        fetch(CDN.katexCss).then((r) => r.text()),
        fetch(CDN.markdownCss).then((r) => r.text())
    ]).then(([katexCssText, mdCssText]) => {
        // KaTeX CSS 內字型為相對路徑，改寫為 CDN 絕對路徑（constructable sheet 以文件 base 解析）
        const fontBase = CDN.katexCss.replace(/katex\.min\.css$/, 'fonts/');
        const absKatex = katexCssText.replace(/url\((['"]?)fonts\//g, `url($1${fontBase}`);
        // @font-face 提升至 document 層：shadow tree 內 adopted stylesheet 宣告的字型
        // 在部分瀏覽器不會觸發載入，導致數學式 fallback 到系統字體；
        // font-family 為文件全域，於 document 宣告後 shadow 內可正常引用
        const fontFaces = absKatex.match(/@font-face\s*\{[^}]*\}/g) || [];
        if (fontFaces.length) {
            const fontStyle = document.createElement('style');
            fontStyle.textContent = fontFaces.join('\n');
            document.head.appendChild(fontStyle);
        }
        const katexSheet = new CSSStyleSheet();
        katexSheet.replaceSync(absKatex.replace(/@font-face\s*\{[^}]*\}/g, ''));
        const mdSheet = new CSSStyleSheet();
        mdSheet.replaceSync(mdCssText);
        previewShadow.adoptedStyleSheets = [katexSheet, mdSheet, localSheet];
    }).catch(() => {});
}

// WHOLE_DOCUMENT: 讓 DOMPurify 一併消毒 <head>，否則文件開頭的 <style> 會被 HTML 解析器
// 放進 <head> 而遭 fragment 模式靜默丟棄（內文中段的 <style> 則不受影響）
const SANITIZE_OPTS = { USE_PROFILES: { html: true, mathMl: true, svg: true }, ADD_ATTR: ['mathvariant', 'display'], WHOLE_DOCUMENT: true };

const workerScript = `
    importScripts('${CDN.marked}',
                  '${CDN.lzString}',
                  '${CDN.katex}',
                  '${CDN.katexExt}');

    try { marked.use(self.markedKatex({ throwOnError: false })); marked.use({ gfm: true, breaks: true }); } catch(e) {}

    self.onmessage = function(e) {
        const { text } = e.data;
        try {
            const rawHtml = marked.parse(text);
            const hash = LZString.compressToEncodedURIComponent(text);
            self.postMessage({ html: rawHtml, hash, len: text.length });
        } catch (err) { console.error(err); }
    };
`;

const worker = new Worker(URL.createObjectURL(new Blob([workerScript], { type: 'text/javascript' })));
worker.onmessage = (e) => {
    const { html, hash, len } = e.data;
    preview.innerHTML = DOMPurify.sanitize(html, SANITIZE_OPTS);
    // 空內容時回到 pathname，避免 URL 留下 '#' + 空文件壓縮值（compress('') = 'Q'）
    try { history.replaceState(null, null, len ? '#' + hash : location.pathname + location.search); } catch (err) {}
    updateStats(len);
};

// Worker 容錯：CDN 載入失敗時降級為主執行緒同步渲染
function renderOnMain() {
    const text = editor.value;
    try {
        preview.innerHTML = DOMPurify.sanitize(marked.parse(text), SANITIZE_OPTS);
        const hash = LZString.compressToEncodedURIComponent(text);
        try { history.replaceState(null, null, text ? '#' + hash : location.pathname + location.search); } catch (err) {}
        updateStats(text.length);
    } catch (err) {}
}

let workerFailed = false;
worker.onerror = () => {
    if (workerFailed) return;
    workerFailed = true;
    showToast('Preview engine failed to load, switching to fallback mode');
    const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    Promise.all([load(CDN.marked), load(CDN.katex)])
        .then(() => load(CDN.katexExt))
        .then(() => {
            try { marked.use(markedKatex({ throwOnError: false })); marked.use({ gfm: true, breaks: true }); } catch (e) {}
            triggerW = debounce(renderOnMain, 150);
            renderOnMain();
        })
        .catch(() => showToast('Fallback failed to load, check your network'));
};

function updateStats(len) {
    sizeText.innerText = len + ' chars';
    sizeDot.style.backgroundColor = len <= 2000 ? 'var(--success-color)' : (len <= 8000 ? 'var(--warning-color)' : 'var(--danger-color)');
}

function toggleStats(e) { e.stopPropagation(); urlStats.classList.toggle('active'); }

// 游標的程式碼情境：'fence' = ```/~~~ 圍籬內、'raw' = <style>/<script> 未閉合、'text' = 一般 Markdown
// 行內 code 以等長空白消除，避免 `` `<script>` `` 之類教學文字誤判（圍籬計數先於消除，保護 ``` 開頭）
function codeContext(value, pos) {
    const before = value.substring(0, pos);
    let fences = 0;
    for (const m of before.matchAll(/^[ \t]*(```|~~~)/gm)) fences++;
    if (fences % 2 === 1) return 'fence';
    const cleaned = before.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    let lastOpen = -1, lastClose = -1;
    for (const m of cleaned.matchAll(/<(style|script)\b/gi)) lastOpen = m.index;
    for (const m of cleaned.matchAll(/<\/(style|script)>/gi)) lastClose = m.index;
    return lastOpen > lastClose ? 'raw' : 'text';
}

// Undo 友善的編輯：優先 execCommand（完整保留 Ctrl+Z 堆疊、原生觸發 input），
// 不支援時退回 setRangeText（手動補發 input）；空字串以 execCommand('delete') 處理
function applyEdit(text, from, to) {
    editor.focus();
    editor.setSelectionRange(from, to);
    let ok = false;
    if (text === '') {
        try { ok = document.execCommand('delete'); } catch (e) { ok = false; }
    } else {
        try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    }
    if (!ok) {
        editor.setRangeText(text, from, to, 'end');
        editor.setSelectionRange(from + text.length, from + text.length);
        editor.dispatchEvent(new Event('input'));
    }
}

// v6.14 編輯器增強：智慧清單 Enter 退回邏輯
editor.addEventListener('keydown', (e) => {
    // IME（注音/倉頡等）組字中放行，避免選字 Enter 被插入換行或清單符號
    if (e.isComposing || e.keyCode === 229) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;

    if (e.key === 'Tab') {
        e.preventDefault();
        applyEdit('    ', start, end);
    }

    if (e.key === 'Enter') {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLine = value.substring(lineStart, start);

        // 圍籬與 <style>/<script> 原始碼區塊：不自動填清單符號（如 CSS 的 * { 會被誤判），
        // 改為智慧縮排：沿用目前縮排，行尾 { 或 : 加一層，行首 } 退一層
        if (codeContext(value, start) !== 'text') {
            e.preventDefault();
            const indent = currentLine.match(/^\s*/)[0];
            const trimmed = currentLine.trim();
            let nextIndent = indent;
            if (/\{$/.test(trimmed) || /:$/.test(trimmed)) nextIndent += '    ';
            else if (/^\}/.test(trimmed)) nextIndent = indent.length > 3 ? ' '.repeat(indent.length - 4) : '';
            applyEdit('\n' + nextIndent, start, end);
            return;
        }

        const match = currentLine.match(/^(\s*)([-*+]\s+|\d+\.\s+)?/);
        
        if (match) {
            const indent = match[1];
            const marker = match[2];

            if (marker && currentLine.trim() === marker.trim()) {
                e.preventDefault();
                applyEdit(indent.length > 0 ? '- ' : '', lineStart, start);
            } 
            else if (!marker && indent.length > 0 && currentLine === indent) {
                e.preventDefault();
                applyEdit('', lineStart, start);
            }
            else {
                e.preventDefault();
                let nextMarker = marker || "";
                if (marker && /^\d+\./.test(marker.trim())) {
                    const num = parseInt(marker) + 1;
                    nextMarker = marker.replace(/^\d+/, num);
                }
                applyEdit('\n' + indent + nextMarker, start, end);
            }
            return;
        }
    }
});

// LaTeX 上色：整體 h-math，\command 另標深色
function colorMath(m) {
    return `<span class="h-math">${m.replace(/(\\[a-zA-Z]+)/g, '</span><span class="h-math-cmd">$1</span><span class="h-math">')}</span>`;
}

// CSS 迷你上色：註解、字串、選擇器、屬性、值（操作於已跳脫文字）
function colorCss(css) {
    const ph = new Map();
    let n = 0;
    const keep = (c) => { const id = `\uE100${n++}\uE101`; ph.set(id, c); return id; };
    let out = css;
    out = out.replace(/\/\*[\s\S]*?\*\//g, m => keep(`<span class="h-comment">${m}</span>`));
    out = out.replace(/"[^"\n]*"|'[^'\n]*'/g, m => keep(`<span class="h-string">${m}</span>`));
    // 屬性: 值（值不跨行、不含 {}，後接 ; } 或換行；lookahead 保留 ; 給下一條）
    out = out.replace(/(^|[{;])(\s*)(-{0,2}[a-zA-Z][a-zA-Z-]*)(\s*:\s*)([^\n{};]+?)(\s*)(?=[;}\n]|$)/gm,
        (m, pre, sp, prop, colon, val, tail) => `${pre}${sp}<span class="h-css-prop">${prop}${colon}</span><span class="h-css-val">${val}</span>${tail}`);
    // 選擇器：行首到 { 之間（含偽類、子選擇器 >）
    out = out.replace(/^([^\n{}]*?)(\s*\{)/gm, (m, sel, brace) => sel.trim() ? `<span class="h-css-sel">${sel}</span>${brace}` : m);
    return ph.size > 0 ? out.replace(new RegExp(Array.from(ph.keys()).join('|'), 'g'), id => ph.get(id)) : out;
}

function highlightContent() {
    const text = editor.value || "";
    let html = text.replace(/&/g, '\u0026amp;').replace(/</g, '\u0026lt;').replace(/>/g, '\u0026gt;');
    const placeholders = new Map();
    let counter = 0;
    const addP = (c) => { const id = `\uE000${counter++}\uE001`; placeholders.set(id, c); return id; };

    html = html.replace(/```[\s\S]*?```/g, m => addP(`<span class="h-code">${m}</span>`));
    html = html.replace(/\$\$[\s\S]*?\$\$/g, m => addP(colorMath(m)));
    html = html.replace(/`[^`\n]+`/g, m => addP(`<span class="h-code">${m}</span>`));
    html = html.replace(/\$([^\$\n]+?)\$/g, m => addP(colorMath(m)));

    // <style>/<script> 原始碼區塊：整段抽成 placeholder，內容不套 Markdown 規則
    // （避免 CSS 的 * {、#id 被 Markdown 誤判成清單/標題顏色），HTML 標籤與 CSS 內容另標色
    // 注意：此時文字已跳脫，標籤需以跳脫形式匹配
    html = html.replace(/(\u0026lt;style(?:\s[^&\n]*?)?\u0026gt;)([\s\S]*?)(\u0026lt;\/style\u0026gt;)/gi,
        (m, open, css, close) => addP(`<span class="h-html">${open}</span>${colorCss(css)}<span class="h-html">${close}</span>`));
    html = html.replace(/(\u0026lt;script(?:\s[^&\n]*?)?\u0026gt;)([\s\S]*?)(\u0026lt;\/script\u0026gt;)/gi,
        (m, open, js, close) => addP(`<span class="h-html">${open}</span><span class="h-code">${js}</span><span class="h-html">${close}</span>`));
    // 輸入中尚未閉合的區塊：比照處理到文末
    html = html.replace(/(\u0026lt;style(?:\s[^&\n]*?)?\u0026gt;)([\s\S]*)$/i,
        (m, open, css) => addP(`<span class="h-html">${open}</span>${colorCss(css)}`));
    html = html.replace(/(\u0026lt;script(?:\s[^&\n]*?)?\u0026gt;)([\s\S]*)$/i,
        (m, open, js) => addP(`<span class="h-html">${open}</span><span class="h-code">${js}</span>`));

    // 內聯 HTML 標籤另標色
    html = html.replace(/\u0026lt;\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^&\n]*?)?\/?\u0026gt;/g, m => addP(`<span class="h-html">${m}</span>`));

    const formatP = (m, cls) => addP(`<span class="${cls}">${m}</span>`);
    html = html.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-bold-italic'));
    html = html.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-bold'));
    html = html.replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-italic'));
    html = html.replace(/(~~)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-strikethrough'));
    
    html = html.replace(/^([ \t]*([-*+]|\d+\.)[ \t]+)(.*)/gm, '<span class="h-list">$1</span>$3');
    html = html.replace(/^(#+)(.*)/gm, '<span class="h-heading">$1$2</span>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<span class="h-link-text">[$1]</span>($2)');
    html = html.replace(/^([ \t]*\u0026gt;[ \t]*)(.*)/gm, '<span class="h-quote">$1$2</span>');

    if (placeholders.size > 0) {
        const re = new RegExp(Array.from(placeholders.keys()).join('|'), 'g');
        html = html.replace(re, m => placeholders.get(m));
    }
    editorHighlighting.innerHTML = html + '\n';
}

const debounce = (f, w) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), w); }; };
const triggerH = debounce(highlightContent, 40);
let triggerW = debounce(() => worker.postMessage({ text: editor.value }), 150);

editor.addEventListener('input', () => { updateStats(editor.value.length); triggerH(); triggerW(); });
editor.addEventListener('scroll', () => { editorHighlighting.scrollTop = editor.scrollTop; });

function toggleMenu(e, id) { e.stopPropagation(); const m = document.getElementById(id); const s = m.classList.contains('show'); document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show')); if (!s) m.classList.add('show'); }

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show'));
    urlStats.classList.remove('active');
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.dropdown-menu.show').forEach(d => d.classList.remove('show'));
});

function toggleMobileView() {
    document.getElementById('editorPanel').classList.toggle('active');
    document.getElementById('previewPanel').classList.toggle('active');
    document.getElementById('toggleIcon').innerText = document.getElementById('previewPanel').classList.contains('active') ? 'edit' : 'visibility';
}

function showToast(m) { const t = document.getElementById('toast'); document.getElementById('toastMsg').innerText = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function copyToClipboard(t) { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(() => showToast("Copied")).catch(() => fallbackCopy(t)); } else { fallbackCopy(t); } }
function fallbackCopy(t) { const input = document.createElement('textarea'); input.value = t; document.body.appendChild(input); input.select(); try { document.execCommand('copy'); showToast("Copied"); } catch(e) { showToast("Copy failed"); } document.body.removeChild(input); }
function copyOriginalUrl() { copyToClipboard(window.location.href); }

// 分享：優先使用 Web Share API（系統分享面板），不支援時退回複製連結
async function shareUrl() {
    if (!/^https?:$/.test(location.protocol)) { showToast('Please open via a web server (GitHub Pages)'); return; }
    if (navigator.share) {
        try {
            await navigator.share({ title: 'MarkHash', url: window.location.href });
        } catch (e) {
            if (e && e.name !== 'AbortError') copyToClipboard(window.location.href);
        }
    } else {
        copyToClipboard(window.location.href);
    }
}

function triggerUpload() { document.getElementById('fileInput').click(); }
document.getElementById('fileInput').onchange = (e) => {
    const r = new FileReader();
    if (!e.target.files[0]) return;
    r.onload = (ev) => { editor.value = ev.target.result; editor.dispatchEvent(new Event('input')); };
    r.readAsText(e.target.files[0]);
};
function downloadFile() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([editor.value], {type: 'text/markdown'})); a.download = 'markhash.md'; a.click(); }

window.onload = () => {
    const h = window.location.hash.substring(1);
    if (h) {
        // compress('') = 'Q'（合法空文件）；LZString 對無效輸入也可能回傳空字串而非 null，
        // 故以往返驗證（compress(decompress(h)) === h）區分合法連結與損毀/截斷連結
        const d = LZString.decompressFromEncodedURIComponent(h);
        if (d !== null && d !== undefined && LZString.compressToEncodedURIComponent(d) === h) {
            editor.value = d; highlightContent(); updateStats(d.length); triggerW();
        } else showToast('Link may be damaged or truncated');
    } else { highlightContent(); triggerW(); }

    // 行動版初始頁面：空白文件落在編輯頁，帶內容（分享連結）落在展示頁
    if (window.innerWidth <= 768) {
        const showPreview = editor.value.trim() !== '';
        document.getElementById('editorPanel').classList.toggle('active', !showPreview);
        document.getElementById('previewPanel').classList.toggle('active', showPreview);
        document.getElementById('toggleIcon').innerText = showPreview ? 'edit' : 'visibility';
    }
};

// PWA：註冊 Service Worker（僅在 http/https 環境，file:// 不適用）
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
