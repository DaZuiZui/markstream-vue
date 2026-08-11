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

Beta 阶段从 `next` 安装；稳定版发布后，`@2` 会选择持续维护的 2.x 版本线：

```bash
# 验证 2.0 beta
pnpm add markstream-vue@next stream-diffs

# 2.0 stable 发布后
pnpm add markstream-vue@2 stream-diffs
```

未安装 `stream-diffs` 时，代码 fence 回退为普通 `<pre><code>`。也可以通过 `render-code-blocks-as-pre` 显式使用该路径。

## 代码块破坏性变更

| 1.x API 或依赖 | 2.0 迁移方式 |
| --- | --- |
| `codeRenderer: 'monaco'`、`'shiki'` 或 `'markdown'` | 要保留增强代码块时改为 `codeRenderer: 'stream-diffs'`；普通回退使用 `'pre'`。 |
| `CodeBlockMonacoTheme` / `CodeBlockMonacoThemeObject` | `CodeBlockTheme` / `CodeBlockThemeObject` |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` | `getStreamDiffsRuntime` |
| `MarkdownCodeBlockNode` | `CodeBlockNode`，或普通 `pre` 回退 |
| `monacoOptions` / `codeBlockMonacoOptions` | 删除；没有 adapter options 替代项。 |
| `stream-monaco` / `stream-markdown` | 删除两个依赖。 |
| `stream-diffs` | 增强代码块的可选 peer。 |

迁移前：

```vue
<MarkdownRender
  :content="content"
  code-renderer="monaco"
  :monaco-options="editorOptions"
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

## Parser 类型

公开 parser 配置统一使用 `ParseOptions`。`InternalParseOptions` 已移除。结构复用与计时字段分别是 `reuseStableTopLevelNodes` 和 `parserMetrics`；cursor、fragment 与 stream-control 字段保持内部实现。

```ts
import type { ParseOptions } from 'stream-markdown-parser'

const parseOptions: ParseOptions = {
  reuseStableTopLevelNodes: true,
}
```

## 1.x 维护与 npm 通道

`1.x` 分支继续接收关键 bug 与安全修复。同时适用于两条版本线的修复会先进入当前版本线，再 cherry-pick 到 `1.x`；只涉及已移除 1.x 代码的修复留在维护分支。本页不设定 1.x EOL 日期，后续会单独公告。

| 安装目标 | 命令或 dist-tag |
| --- | --- |
| 当前稳定大版本 | `pnpm add markstream-vue` 或 `@latest` |
| 当前预发布版本 | `pnpm add markstream-vue@next` |
| 最新维护中的 1.x 稳定版 | `pnpm add markstream-vue@1`；2.0 stable 切换后也可使用 `@legacy` |
| 最新维护中的 1.x 预发布版 | 首个 2.x beta 切换后使用 `pnpm add markstream-vue@legacy-next` |

已经锁定 `^1.x` 的应用会留在 1.x。发布 workflow 会把后续 1.x 版本路由到 legacy 标签，避免 `latest` 或 `next` 从 2.x 被指回 1.x。

## 验证清单

- 删除 `stream-monaco`、`stream-markdown` 与已移除的代码块 props。
- 需要增强代码块时安装 `stream-diffs`。
- 在明暗主题中验证普通与 diff fence。
- 在应用实际宽度下验证 inline 与 side-by-side diff。
- 使用 Nuxt、VitePress 或 server renderer 时运行 SSR 与打包安装检查。

仓库级发布门禁见 [2.0 路线图](/zh/guide/roadmap-2-0)。
