/**
 * Single source of truth for the docs site "component gallery".
 *
 * Describes every render component under `src/components/` (42 total).
 * Consumers:
 *   1. Gallery cards that live-render `mdSnippet` through `<MarkdownRender>`.
 *   2. Generated per-component detail pages.
 *   3. Generated sidebar sections from `componentCategories`.
 *
 * Verification notes:
 *   - Every `mdSnippet` was parsed with the real `stream-markdown-parser`
 *     (`getMarkdown()`) and confirmed to produce the node type handled by
 *     the component (see the delivery report for details).
 *   - `mermaid` / `d2` / `infographic` snippets become `code_block` nodes
 *     with the matching language; `NodeRenderer` routes those languages to
 *     the diagram components (see `getNodeComponent` in NodeRenderer.vue).
 *   - EmojiNode and DefinitionListNode need consumer-registered markdown-it
 *     plugins (see their entries below).
 */

export type ComponentCategory = 'basic' | 'code' | 'math-diagram' | 'media' | 'inline' | 'infra'

export interface ComponentDocEntry {
  /** kebab-case route slug, e.g. 'code-block-node' */
  slug: string
  /** PascalCase export name, e.g. 'CodeBlockNode' */
  name: string
  category: ComponentCategory
  /** English one-liner: which markdown syntax triggers it + what it renders */
  description: string
  /** Chinese one-liner */
  descriptionZh: string
  /** Minimal markdown snippet that triggers the component (for live preview), ideally <= 8 lines */
  mdSnippet: string
  /** Peer dependencies needed for rendering, e.g. ['mermaid'], empty array when none */
  peers: string[]
  /** Whether the snippet depends on a heavy runtime (mermaid/katex/d2/antv, lazy-load in the gallery) */
  heavy: boolean
  /** Existing deep guide link (no trailing slash), e.g. '/guide/code-block-node'; omit when none */
  guide?: string
  /** Filter tags, e.g. ['gfm', 'streaming', 'inline', 'ssr-safe'] */
  tags: string[]
}

export const componentCategories: { key: ComponentCategory, en: string, zh: string }[] = [
  { key: 'basic', en: 'Basic Blocks', zh: '基础块级' },
  { key: 'code', en: 'Code', zh: '代码' },
  { key: 'math-diagram', en: 'Math & Diagrams', zh: '公式与图表' },
  { key: 'media', en: 'Media & HTML', zh: '媒体与 HTML' },
  { key: 'inline', en: 'Inline Marks', zh: '行内标记' },
  { key: 'infra', en: 'Infrastructure', zh: '基础设施（API）' },
]

