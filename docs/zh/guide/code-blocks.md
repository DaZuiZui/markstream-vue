---
title: 代码块渲染
description: 介绍 markstream-vue 的代码块渲染能力，包括语言识别、语法高亮、diff 显示、复制与工具栏，以及相关配置选项。
keywords:
  - 代码块渲染
  - 语法高亮
  - diff 代码块
---

# 代码块渲染

## 概述

代码块渲染有两种策略，取决于你安装的可选依赖：

- 增强 surface（推荐用于大型或交互式代码块）：安装 `stream-diffs`，获得 File/FileDiff 渲染、语法高亮和 diff 交互。代码块结束流式输出并进入可视区域后，`CodeBlockNode` 才按需加载 core runtime。
- 回退（无额外依赖）：如果未安装 `stream-diffs`，代码块会退回为普通的 `<pre><code>` 渲染，仅保留基础样式。

## stream-diffs surface（推荐）

- 安装：

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- 职责边界：`stream-diffs` 根入口与框架无关。它的 controller 接收 `HTMLElement` 与普通的 code/diff 数据，不包含 Vue lifecycle。`stream-diffs/vue` 是独立的可选便捷入口，`markstream-vue` 当前不会使用它。
- 行为：Vue 适配层在内容仍在流式输出时保持唯一的共享 `PreCodeBlock` surface；`renderCodeBlocksAsPre` 直接使用同一个组件和同一套解析后的默认参数。代码块结束且进入可视区域后，才挂载一个 `stream-diffs` File 或 FileDiff surface 并应用语法高亮。
- 共享 pre 与 enhanced surface 使用相同的字号、行高、字体、tab size、padding、overflow、行号 gutter 和主题背景。零配置时，`isDark=true` 使用 `vitesse-dark` 背景（`#121212`），否则使用 `vitesse-light` 背景（`#ffffff`），确保首个高亮帧出现前背景已经一致。
- fallback 与 enhanced surface 都会为行号列预留最少四个字符宽度。流式内容跨过 10、100 或 1000 行边界时 gutter 不会改变；超过四位的行号仍会按需扩展。
- `CodeBlockShell` 负责标题和操作栏，内部 `data-diffs-header` 会被关闭，File surface 不会再渲染第二行标题。
- 这个集成不需要 worker plugin，也不需要额外 CSS import。运行时与预热说明见 [/zh/guide/code-block-runtime](/zh/guide/code-block-runtime)。

### 配置

可以在 `MarkdownRender` / `NodeRenderer` 顶层或直接挂载的 `CodeBlockNode` 上使用与 renderer 无关的 `codeBlockOptions`。六个框架 adapter 都导出相同的 `CodeBlockOptions` 公开类型。

```vue
<script setup lang="ts">
import type { CodeBlockOptions } from 'markstream-vue'

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  overflow: 'wrap',
  diffStyle: 'unified',
  expandUnchanged: false,
  enableLineSelection: true,
}
</script>

<template>
  <MarkdownRender
    :content="content"
    :code-block-options="codeBlockOptions"
  />
</template>
```

排版/布局字段（`fontSize`、`lineHeight`、`fontFamily`、number 类型且单位为 px 的 `maxHeight`、number 类型且单位为 px 的上下对称 `padding`、`tabSize`）由 Markstream 协调，确保流式 fallback 与最终 surface 一致。受支持的 File/FileDiff 字段包括 `disableLineNumbers`、`overflow`、高亮限制、diff 布局/折叠、交互、selection callback、annotation、`onController` 与 `workerManager`。主题、语言/内容、流式状态、header、挂载、显示和释放仍由宿主管理，并具有更高优先级。

主题使用已注册的 string 名称。直接 `CodeBlockNode.theme` 接收 string 或 `{ dark, light }`，`themes` 是要加载的 `[dark, light]` 对。旧 Monaco JSON theme object 没有直接改名：先调用 `stream-diffs/pierre` 的 `registerCustomTheme`，再传入注册名称。

完整运行时行为、diff 交互与可选预热见 [/zh/guide/code-block-runtime](/zh/guide/code-block-runtime)。

### fallback surface 主题

共享 `PreCodeBlock` fallback（流式期间显示、由 `renderCodeBlocksAsPre` 使用，且未安装增强运行时时会保留）和 enhanced surface 使用同一套宿主主题解析。默认主题对是 `vitesse-dark` / `vitesse-light`；自定义主题名称可通过 `--markstream-code-theme-bg` 与 `--markstream-code-theme-fg` 提供匹配的 fallback 颜色。其余 shell token（`--code-border`、`--code-header-bg`、`--code-action-fg`、`--code-line-number` 等）继续控制共享 chrome。

### 语言图标懒加载

为了减小主包体积，低频语言图标已拆分到异步 chunk：

- 常见语言（JS/TS/HTML/CSS/JSON/Python 等）图标仍在主包内。
- 低频语言图标按需加载，异步 chunk 返回后会自动刷新图标显示。
- 如果你希望避免首次命中时的回退图标，可在应用空闲阶段预热一次：

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

## 回退

若未安装 `stream-diffs`，代码块 loader 返回 `null`，渲染器回退为简单的 `pre`/`code` 表现。回退层仍然显示行号并遵循 `--code-*` 主题 token。

## 参考链接

- Worker / SSR 指南：[/zh/nuxt-ssr](/zh/nuxt-ssr)
- 安装说明：[/zh/guide/installation](/zh/guide/installation)

快速试一下：

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :code-block-options="{ overflow: 'wrap', disableLineNumbers: true }"
  />
</template>
```
