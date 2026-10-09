<!-- MarkHash 測試文件：整份貼進編輯器即可驗證語法上色、Shadow DOM 樣式隔離、KaTeX 與 GFM 渲染 -->

# MarkHash Test Document

## 1. Basic Markdown
**bold**、*italic*、***bold-italic***、~~strikethrough~~、`inline code`
[link](https://github.com/klhrd/markhash) 與 > 引言測試（quote 高亮）

> Blockquote line 1
> Blockquote line 2

## 2. Lists
- item 1
- item 2
  - nested A
  - nested B
1. first
2. second
3. third

- [ ] task unchecked
- [x] task done

## 3. Code Fences（編輯器上色 + 圍籬內 Enter 智慧縮排）
```css
.hero {
    color: #3b82f6;
    background: rgba(0, 0, 0, 0.05);
    font-family: "Roboto Mono", monospace; /* CSS comment */
}
.hero:hover { border: 1px solid #999; }
```

```js
function greet(name) {
    return `Hello, ${name}!`; // JS comment
}
```

## 4. Math（LaTeX \command 另標深色）
Inline: $E = mc^2$、希臘字母 $\alpha + \beta$

$$\frac{a}{b} + \sqrt{x^2 + y^2} = \sum_{i=1}^{n} i$$

## 5. Table（GFM）
| Feature | Editor | Preview |
|---------|:------:|--------:|
| KaTeX math | magenta + cmd | rendered |
| CSS coloring | sel/prop/val | n/a |
| Shadow DOM | n/a | isolated |

## 6. Inline HTML（標籤 teal 上色）
<div class="mybox">這個方塊由下方 document style 裝飾 — 僅預覽區生效</div>

## 7. Document `<style>`（預覽區隔離測試）
<style>
.mybox {
    border: 2px solid #3b82f6;
    border-radius: 12px;
    padding: 16px;
    margin: 16px 0;
    background: rgba(59, 130, 246, 0.08);
    font-weight: 700;
}
</style>

## 8. `<script>`（預覽會被消毒移除、編輯器仍上色）
<script>
console.log("this never runs in preview");
</script>
