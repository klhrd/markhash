const editor = document.getElementById('editor');
const editorHighlighting = document.getElementById('editor-highlighting');
const preview = document.getElementById('preview');
const sizeText = document.getElementById('sizeText');
const sizeDot = document.getElementById('sizeDot');
const urlStats = document.getElementById('urlStats');

// v6.13 Web Worker
const workerScript = `
    importScripts('https://cdn.jsdelivr.net/npm/marked/marked.min.js', 
                  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js',
                  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
                  'https://cdn.jsdelivr.net/npm/marked-katex-extension/lib/index.umd.js');
    
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
    preview.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true, svg: true }, ADD_ATTR: ['mathvariant', 'display'] });
    if (hash) history.replaceState(null, null, '#' + hash);
    updateStats(len);
};

function updateStats(len) {
    sizeText.innerText = len + ' chars';
    sizeDot.style.backgroundColor = len <= 2000 ? 'var(--success-color)' : (len <= 8000 ? 'var(--warning-color)' : 'var(--danger-color)');
}

function toggleStats(e) { e.stopPropagation(); urlStats.classList.toggle('active'); }

// v6.13 編輯器增強：智慧清單 Enter 退回邏輯
editor.addEventListener('keydown', (e) => {
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
        const match = currentLine.match(/^(\s*)([-*+]\s+|\d+\.\s+)?/);
        
        if (match) {
            const indent = match[1];
            const marker = match[2];

            // 1. 如果當前行只有標記（空的項目）
            if (marker && currentLine.trim() === marker.trim()) {
                e.preventDefault();
                let nextContent = "";
                
                if (indent.length > 0) {
                    // 有縮排的子項目 (如 "  4. ") -> 升級為父層項目 (如 "- ")
                    nextContent = "- ";
                } else {
                    // 無縮排項目 (如 "- ") -> 清除標記變回普通行首
                    nextContent = "";
                }
                
                editor.value = value.substring(0, lineStart) + nextContent + value.substring(start);
                editor.selectionStart = editor.selectionEnd = lineStart + nextContent.length;
                editor.dispatchEvent(new Event('input'));
            } 
            // 2. 如果當前行只有空格縮排
            else if (!marker && indent.length > 0 && currentLine === indent) {
                e.preventDefault();
                editor.value = value.substring(0, lineStart) + "" + value.substring(start);
                editor.selectionStart = editor.selectionEnd = lineStart;
                editor.dispatchEvent(new Event('input'));
            }
            // 3. 正常輸入後的 Enter（補全邏輯）
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
const triggerW = debounce(() => worker.postMessage({ text: editor.value }), 150);

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
    showToast("產出中...");
    try {
        let apiUrl = (service === 'isgd') ? `https://is.gd/create.php?format=json&url=${encodeURIComponent(window.location.href)}` : `https://tinyurl.com/api-create.php?url=${encodeURIComponent(window.location.href)}`;
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`);
        const d = await r.json();
        let shortUrl = (service === 'isgd') ? JSON.parse(d.contents).shorturl : d.contents.trim();
        if (shortUrl && shortUrl.startsWith('http')) copyToClipboard(shortUrl);
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
};
