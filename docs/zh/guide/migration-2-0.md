---
title: 迁移到 2.0
description: 将 markstream-vue 1.x 应用升级到 2.0，用 stream-diffs 替换 Monaco 与 stream-markdown 代码块，并了解 1.x 维护通道。
keywords:
  - markstream 2.0 迁移
  - stream-diffs 迁移
  - 移除 Monaco
  - markstream legacy 发布
---

# 迁移到 2.0

`markstream-vue@2.0` 移除了之前的两套代码块 runtime，并把 `stream-diffs` 作为唯一的增强代码块表面。普通 Markdown、Mermaid、KaTeX、D2、Infographic、HTML policy、worker、CSS 与虚拟化 API 仍然可用。

## 安装

Markstream 2.0 已发布为稳定版：`markstream-vue`（`latest`）与 `markstream-vue@2` 都会选择持续维护的 2.x 版本线；1.x 线保留在 `legacy` / `legacy-next` 标签（`markstream-vue@1`）。

```bash
# 2.0 stable（latest）；stream-diffs 是增强代码块运行时
pnpm add markstream-vue stream-diffs

# 显式 2.x 版本线
pnpm add markstream-vue@2 stream-diffs

# 1.x 维护线
pnpm add markstream-vue@1
```

未安装 `stream-diffs` 时，代码 fence 回退为普通 `<pre><code>`。也可以通过 `render-code-blocks-as-pre` 显式使用该路径。

### 协调发布的 2.0 家族

所有框架 adapter 都适用同一套代码块迁移规则。各包独立发布，所以使用下表某一行前，先确认该包已位于 2.0 版本线上：

```bash
# 把这里的包名替换为你实际使用的那一行。
PACKAGE=markstream-react
npm view "$PACKAGE" version
```

请从 `latest` 安装你使用的 adapter；只有应用自身直接导入 parser 或 core 时，才需要单独安装它们。

| 框架或层 | 2.0 版本 | 安装命令 |
| --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue@2.0.0` | `pnpm add markstream-vue stream-diffs` |
| React / Next.js | `markstream-react@2.0.0` | `pnpm add markstream-react stream-diffs` |
| Octane | `markstream-octane@2.0.0` | `pnpm add markstream-octane octane@^0.1.21 stream-diffs` |
| Svelte 5 | `markstream-svelte@2.0.0` | `pnpm add markstream-svelte svelte@^5 stream-diffs` |
| Angular | `markstream-angular@2.0.0` | `pnpm add markstream-angular stream-diffs` |
| Vue 2 | `markstream-vue2@2.0.0` | `pnpm add markstream-vue2 stream-diffs` |
| 仅 parser | `stream-markdown-parser@1.2.8` | `pnpm add stream-markdown-parser` |
| 仅流式 core | `markstream-core@2.0.0` | `pnpm add markstream-core` |

请保持宿主框架 peer 兼容，不要只升级框架的一部分。React 同时要求 `react` 与 `react-dom` 18 或更高版本；所有 Angular 包必须保持在同一版本线。Vue 2.6 用户还必须安装并注册 `@vue/composition-api`，Vue 2.7 用户则不应安装该插件。

## 代码块破坏性变更

| 1.x API 或依赖 | 2.0 迁移方式 |
| --- | --- |
| `codeRenderer: 'monaco'`、`'shiki'` 或 `'pre'` | 删除。增强代码块会自动使用 `stream-diffs`；原 `'pre'` 值改用 `renderCodeBlocksAsPre`，带作用域的自定义渲染器使用 `setCustomComponents(customId, { code_block: ... })`。 |
| `markdownCodeRenderer` / `NodeRendererCodeRenderer` | 删除。Timeline 与 virtual adapter 只有在需要普通输出时才设置 `renderCodeBlocksAsPre: true`；增强路径无需 selector。 |
| string 形式的 `CodeBlockMonacoTheme` | string 形式的 `CodeBlockTheme`；明暗选择可用 `CodeBlockThemePair`（`{ dark, light }`）。 |
| Monaco JSON theme object / `CodeBlockMonacoThemeObject` | 不能直接转换。先改成 Shiki `ThemeRegistration`，再用 `stream-diffs/pierre` 的 `registerCustomTheme(name, loader)` 注册，最后传入注册名称。 |
| `CodeBlockMonacoLanguage` | 删除。语言标识改为读取 code fence，并由 `resolveLanguageId` 规范化。 |
| `CodeBlockMonacoOptions` | 对于受支持且与 renderer 无关的字段，改为 `CodeBlockOptions`。 |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| 只用于预热的 `getUseMonaco` | `preloadCodeBlockRuntime` |
| 用于直接调用 runtime 的 `getUseMonaco` | 从 `stream-diffs` 导入高级 API；Markstream 不公开原始 runtime module。 |
| `MarkdownCodeBlockNode` 与 React / Octane 导出的 `MarkdownCodeBlockNodeProps` | `CodeBlockNode` / `CodeBlockNodeProps`，或普通 `pre` 回退 |
| `ShikiCodeBlockProps` / 顶层 `langs` | 删除。需要时继续使用 `themes`；语言预加载列表不再是 renderer prop。 |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`；按下方示例更新 handler 结构。 |
| 直接 `CodeBlockNode.monacoOptions` | `CodeBlockNode.codeBlockOptions` |
| `MarkdownRender.codeBlockMonacoOptions` | 顶层 `MarkdownRender.codeBlockOptions` |
| `stream-monaco` / `stream-markdown` | 删除两个依赖。 |
| `stream-diffs` | 增强代码块的可选 peer。 |

