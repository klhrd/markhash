<!-- MarkHash 皜祈岫?辣嚗隞質票?脩楊頛臬?喳撽?隤?銝?hadow DOM 璅????SS ?嚗ransition/@keyframes嚗aTeX ??GFM 皜脫? -->

# MarkHash Test Document

## 1. Basic Markdown
**bold**??italic*??**bold-italic***?~strikethrough~~?inline code`
[link](https://github.com/klhrd/markhash) ??> 撘?皜祈岫嚗uote 擃漁嚗?

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

## 3. Code Fences嚗楊頛臬銝 + ?惇??Enter ?箸蝮格?嚗?
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

## 4. Math嚗aTeX \command ?行?瘛梯嚗?
Inline: $E = mc^2$ ????瘥?$\alpha + \beta$

$$\frac{a}{b} + \sqrt{x^2 + y^2} = \sum_{i=1}^{n} i$$

## 5. Table嚗FM嚗?
| Feature | Editor | Preview |
|---------|:------:|--------:|
| KaTeX math | magenta + cmd | rendered |
| CSS coloring | sel/prop/val | n/a |
| Shadow DOM | n/a | isolated |

## 6. Inline HTML嚗?蝐?teal 銝嚗?
<div class="mybox">?憛銝 document style 鋆ˇ ????閬賢???</div>

## 7. Document `<style>`嚗?閬賢??皜祈岫嚗?
<style>
.mybox {
    border: 2px dashed #3b82f6;
    border-radius: 12px;
    padding: 16px;
    margin: 16px 0;
    background: rgba(59, 130, 246, 0.08);
    font-weight: 700;
}
</style>

## 8. `<script>`嚗?閬賣?鋡急?瘥宏?扎楊頛臬隞??莎?
<script>
console.log("this never runs in preview");
</script>

## 9. Animations嚗ransition + @keyframes嚗?
<style>
.container
{
    display: flex;
    flex-direction: row;
    gap: 30px;
    align-items: center;
}
.demo-pulse {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 10px;
    background: #3b82f6;
    color: #fff;
    font-weight: 700;
    animation: demo-pulse 1.6s ease-in-out infinite;
}
@keyframes demo-pulse {
    0%, 100% { transform: scale(0.9); opacity: 0.85; }
    50% { transform: scale(1); opacity: 1; }
}
.demo-hover {
    display: inline-block;
    padding: 12px 24px;
    border: 2px solid #8b5cf6;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.35s ease;
}
.demo-hover:hover {
    background: #8b5cf6;
    color: #fff;
    transform: translateY(-3px) scale(1.05);
}
</style>

<div class="container">
    <div class="demo-pulse">@keyframes pulse ??continuous</div>
    <div class="demo-hover">Hover me ??transition</div>
</div>