export const componentsDocData: ComponentDocEntry[] = [
  {
    slug: 'admonition-node',
    name: 'AdmonitionNode',
    category: 'basic',
    description: '`::: tip`-style container blocks (`info`/`note`/`warning`/`danger`/`caution`/`error`) render as titled callout boxes with icons.',
    descriptionZh: '`::: tip` 等容器语法（info/note/warning/danger/caution/error）渲染为带图标和标题的提示框。',
    mdSnippet: `::: tip Pro tip
Streaming callouts render mid-stream.
:::`,
    peers: [],
    heavy: false,
    tags: ['extension', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'blockquote-node',
    name: 'BlockquoteNode',
    category: 'basic',
    description: '`>` blockquote lines render as a styled `<blockquote>` that hosts nested block and inline children.',
    descriptionZh: '`>` 引用行渲染为承载嵌套块/行内内容的 `<blockquote>`。',
    mdSnippet: `> Markdown keeps prose honest,
> even while it streams.`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'checkbox-node',
    name: 'CheckboxNode',
    category: 'basic',
    description: 'GFM task-list items (`- [x]` / `- [ ]`) render as SVG check/checkbox icons inside list items.',
    descriptionZh: 'GFM 任务列表 `- [x]` / `- [ ]` 渲染为列表项内的 SVG 勾选图标。',
    mdSnippet: `- [x] Parse incomplete markdown
- [ ] Render the Mermaid diagram`,
    peers: [],
    heavy: false,
    tags: ['gfm', 'inline', 'ssr-safe'],
  },
  {
    slug: 'definition-list-node',
    name: 'DefinitionListNode',
    category: 'basic',
    description: 'PHP-Extra `Term` + `: definition` lists (dl tokens from a consumer-registered deflist plugin) render as term/definition structures.',
    descriptionZh: 'PHP-Extra 风格 `术语` + `: 定义`（需消费方注册 deflist 插件）渲染为定义列表结构。',
    mdSnippet: `Markdown
: A text format that streams well.`,
    peers: [],
    heavy: false,
    tags: ['extension', 'opt-in', 'ssr-safe'],
  },
  {
    slug: 'footnote-anchor-node',
    name: 'FootnoteAnchorNode',
    category: 'basic',
    description: 'The backlink arrow inside each rendered footnote definition jumps back to its in-text `[^n]` reference.',
    descriptionZh: '脚注定义内的回链箭头，点击跳回正文对应的 `[^n]` 引用处。',
    mdSnippet: `Backlinks matter[^1].

[^1]: The anchor arrow jumps back to the reference.`,
    peers: [],
    heavy: false,
    tags: ['extension', 'ssr-safe'],
  },
  {
    slug: 'footnote-node',
    name: 'FootnoteNode',
    category: 'basic',
    description: '`[^1]: text` footnote definitions render as an anchored footnote block at the end of the document.',
    descriptionZh: '`[^1]: 说明` 脚注定义渲染为文档末尾带锚点的脚注块。',
    mdSnippet: `Backlinks matter[^1].

[^1]: The anchor arrow jumps back to the reference.`,
    peers: [],
    heavy: false,
    tags: ['extension', 'ssr-safe'],
  },
  {
    slug: 'footnote-reference-node',
    name: 'FootnoteReferenceNode',
    category: 'basic',
    description: 'Inline `[^1]` footnote markers render as clickable `<sup>` links that scroll to the footnote definition.',
    descriptionZh: '行内 `[^1]` 脚注标记渲染为可点击的 `<sup>`，跳转到脚注定义。',
    mdSnippet: `Backlinks matter[^1].

[^1]: The anchor arrow jumps back to the reference.`,
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'hard-break-node',
    name: 'HardBreakNode',
    category: 'basic',
    description: 'A trailing backslash (or two trailing spaces) at the end of a line renders a hard line break `<br>`.',
    descriptionZh: '行尾反斜杠（或两个尾随空格）渲染为硬换行 `<br>`。',
    mdSnippet: String.raw`First line\
Second line`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'ssr-safe'],
  },
  {
    slug: 'heading-node',
    name: 'HeadingNode',
    category: 'basic',
    description: '`#` to `######` ATX headings render as `<h1>`-`<h6>` elements with inline children.',
    descriptionZh: '`#` 到 `######` 的 ATX 标题渲染为 `<h1>`-`<h6>`。',
    mdSnippet: '## Streaming headings stay stable',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'list-item-node',
    name: 'ListItemNode',
    category: 'basic',
    description: 'Each list entry renders as an `<li>` whose layout stays stable while items stream in.',
    descriptionZh: '每个列表项渲染为流式追加期间布局稳定的 `<li>`。',
    mdSnippet: `- First item with **bold**
- Second item`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'list-node',
    name: 'ListNode',
    category: 'basic',
    description: '`-`/`*` bullet lists and `1.` ordered lists render as `<ul>`/`<ol>` with start-number support.',
    descriptionZh: '`-`/`*` 无序列表与 `1.` 有序列表渲染为 `<ul>`/`<ol>`（支持起始序号）。',
    mdSnippet: `- Incremental parsing
- Stable DOM reuse`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'paragraph-node',
    name: 'ParagraphNode',
    category: 'basic',
    description: 'Plain text blocks render as `<p dir="auto">` paragraphs hosting inline children.',
    descriptionZh: '文本段落渲染为承载行内子节点的 `<p dir="auto">`。',
    mdSnippet: 'A paragraph hosts **inline** nodes and `code` spans.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'reference-node',
    name: 'ReferenceNode',
    category: 'basic',
    description: 'Inline `[42]` numeric markers render as clickable reference chips that emit click events.',
    descriptionZh: '行内 `[42]` 数字标记渲染为可点击、抛出 click 事件的引用徽标。',
    mdSnippet: 'Grounded answers cite sources [42].',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'table-node',
    name: 'TableNode',
    category: 'basic',
    description: 'GFM pipe tables render as an overflow-safe `<table>` wrapper with aligned columns.',
    descriptionZh: 'GFM 管道表格渲染为带列对齐、防溢出滚动的表格容器。',
    mdSnippet: `| Feature | Status |
| --- | --- |
| Streaming | stable |
| Mermaid | lazy |`,
    peers: [],
    heavy: false,
    tags: ['gfm', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'thematic-break-node',
    name: 'ThematicBreakNode',
    category: 'basic',
    description: '`---`, `***`, or `___` on their own line render as an `<hr>` thematic break.',
    descriptionZh: '单独成行的 `---` / `***` / `___` 渲染为 `<hr>` 分隔线。',
    mdSnippet: `Intro paragraph

---

Closing paragraph`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'ssr-safe'],
  },
  {
    slug: 'code-block-node',
    name: 'CodeBlockNode',
    category: 'code',
    description: 'Fenced ```lang blocks render as stream-diffs powered code surfaces with header, copy button, and diff modes.',
    descriptionZh: '围栏 ```lang 代码块渲染为 stream-diffs 驱动的代码面板（头部、复制按钮、diff 模式）。',
    mdSnippet: `\`\`\`ts
const greeting = 'hello markstream'
\`\`\``,
    peers: ['stream-diffs'],
    heavy: false,
    guide: '/guide/code-block-node',
    tags: ['commonmark', 'streaming', 'diff', 'ssr-safe'],
  },
  {
    slug: 'inline-code-node',
    name: 'InlineCodeNode',
    category: 'code',
    description: 'Backtick `` `code` `` spans render as styled `<code>` chips.',
    descriptionZh: '反引号 `代码` 行内代码渲染为 `<code>` 样式片段。',
    mdSnippet: 'Install with `pnpm add markstream-vue`.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'ssr-safe'],
  },
  {
    slug: 'pre-code-node',
    name: 'PreCodeNode',
    category: 'code',
    description: 'Plain `<pre><code>` rendering selected by the `render-code-blocks-as-pre` renderer prop; also the fallback surface for code and diagram blocks.',
    descriptionZh: '由 render-code-blocks-as-pre 属性启用的纯 `<pre><code>` 渲染，也是代码/图块的兜底渲染面。',
    mdSnippet: `\`\`\`plain text
The same fence renders as plain <pre>
when render-code-blocks-as-pre is enabled.
\`\`\``,
    peers: [],
    heavy: false,
    tags: ['opt-in', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'd2-block-node',
    name: 'D2BlockNode',
    category: 'math-diagram',
    description: 'Fenced ```d2 blocks compile through the D2 runtime into SVG diagrams with progressive rendering.',
    descriptionZh: '```d2 代码块经 D2 运行时编译为支持渐进渲染的 SVG 图。',
    mdSnippet: `\`\`\`d2
client -> server: request
server -> client: response
\`\`\``,
    peers: ['@terrastruct/d2'],
    heavy: true,
    guide: '/guide/d2',
    tags: ['extension', 'streaming', 'ssr-fallback'],
  },
  {
    slug: 'infographic-block-node',
    name: 'InfographicBlockNode',
    category: 'math-diagram',
    description: 'Fenced ```infographic blocks render AntV Infographic charts once `setInfographicLoader` is configured.',
    descriptionZh: '```infographic 代码块在配置 setInfographicLoader 后渲染 AntV 信息图。',
    mdSnippet: `\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Step 1
      desc Start
    - label Step 2
      desc Done
\`\`\``,
    peers: ['@antv/infographic'],
    heavy: true,
    guide: '/guide/infographic',
    tags: ['extension', 'opt-in', 'streaming', 'ssr-fallback'],
  },
  {
    slug: 'math-block-node',
    name: 'MathBlockNode',
    category: 'math-diagram',
    description: '`$$...$$` (or `\\[...\\]`) display math renders as KaTeX block HTML.',
    descriptionZh: '`$$...$$`（或 `\\[...\\]`）块级公式渲染为 KaTeX HTML。',
    mdSnippet: String.raw`$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$`,
    peers: ['katex'],
    heavy: true,
    guide: '/guide/math',
    tags: ['extension', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'math-inline-node',
    name: 'MathInlineNode',
    category: 'math-diagram',
    description: 'Inline `$...$` (or `\\(...\\)`) math renders as KaTeX inline HTML.',
    descriptionZh: '行内 `$...$`（或 `\\(...\\)`）公式渲染为 KaTeX 行内 HTML。',
    mdSnippet: String.raw`Euler: $e^{i\pi} + 1 = 0$`,
    peers: ['katex'],
    heavy: true,
    guide: '/guide/math',
    tags: ['extension', 'inline', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'mermaid-block-node',
    name: 'MermaidBlockNode',
    category: 'math-diagram',
    description: 'Fenced ```mermaid blocks render as interactive SVG diagrams with streaming preview, zoom, and export.',
    descriptionZh: '```mermaid 代码块渲染为支持流式预览、缩放和导出的交互式 SVG 图。',
    mdSnippet: `\`\`\`mermaid
flowchart LR
  A --> B
\`\`\``,
    peers: ['mermaid'],
    heavy: true,
    guide: '/guide/mermaid-block-node',
    tags: ['extension', 'streaming', 'ssr-fallback'],
  },
  {
    slug: 'html-block-node',
    name: 'HtmlBlockNode',
    category: 'media',
    description: 'Block-level HTML such as `<div>` or `<details>` renders as sanitized, streaming-stable DOM.',
    descriptionZh: '块级 HTML（如 `<div>`、`<details>`）渲染为净化且流式稳定的 DOM。',
    mdSnippet: `<details>
<summary>Why streaming?</summary>
Partial input stays renderable.
</details>`,
    peers: [],
    heavy: false,
    tags: ['commonmark', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'html-inline-node',
    name: 'HtmlInlineNode',
    category: 'media',
    description: 'Inline HTML tags such as `<u>`, `<kbd>`, `<mark>` render as sanitized inline elements.',
    descriptionZh: '行内 HTML 标签（如 `<u>`、`<kbd>`、`<mark>`）渲染为净化的行内元素。',
    mdSnippet: 'Press <kbd>Ctrl</kbd> plus <kbd>K</kbd>.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'image-node',
    name: 'ImageNode',
    category: 'media',
    description: '`![alt](url)` images render as `<img>` elements with loading state and viewport-deferred fetching.',
    descriptionZh: '`![描述](url)` 图片渲染为带加载态与视口延迟请求的 `<img>`。',
    mdSnippet: '![A random demo photo](https://picsum.photos/seed/markstream/320/160)',
    peers: [],
    heavy: false,
    guide: '/guide/image-node',
    tags: ['commonmark', 'inline', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'link-node',
    name: 'LinkNode',
    category: 'media',
    description: '`[text](url)` renders as an `<a>` with underline animation and an optional hover tooltip.',
    descriptionZh: '`[文本](url)` 渲染为带下划线动画与可选悬停提示的 `<a>`。',
    mdSnippet: '[Read the docs](https://markstream.simonhe.me/frameworks/vue)',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'vmr-container-node',
    name: 'VmrContainerNode',
    category: 'media',
    description: '`:::name` custom containers (any name outside the admonition set) render as `vmr-container-{name}` wrappers for custom blocks.',
    descriptionZh: '`:::名称` 自定义容器（admonition 之外的名称）渲染为 `vmr-container-{name}` 包装块。',
    mdSnippet: '::: details\nCustom containers wrap any block.\n:::',
    peers: [],
    heavy: false,
    tags: ['extension', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'emoji-node',
    name: 'EmojiNode',
    category: 'inline',
    description: '`:tada:` shortcodes (with a consumer-registered markdown-it-emoji plugin) render as native emoji characters.',
    descriptionZh: '`:tada:` 短代码（需消费方注册 markdown-it-emoji 插件）渲染为原生 emoji 字符。',
    mdSnippet: 'Shipped! :tada:',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'opt-in', 'ssr-safe'],
  },
  {
    slug: 'emphasis-node',
    name: 'EmphasisNode',
    category: 'inline',
    description: '`*text*` or `_text_` renders as `<em>` italics.',
    descriptionZh: '`*文本*` 或 `_文本_` 渲染为 `<em>` 斜体。',
    mdSnippet: 'Streams render *emphasis* instantly.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'ssr-safe'],
  },
  {
    slug: 'highlight-node',
    name: 'HighlightNode',
    category: 'inline',
    description: '`==text==` renders as a `<mark>` highlight.',
    descriptionZh: '`==文本==` 渲染为 `<mark>` 高亮。',
    mdSnippet: 'This is ==the key phrase==.',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'insert-node',
    name: 'InsertNode',
    category: 'inline',
    description: '`++text++` renders as underlined `<ins>` insertions.',
    descriptionZh: '`++文本++` 渲染为下划线样式的 `<ins>` 插入标记。',
    mdSnippet: 'v2 adds ++insert markup++ for additions.',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'strikethrough-node',
    name: 'StrikethroughNode',
    category: 'inline',
    description: 'GFM `~~text~~` renders as `<del>` strikethrough.',
    descriptionZh: 'GFM `~~文本~~` 渲染为 `<del>` 删除线。',
    mdSnippet: '~~Streaming~~ Progressive rendering.',
    peers: [],
    heavy: false,
    tags: ['gfm', 'inline', 'ssr-safe'],
  },
  {
    slug: 'strong-node',
    name: 'StrongNode',
    category: 'inline',
    description: '`**text**` or `__text__` renders as `<strong>` bold.',
    descriptionZh: '`**文本**` 或 `__文本__` 渲染为 `<strong>` 粗体。',
    mdSnippet: '**Strong** claims need evidence.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'ssr-safe'],
  },
  {
    slug: 'subscript-node',
    name: 'SubscriptNode',
    category: 'inline',
    description: '`~text~` renders as `<sub>`, with guards that refuse accidental CJK numeric-range tildes.',
    descriptionZh: '`~文本~` 渲染为 `<sub>` 下标，并对中日韩数字范围的波浪号做防误判。',
    mdSnippet: 'Water is H~2~O.',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'superscript-node',
    name: 'SuperscriptNode',
    category: 'inline',
    description: '`^text^` renders as `<sup>` superscript.',
    descriptionZh: '`^文本^` 渲染为 `<sup>` 上标。',
    mdSnippet: 'The area grows as x^2^.',
    peers: [],
    heavy: false,
    tags: ['extension', 'inline', 'ssr-safe'],
  },
  {
    slug: 'text-node',
    name: 'TextNode',
    category: 'inline',
    description: 'Plain text runs render as `<span>` elements; the leaf of every inline tree.',
    descriptionZh: '纯文本渲染为 `<span>`，是所有行内树的叶子节点。',
    mdSnippet: 'Plain text runs are the leaves of every inline tree.',
    peers: [],
    heavy: false,
    tags: ['commonmark', 'inline', 'streaming', 'ssr-safe'],
  },
  {
    slug: 'markstream-virtual-timeline',
    name: 'MarkstreamVirtualTimeline',
    category: 'infra',
    description: 'Virtualized timeline component for long mixed chat transcripts (plain text + markdown rows) with stick-to-bottom scrolling and restore states.',
    descriptionZh: '面向长混合会话（纯文本 + Markdown 行）的虚拟化时间轴组件，支持吸底滚动与恢复状态。',
    mdSnippet: '',
    peers: [],
    heavy: false,
    tags: ['api', 'virtualization'],
  },
  {
    slug: 'node-child-renderer',
    name: 'NodeChildRenderer',
    category: 'infra',
    description: 'Internal building block that renders a single AST node through an explicit component map; powers nested and custom node rendering inside the built-in components (not exported for direct import).',
    descriptionZh: '内部基础构件：按显式组件映射渲染单个 AST 节点，供内置组件实现嵌套与自定义节点渲染（不从包入口导出，无法直接 import）。',
    mdSnippet: '',
    peers: [],
    heavy: false,
    tags: ['api'],
  },
  {
    slug: 'node-renderer',
    name: 'NodeRenderer',
    category: 'infra',
    description: 'The core renderer behind MarkdownRender: maps parsed AST nodes to components with streaming reuse, batching, and optional virtualization.',
    descriptionZh: 'MarkdownRender 背后的核心渲染器：把 AST 节点映射为组件，支持流式复用、批量调度与可选虚拟化。',
    mdSnippet: '',
    peers: [],
    heavy: false,
    tags: ['api', 'streaming', 'virtualization'],
  },
  {
    slug: 'simple-inline-renderer',
    name: 'SimpleInlineRenderer',
    category: 'infra',
    description: 'Internal fast-path renderer for arrays of simple inline nodes (text, emphasis, links, and friends) without mounting the full block renderer; used by the built-in components.',
    descriptionZh: '内部快速渲染路径：渲染简单行内节点数组（文本、强调、链接等）而无需挂载完整块渲染器，供内置组件使用。',
    mdSnippet: '',
    peers: [],
    heavy: false,
    tags: ['api', 'inline'],
  },
  {
    slug: 'tooltip',
    name: 'Tooltip',
    category: 'infra',
    description: 'Floating-UI tooltip surface shared by LinkNode and diagram nodes; also exported as an async component for custom UIs.',
    descriptionZh: 'LinkNode 与图块组件共用的浮动提示组件，也作为异步组件导出。',
    mdSnippet: '',
    peers: [],
    heavy: false,
    tags: ['api'],
  },
]
