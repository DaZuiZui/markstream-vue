---
title: 代码块 Runtime
description: 说明 markstream-vue 的代码块 Runtime，介绍 CodeBlockNode 使用的可选 stream-diffs runtime 与普通 pre 回退机制。
keywords:
  - 代码块 Runtime
  - stream-diffs
  - runtime 预热
---

# 代码块 Runtime

本页说明 `CodeBlockNode` 使用的可选 `stream-diffs` runtime。2.0 移除了 `stream-monaco` 回退，`stream-diffs` 是唯一增强型代码块 surface；受支持的配置统一通过与 renderer 无关的 `CodeBlockOptions` API 暴露。

## 安装

```bash
pnpm add stream-diffs
```

不需要 worker plugin，也不需要额外导入包专用 CSS。

如果未安装 `stream-diffs`，loader 会保留 `<pre>` 回退，以纯文本形式渲染代码块，不启用增强 surface。

## Runtime 职责边界

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - 流式结束判断                         - code 或 diff 数据
  - 可视区域判断                         - File / FileDiff 渲染
  - 标题和工具栏                         - syntax highlighting
```

`stream-diffs` 根入口与框架无关：它不导入 Vue，也不拥有 Vue lifecycle。包内另有 `stream-diffs/vue` 这个可选便捷入口，供直接使用 Vue 的业务接入；`markstream-vue` 当前不使用该入口。

## CodeBlockNode 切换流程

`CodeBlockNode` 只有一条稳定的视觉路径：

1. code 正在流式输出时，Vue 渲染共享 `PreCodeBlock`；`renderCodeBlocksAsPre` 直接使用同一个组件和同一套视觉默认参数。
2. code 结束且进入可视区域后，组件动态加载 `stream-diffs` 根 runtime，并在既有容器中挂载一个 File 或 FileDiff surface。
3. 组件把当前 theme 应用到 surface；surface ready 后才移除临时 `<pre>`。显示前，两层已共享字体指标、padding、gutter 几何、overflow 与主题背景；流式普通代码块不得继承旧的恢复高度 floor。
4. 组件卸载时，由 Vue 适配层 dispose controller。

结束态、可见性与卸载都是 `CodeBlockNode` 的职责，并不是 `stream-diffs` 的生命周期 hook。

`CodeBlockShell` 负责标题和操作栏。创建 File surface 时会关闭内部 `data-diffs-header`，DOM 始终只有一个 header。

## 主题

`theme` 可传已注册的 string 名称或 `{ dark, light }`；`themes` 是 runtime 可用的 `[dark, light]` 名称对。`CodeBlockNode` 会把主题变化传给已挂载的 surface，不会重建 Vue 组件。

Monaco JSON theme object 不会在 2.0 中直接改名。自定义主题需先调用 `stream-diffs/pierre` 的 `registerCustomTheme`，再传入注册名称。

## Options 透传

直接使用 `CodeBlockNode`，或通过顶层 `NodeRenderer` / `MarkdownRender`，都可以传 `codeBlockOptions`。Vue 3、React、Octane、Svelte、Angular 与 Vue 2 使用同一套 `CodeBlockOptions` 约定。

受支持的 surface 包括：

- 宿主管理的排版与布局：`fontSize`、`lineHeight`、`fontFamily`、number 类型且单位为 px 的 `maxHeight`、number 类型且单位为 px 的上下对称 `padding`、`tabSize`；
- File 配置，例如 `disableLineNumbers`、`overflow`、高亮长度限制，以及虚拟化/高亮器控制；
- FileDiff 布局、indicator、未变化区域折叠与 line diff 控制；
- line/token 交互、selection callback、annotation、`onController` 与 `workerManager`。

Markstream 会把宿主管理字段同时应用到流式 `<pre>` 与最终 surface，再把其余受支持字段传给 `stream-diffs`。主题、语言/内容、流式状态、唯一 header、挂载/显示时机与释放仍由宿主管理，优先于冲突的 runtime 值。

## 可选预热

如果路由确定会出现已经完成且位于可视区域的代码块，可以在空闲时预热 module：

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

这个调用只预热可选 module；不会创建 surface、不会完成仍在流式输出的代码块，也不会绕过结束态和可见性 gate。

## Diff 交互

diff block 使用相同的适配边界。未提供对应 `codeBlockOptions` 时，增强 diff surface 使用 `stream-diffs` 默认值；可通过 `diffStyle`、`expandUnchanged`、`collapsedContextThreshold`、`hunkSeparators`、`lineDiffType` 与 `parseDiffOptions` 配置布局和折叠。
