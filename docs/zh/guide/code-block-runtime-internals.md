---
title: 代码块 Runtime 内部实现
description: 介绍 markstream-vue 代码块 Runtime 的内部实现，说明 CodeBlockNode 如何接入 stream-diffs 根 runtime 的加载与释放契约。
keywords:
  - 代码块 Runtime
  - stream-diffs
  - CodeBlockNode
---

# 代码块 Runtime 内部实现

这个保留的旧 URL 说明 markstream-vue 如何把 `CodeBlockNode` 接到与框架无关的 `stream-diffs` 根 runtime。

## 加载 contract

Markstream 使用内部缓存 loader 动态导入 `stream-diffs`，而不是 `stream-diffs/vue`。adapter 只提供 `CodeBlockNode` 所需的少量能力：创建、更新、主题、测量与释放。原始 loader/module 刻意不属于 Markstream 公开 API。

```text
CodeBlockNode                 markstream-vue runtime                stream-diffs
-------------                 ----------------------                ------------
Vue state 和 viewport     ->   cached dynamic import             ->   DOM controller
component unmount          ->   controller cleanup                ->   surface dispose
```

导入进行中会复用同一个 Promise。加载失败时，代码块停留在 `<pre>` 表示；后续代码块仍可重新尝试加载这个可选 runtime。

## Finalization contract

controller 接收普通 `HTMLElement` 与 code 或 diff 字符串。它不知道 Vue props、watcher、component instance 或 unmount hook。

下面策略由 `CodeBlockNode` 决定：

1. 流式输出期间保留 fallback。
2. 等待结束态和进入视口。
3. 使用 `stream: false` 创建一个静态 File 或 FileDiff surface。
4. 应用当前主题，在第一次 render 完成后才显示 surface。
5. Vue component 卸载或 identity 变化时释放 surface。

fallback 与 enhanced surface 遵循同一个视觉交接 contract。fallback 使用 enhanced surface 的同一组主题 palette 与代码排版指标；没有显式主题 override 时，`isDark` 选择 `vitesse-dark` 或 `vitesse-light`。增强期间两层占用同一个 grid row，`CodeBlockNode` 在同一个 Vue patch 中移除 fallback 并显示已 ready 的 surface。中间不得出现空白帧、叠加高度帧、背景变化或几何变化。

`renderCodeBlocksAsPre` 与 enhanced runtime 不可用时，都渲染 `CodeBlockNode` 在增强期间使用的同一个共享 `PreCodeBlock` 组件。默认行号、正文字体、字号、行高、四边 padding、tab size、前景色和背景色因此共用一个 contract，而不是各自维护平行 CSS。

这样高频流式更新不会进入语法高亮 surface，每个结束态代码块只有一次 controller 生命周期。

## 预热

`preloadCodeBlockRuntime()` 只用于可选 module 预热。它不会挂载代码块，也不会跳过结束态/可见性策略。

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

历史 `getUseMonaco` 只是用于预热代码块 runtime 时，公开替代项就是这个函数。确实要自行管理 controller 的高级代码应直接从 `stream-diffs` 导入 API 与类型，不要依赖 Markstream 的内部 adapter。

## 主题

主题变化会发给已挂载的 `stream-diffs` surface。主题应用限定在当前 surface，单个代码块不会通过全局 runtime mutation 修改其他代码块。

## 释放

代码块卸载或被替换时，Vue adapter 会调用 `cleanupEditor()`。controller 会释放自身 DOM surface 和 subscriptions。JavaScript module loader 会继续缓存 runtime module，供后续代码块复用。