1.x 里，直接挂载的 `CodeBlockNode` 接收 `monacoOptions`，而 `MarkdownRender` 用 `codeBlockMonacoOptions` 向下透传这些配置。2.0 的两个入口统一使用与 renderer 无关的 `codeBlockOptions`。协调发布的每个 adapter 都在直接 `CodeBlockNode` 以及顶层 `NodeRenderer` / `MarkdownRender` 上公开该字段。`codeBlockProps` 仍是另一组组件外壳配置，例如 header 与 toolbar 控制。

迁移前：

```vue
<MarkdownRender
  :content="content"
  code-renderer="monaco"
  :code-block-monaco-options="editorOptions"
/>
```

迁移后：

```vue
<MarkdownRender
  :content="content"
  :is-dark="isDark"
  :code-block-options="codeBlockOptions"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

`CodeBlockOptions` 包含由宿主协调的排版与布局字段（`fontSize`、`lineHeight`、`fontFamily`、number 类型且单位为 px 的 `maxHeight`、number 类型且单位为 px 的上下对称 `padding`、`tabSize`），以及受支持的 `stream-diffs` 配置，例如 `disableLineNumbers`、`overflow`、高亮限制、diff 布局和折叠、line/token 交互、annotation、selection callback、`onController` 与 `workerManager`。主题选择、语言与流式内容、唯一 header、挂载/显示时机和释放仍由 Markstream 管理；冲突的原始 runtime key 不能覆盖这些宿主职责。如果 1.x 使用不同的上下 padding，迁移时需选择一个统一的 px 数值；2.0 无法通过 `codeBlockOptions` 保留不对称 padding。

常见配置不是简单的字段改名：

| 1.x 配置 | 2.0 配置 |
| --- | --- |
| `MAX_HEIGHT: number` | 单位为 CSS px 的 `maxHeight: number`。string 值需要显式换算。 |
| `wordWrap: 'on'` / `'off'` | `overflow: 'wrap'` / `'scroll'`。`wordWrapColumn` 或 `bounded` 需要人工选择其中一种行为。 |
| `renderSideBySide: true` / `false` | `diffStyle: 'split'` / `'unified'` |
| `diffUnchangedRegionStyle` | `hunkSeparators` |
| `diffHideUnchangedRegions` | 增强 `stream-diffs` 路径没有单一对象可直接替换。把 `false` / `{ enabled: false }` 改成 `expandUnchanged: true`，把 `true` / `{ enabled: true }` 改成 `expandUnchanged: false`。用 `parseDiffOptions.context` 控制上下文、`collapsedContextThreshold` 控制何时折叠、`expansionLineCount` 控制每次展开行数。新旧算法并不相同，需要重新调节阈值。纯 `<pre>` 回退路径（`renderCodeBlocksAsPre` 或无 peer 回退）在 `PreCodeNode` 上仍保留 `diffHideUnchangedRegions`，行为不变。 |

主题值是名称，而不是 Monaco theme JSON。在 Vue 3、Svelte、Angular 和 Vue 2 中，`CodeBlockNode.theme` 接收固定 string 或 `{ dark, light }`；React 和 Octane 则通过 `darkTheme` / `lightTheme` 指定当前主题名称。Vue 3 中旧的 `CodeBlockNode.darkTheme` / `lightTheme` props 保留为 `theme` 的 deprecated 别名，仍然可用；顶层通过 `codeBlockDarkTheme` / `codeBlockLightTheme` 转发，未来大版本会移除。所有 adapter 的 `themes` 都是用于加载的 `[dark, light]` 名称对。注册前必须先把旧 Monaco theme 转为 Shiki theme 格式；尤其不能直接复用 Monaco `rules`，需要改成 Shiki `tokenColors` 或 `settings`：

```ts
import type { ThemeRegistration } from 'stream-diffs/pierre'
import { registerCustomTheme } from 'stream-diffs/pierre'

