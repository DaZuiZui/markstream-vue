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

线上文档可能先于 beta 发布到 npm。请先检查 `next` tag，只有返回 `2.0.0-beta.1` 时才执行 beta 安装；稳定版发布后，`@2` 会选择持续维护的 2.x 版本线：

```bash
# 仅当这里输出 2.0.0-beta.1 时继续
npm view markstream-vue@next version

# 上述检查通过后验证 2.0 beta
pnpm add markstream-vue@next stream-diffs

# 2.0 stable 发布后
pnpm add markstream-vue@2 stream-diffs
```

未安装 `stream-diffs` 时，代码 fence 回退为普通 `<pre><code>`。也可以通过 `render-code-blocks-as-pre` 显式使用该路径。

### 协调发布的 beta 家族

协调 beta 中的所有框架 adapter 都适用同一套代码块迁移规则。各包独立发布，因此 `markstream-vue@next` 检查通过并不代表其他 adapter 已就绪。执行下表某一行前，请查询该行对应的包，并确认结果与表中的 beta 版本完全一致：

```bash
# 把这里的包名替换为你实际使用的那一行。
PACKAGE=markstream-react
npm view "$PACKAGE@next" version
```

请从 `next` 安装你使用的 adapter；只有应用自身直接导入 parser 或 core 时，才需要单独安装它们。

| 框架或层 | Beta 版本 | Beta 安装命令 |
| --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue@2.0.0-beta.1` | `pnpm add markstream-vue@next stream-diffs` |
| React / Next.js | `markstream-react@0.1.0-beta.1` | `pnpm add markstream-react@next stream-diffs` |
| Octane | `markstream-octane@0.1.0-beta.1` | `pnpm add markstream-octane@next octane@^0.1.21 stream-diffs` |
| Svelte 5 | `markstream-svelte@0.1.0-beta.1` | `pnpm add markstream-svelte@next svelte@^5 stream-diffs` |
| Angular | `markstream-angular@0.1.0-beta.1` | `pnpm add markstream-angular@next stream-diffs` |
| Vue 2 | `markstream-vue2@0.1.0-beta.1` | `pnpm add markstream-vue2@next stream-diffs` |
| 仅 parser | `stream-markdown-parser@1.2.5-beta.1` | `pnpm add stream-markdown-parser@next` |
| 仅流式 core | `markstream-core@1.1.0-beta.1` | `pnpm add markstream-core@next` |

请保持宿主框架 peer 兼容，不要只升级框架的一部分。React 同时要求 `react` 与 `react-dom` 18 或更高版本；所有 Angular 包必须保持在同一版本线。Vue 2.6 用户还必须安装并注册 `@vue/composition-api`，Vue 2.7 用户则不应安装该插件。

## 代码块破坏性变更

| 1.x API 或依赖 | 2.0 迁移方式 |
| --- | --- |
| `codeRenderer: 'monaco'` 或 `'shiki'` | 要保留增强代码块时改为 `codeRenderer: 'stream-diffs'`；普通回退使用 `'pre'`。 |
| `CodeBlockMonacoTheme` / `CodeBlockMonacoThemeObject` | `CodeBlockTheme` / `CodeBlockThemeObject` |
| `CodeBlockMonacoLanguage` | 删除。语言标识改为读取 code fence，并由 `resolveLanguageId` 规范化。 |
| `CodeBlockMonacoOptions` | 删除；不提供公开的编辑器选项替代项。 |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` | `getStreamDiffsRuntime` |
| `MarkdownCodeBlockNode` 与 React / Octane 导出的 `MarkdownCodeBlockNodeProps` | `CodeBlockNode` / `CodeBlockNodeProps`，或普通 `pre` 回退 |
| `ShikiCodeBlockProps` / 顶层 `langs` | 删除。需要时继续使用 `themes`；语言预加载列表不再是 renderer prop。 |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`；按下方示例更新 handler 结构。 |
| `monacoOptions` / `codeBlockMonacoOptions` | 删除；没有 adapter options 替代项。 |
| `stream-monaco` / `stream-markdown` | 删除两个依赖。 |
| `stream-diffs` | 增强代码块的可选 peer。 |

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
  code-renderer="stream-diffs"
  :is-dark="isDark"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

主题选择仍是公开 API。底层编辑器尺寸、换行、diff 算法与 adapter CSS 选项不再是 renderer props。

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

### 底层 runtime 类型重命名

以下包根导出随 runtime 一起重命名。它们描述 `stream-diffs` adapter surface，不会恢复已移除的 renderer options。

| 1.x 类型 | 2.0 类型 |
| --- | --- |
| `MonacoDiffEditorViewLike` | `StreamDiffsDiffEditorViewLike` |
| `MonacoDiffLineChangeLike` | `StreamDiffsDiffLineChangeLike` |
| `MonacoDisposableLike` | `StreamDiffsDisposableLike` |
| `MonacoEditorViewLike` | `StreamDiffsEditorViewLike` |
| `MonacoHelpers` | `StreamDiffsHelpers` |
| `MonacoModelLike` | `StreamDiffsModelLike` |
| `MonacoModule` | `StreamDiffsModule` |
| `MonacoNamespaceLike` | `StreamDiffsNamespaceLike` |
| `MonacoRuntimeOptions` | `StreamDiffsRuntimeOptions` |

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

| 发布阶段 | `latest` | `next` | 维护中的 1.x 通道 |
| --- | --- | --- | --- |
| 2.x beta 切换前 | 1.x stable | 1.x prerelease | `markstream-vue@1` 或精确版本 |
| beta 后、stable 前 | 1.x stable | 2.x beta | 稳定版使用 `markstream-vue@1`；预发布使用 `markstream-vue@legacy-next` |
| 2.x stable 切换后 | 2.x stable | 2.x prerelease | 稳定版使用 `markstream-vue@1` 或 `@legacy`；预发布使用 `@legacy-next` |

已经锁定 `^1.x` 的应用会留在 1.x。beta 切换只移动预发布通道；在 2.x stable 接管 `latest` 前，1.x stable patch 仍可继续更新 `latest`。stable 切换完成后，后续 1.x stable 发布才会进入 `legacy`。

## 验证清单

- 删除 `stream-monaco`、`stream-markdown` 与已移除的代码块 props。
- 需要增强代码块时安装 `stream-diffs`。
- 在明暗主题中验证普通与 diff fence。
- 在应用实际宽度下验证 inline 与 side-by-side diff。
- 使用 Nuxt、VitePress 或 server renderer 时运行 SSR 与打包安装检查。

仓库级发布门禁见 [2.0 路线图](/zh/guide/roadmap-2-0)。
