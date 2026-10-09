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
    localSheet.replaceSync('.markdown-body{background:transparent!important;color:var(--text-primary)!important;line-height:1.8}.katex-display{background:transparent!important;color:inherit;padding:10px 0}');
    previewShadow.adoptedStyleSheets = [localSheet];
    Promise.all([
        fetch(CDN.katexCss).then((r) => r.text()),
        fetch(CDN.markdownCss).then((r) => r.text())
    ]).then(([katexCssText, mdCssText]) => {
        // KaTeX CSS 內字型為相對路徑，改寫為 CDN 絕對路徑（constructable sheet 以文件 base 解析）
        const fontBase = CDN.katexCss.replace(/katex\.min\.css$/, 'fonts/');
        const katexSheet = new CSSStyleSheet();
        katexSheet.replaceSync(katexCssText.replace(/url\((['"]?)fonts\//g, `url($1${fontBase}`));
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
    // 空內容壓縮後為空字串，仍要更新 hash，否則清空後舊內容會殘留在 URL
    try { history.replaceState(null, null, '#' + hash); } catch (err) {}
    updateStats(len);
};

// Worker 容錯：CDN 載入失敗時降級為主執行緒同步渲染
function renderOnMain() {
    const text = editor.value;
    try {
        preview.innerHTML = DOMPurify.sanitize(marked.parse(text), SANITIZE_OPTS);
        try { history.replaceState(null, null, '#' + LZString.compressToEncodedURIComponent(text)); } catch (err) {}
        updateStats(text.length);
    } catch (err) {}
}

let workerFailed = false;
worker.onerror = () => {
    if (workerFailed) return;
    workerFailed = true;
    showToast('預覽引擎初始化失敗，切換至備援模式');
    const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    Promise.all([load(CDN.marked), load(CDN.katex)])
        .then(() => load(CDN.katexExt))
        .then(() => {
            try { marked.use(markedKatex({ throwOnError: false })); marked.use({ gfm: true, breaks: true }); } catch (e) {}
            triggerW = debounce(renderOnMain, 150);
            renderOnMain();
        })
        .catch(() => showToast('備援模式載入失敗，請檢查網路連線'));
};

function updateStats(len) {
    sizeText.innerText = len + ' chars';
    sizeDot.style.backgroundColor = len <= 2000 ? 'var(--success-color)' : (len <= 8000 ? 'var(--warning-color)' : 'var(--danger-color)');
}

function toggleStats(e) { e.stopPropagation(); urlStats.classList.toggle('active'); }

// 游標是否位於 <style>/<script> 原始碼區塊內（未閉合）
function inRawBlock(value, pos) {
    const before = value.substring(0, pos);
    let lastOpen = -1, lastClose = -1;
    for (const m of before.matchAll(/<(style|script)\b/gi)) lastOpen = m.index;
    for (const m of before.matchAll(/<\/(style|script)>/gi)) lastClose = m.index;
    return lastOpen > lastClose;
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
        editor.value = value.substring(0, start) + "    " + value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        editor.dispatchEvent(new Event('input'));
    }

    if (e.key === 'Enter') {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLine = value.substring(lineStart, start);

        // <style>/<script> 區塊內：不自動填清單符號（如 CSS 的 * { 會被誤判為清單），
        // 改為智慧縮排：沿用目前縮排，行尾 { 或 : 加一層，行首 } 退一層
        if (inRawBlock(value, start)) {
            e.preventDefault();
            const indent = currentLine.match(/^\s*/)[0];
            const trimmed = currentLine.trim();
            let nextIndent = indent;
            if (/\{$/.test(trimmed) || /:$/.test(trimmed)) nextIndent += '    ';
            else if (/^\}/.test(trimmed)) nextIndent = indent.length > 3 ? ' '.repeat(indent.length - 4) : '';
            editor.value = value.substring(0, start) + '\n' + nextIndent + value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1 + nextIndent.length;
            editor.dispatchEvent(new Event('input'));
            return;
        }

        const match = currentLine.match(/^(\s*)([-*+]\s+|\d+\.\s+)?/);
        
        if (match) {
            const indent = match[1];
            const marker = match[2];

            if (marker && currentLine.trim() === marker.trim()) {
                e.preventDefault();
                let nextContent = "";
                if (indent.length > 0) {
                    nextContent = "- ";
                } else {
                    nextContent = "";
                }
                editor.value = value.substring(0, lineStart) + nextContent + value.substring(start);
                editor.selectionStart = editor.selectionEnd = lineStart + nextContent.length;
                editor.dispatchEvent(new Event('input'));
            } 
            else if (!marker && indent.length > 0 && currentLine === indent) {
                e.preventDefault();
                editor.value = value.substring(0, lineStart) + "" + value.substring(start);
                editor.selectionStart = editor.selectionEnd = lineStart;
                editor.dispatchEvent(new Event('input'));
            }
            else {
                e.preventDefault();
                let nextMarker = marker || "";
                if (marker && /^\d+\./.test(marker.trim())) {
                    const num = parseInt(marker) + 1;
                    nextMarker = marker.replace(/^\d+/, num);
                }
                const insertion = "\n" + indent + nextMarker;
                editor.value = value.substring(0, start) + insertion + value.substring(start);
                editor.selectionStart = editor.selectionEnd = start + insertion.length;
                editor.dispatchEvent(new Event('input'));
            }
            return;
        }
    }
});

function highlightContent() {
    const text = editor.value || "";
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const placeholders = new Map();
    let counter = 0;
    const addP = (c) => { const id = `\uE000${counter++}\uE001`; placeholders.set(id, c); return id; };

    html = html.replace(/```[\s\S]*?```/g, m => addP(`<span class="h-code">${m}</span>`));
    html = html.replace(/\$\$[\s\S]*?\$\$/g, m => addP(`<span class="h-math">${m}</span>`));
    html = html.replace(/`[^`\n]+`/g, m => addP(`<span class="h-code">${m}</span>`));
    html = html.replace(/\$([^\$\n]+?)\$/g, m => addP(`<span class="h-math">${m}</span>`));

    const formatP = (m, cls) => addP(`<span class="${cls}">${m}</span>`);
    html = html.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-bold-italic'));
    html = html.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-bold'));
    html = html.replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-italic'));
    html = html.replace(/(~~)(?=\S)([\s\S]*?\S)\1/g, m => formatP(m, 'h-strikethrough'));
    
    html = html.replace(/^(\s*([-*+]|\d+\.)\s+)(.*)/gm, '<span class="h-list">$1</span>$3');
    html = html.replace(/^(#+)(.*)/gm, '<span class="h-heading">$1$2</span>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<span class="h-link-text">[$1]</span>($2)');
    html = html.replace(/^(\s*>\s*)(.*)/gm, '<span class="h-quote">$1$2</span>');

    if (placeholders.size > 0) {
        const re = new RegExp(Array.from(placeholders.keys()).join('|'), 'g');
        html = html.replace(re, m => placeholders.get(m));
    }
    editorHighlighting.innerHTML = html + '\n';
}

const debounce = (f, w) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), w); }; };
let triggerW = debounce(() => worker.postMessage({ text: editor.value }), 150);

editor.addEventListener('input', () => { highlightContent(); updateStats(editor.value.length); triggerW(); });
editor.addEventListener('scroll', () => { editorHighlighting.scrollTop = editor.scrollTop; });

function toggleMenu(e, id) { e.stopPropagation(); const m = document.getElementById(id); const s = m.classList.contains('show'); document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show')); if (!s) m.classList.add('show'); }

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show'));
    urlStats.classList.remove('active');
});

function toggleMobileView() {
    document.getElementById('editorPanel').classList.toggle('active');
    document.getElementById('previewPanel').classList.toggle('active');
    document.getElementById('toggleIcon').innerText = document.getElementById('previewPanel').classList.contains('active') ? 'edit' : 'visibility';
}

function showToast(m) { const t = document.getElementById('toast'); document.getElementById('toastMsg').innerText = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function copyToClipboard(t) { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(() => showToast("已複製")).catch(() => fallbackCopy(t)); } else { fallbackCopy(t); } }
function fallbackCopy(t) { const input = document.createElement('textarea'); input.value = t; document.body.appendChild(input); input.select(); try { document.execCommand('copy'); showToast("已複製"); } catch(e) { showToast("複製失敗"); } document.body.removeChild(input); }
function copyOriginalUrl() { copyToClipboard(window.location.href); }

async function shortenUrl(service = 'isgd') {
    if (!/^https?:$/.test(location.protocol)) { showToast('此功能需透過網頁伺服器（GitHub Pages）開啟'); return; }
    showToast("產出中...");
    try {
        const shareUrl = encodeURIComponent(window.location.href);
        let shortUrl = '';
        if (service === 'isgd') {
            // is.gd 原生支援 CORS（ACAO: *），直接呼叫可避開 proxy 單點故障
            const r = await fetch(`https://is.gd/create.php?format=json&url=${shareUrl}`);
            if (!r.ok) throw new Error('isgd error');
            const d = await r.json();
            shortUrl = d.shorturl || '';
        } else {
            // tinyurl 無開放 CORS，仍需透過 proxy
            const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://tinyurl.com/api-create.php?url=' + shareUrl)}`);
            if (!r.ok) throw new Error('proxy error');
            const d = await r.json();
            shortUrl = (d.contents || '').trim();
        }
        if (shortUrl && shortUrl.startsWith('http')) copyToClipboard(shortUrl);
        else showToast('失敗：內容過長或服務異常');
    } catch (e) { showToast("失敗"); }
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
        const d = LZString.decompressFromEncodedURIComponent(h);
        if (d) { editor.value = d; highlightContent(); updateStats(d.length); triggerW(); }
    } else { highlightContent(); triggerW(); }

    if (window.innerWidth <= 768) {
        document.getElementById('editorPanel').classList.remove('active');
        document.getElementById('previewPanel').classList.add('active');
        document.getElementById('toggleIcon').innerText = 'edit';
    }
};

// PWA：註冊 Service Worker（僅在 http/https 環境，file:// 不適用）
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