const themeName = 'acme-dark'
const acmeDark: ThemeRegistration = {
  name: themeName,
  type: 'dark',
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#c9d1d9',
  },
  tokenColors: [
    {
      scope: ['comment'],
      settings: { foreground: '#8b949e', fontStyle: 'italic' },
    },
  ],
}

registerCustomTheme(themeName, async () => acmeDark)
```

注册后传入 `themeName`，不要直接传旧 Monaco 对象。内置 `CodeBlockNode` 会自动启用；应用自有 renderer 时使用带作用域的 `setCustomComponents(customId, { code_block: MyCodeBlock })`。Mermaid、D2 与 Infographic fence 使用各自的专用组件 key，需要时应分别覆盖。

### Preview 事件 payload

`MarkdownCodeBlockPreviewPayload` 不只是类型改名。绑定到已移除 `MarkdownCodeBlockNode` 的 handler 以前会直接收到渲染内容：

```ts
import type { MarkdownCodeBlockPreviewPayload } from 'markstream-vue'

function handlePreview({ type, content, title }: MarkdownCodeBlockPreviewPayload) {
  openArtifact({ type, content, title })
}
```

`CodeBlockNode` 现在发出 `CodeBlockPreviewPayload`。源内容从 `node.code` 读取，并使用明确的 artifact 字段：

```ts
import type { CodeBlockPreviewPayload } from 'markstream-vue'

function handlePreview({ node, artifactType, artifactTitle, id }: CodeBlockPreviewPayload) {
  openArtifact({ id, type: artifactType, content: node.code, title: artifactTitle })
}
```

### 底层 runtime 访问

旧的根级 `Monaco*` runtime 类型与 `getUseMonaco` 不会改名为另一份公开的 `stream-diffs` API。应用只需预热 Markstream 的可选代码块 module 时使用 `preloadCodeBlockRuntime()`。确实要自行管理 runtime controller 的高级应用，应直接从 `stream-diffs` 导入函数与类型，并自行负责该 controller 的生命周期。

## Parser 类型

公开 parser 配置统一使用 `ParseOptions`。`InternalParseOptions` 已移除。结构复用与计时字段分别是 `reuseStableTopLevelNodes` 和 `parserMetrics`；cursor、fragment 与 stream-control 字段保持内部实现。

```ts
import type { ParseOptions } from 'markstream-vue'

const parseOptions: ParseOptions = {
  reuseStableTopLevelNodes: true,
}
```

## 1.x 维护与 npm 通道

`1.x` 分支继续接收关键 bug 与安全修复。同时适用于两条版本线的修复会先进入当前版本线，再 cherry-pick 到 `1.x`；只涉及已移除 1.x 代码的修复留在维护分支。本页不设定 1.x EOL 日期，后续会单独公告。

2.x stable 切换已完成：`markstream-vue` / `markstream-core` 2.x 位于 `latest`，1.x stable 保留在 `legacy`，`legacy-next` 承载 1.x 预发布。

| 发布阶段 | `latest` | `next` | 维护中的 1.x 通道 |
| --- | --- | --- | --- |
| 2.x beta 切换前 | 1.x stable | 1.x prerelease | `markstream-vue@1` 或精确版本 |
| beta 后、stable 前 | 1.x stable | 2.x beta | 稳定版使用 `markstream-vue@1`；预发布使用 `markstream-vue@legacy-next` |
| 2.x stable 切换后 | 2.x stable | 2.x prerelease | 稳定版使用 `markstream-vue@1` 或 `@legacy`；预发布使用 `@legacy-next` |

已经锁定 `^1.x` 的应用会留在 1.x。beta 切换只移动预发布通道；在 2.x stable 接管 `latest` 前，1.x stable patch 仍可继续更新 `latest`。stable 切换完成后，后续 1.x stable 发布才会进入 `legacy`。

## 验证清单

- 删除 `stream-monaco`、`stream-markdown` 与旧代码块 prop 名称。
- 把受支持的 `monacoOptions` / `codeBlockMonacoOptions` 字段改为 `codeBlockOptions`，Monaco-only 字段需逐项审查，不要直接复制。
- 需要增强代码块时安装 `stream-diffs`。
- 在明暗主题中验证普通与 diff fence。
- 在应用实际宽度下验证 inline 与 side-by-side diff。
- 使用 Nuxt、VitePress 或 server renderer 时运行 SSR 与打包安装检查。

仓库级发布门禁见 [2.0 路线图](/zh/guide/roadmap-2-0)。
