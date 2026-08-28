---
title: CSS Custom Highlight 代码块 PoC
description: 使用 CSS Custom Highlight range 的实验性、按作用域注册的代码块渲染器与性能验证说明。
keywords:
  - CSS Custom Highlight
  - 代码块性能
  - stream-diffs benchmark
---

<!-- Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements. See the NOTICE file distributed with this work for additional information regarding copyright ownership. The ASF licenses this file to you under the Apache License, Version 2.0. -->

# CSS Custom Highlight 代码块 PoC

Issue #726 增加了可选的 `CssHighlightCodeBlock` 原型。代码块流式输出时
始终保留普通 `<pre><code>`，只有节点 settled 后才应用带命名空间的 CSS
Custom Highlight range。

```ts
import { setCustomComponents } from 'markstream-vue'
import MyCssHighlightCodeBlock from './MyCssHighlightCodeBlock.vue'

setCustomComponents('css-highlight-benchmark', {
  code_block: MyCssHighlightCodeBlock,
})
```

`CssHighlightCodeBlock` 作为实验性 lazy component 从根入口导出。请通过稳定的
`code_block` override API 注册；它仍然是 opt-in，不会替换默认 renderer。

适配器使用小型 lexer，而不是 MicroLighter 的模块级全局
`highlightAll()` API。每个实例都有独立的 registry 前缀，优先使用
`StaticRange`，会取消过期任务，并在卸载时移除全部 range。不支持 CSS
Custom Highlight 的浏览器和不支持的语言仍会以可读的无高亮形式显示。这是
实验性方案，不会替换默认的 `stream-diffs`。

可以运行可复现的 Chrome fixture benchmark：

```bash
pnpm benchmark:css-highlight
```

流式行为请复用真实浏览器 split harness：

```bash
MARKSTREAM_STREAMING_SPLIT_RENDERERS=markstream-local,markstream-css-highlight-local,markstream-css-highlight-worker \
  pnpm benchmark:streaming-split
```

该 artifact 会拆分记录每次 chunk commit 的 avg/p95/max、主线程 busy ratio、
long task、帧耗时、mutation 以及 settled 交接过程。CSS Highlight 行还会记录
tokenize、`StaticRange` 构建、registry 更新、首次 enhanced 和 dispose 耗时。
`loading` 阶段必须保持 tokenizer 与 registry 更新次数为 0。worker tokenizer 行
会在纯可传输 tokenizer 和 worker 生命周期实现前明确记录为 unavailable，不能用
主线程结果代替。

脚本默认覆盖 1/12/24 个代码块以及 100/1,000/10,000 行，记录 plain
`<pre>`、本地适配器和锁定版本的 MicroLighter 2.1.0。为控制运行成本，仓库中
提交的 artifact 使用 100 和 1,000 行子集；设置
`MARKSTREAM_CSS_HIGHLIGHT_LINES=100,1000,10000` 可采集完整矩阵。同时会尝试
stream-diffs 主线程 surface；如果浏览器 import-map 依赖未提供，会明确记录
`unavailable` 原因。worker-pool 行会明确记录为 `not-run`，因为它需要
stream-diffs playground 的 worker manager。

## 决策记录

当前证据支持将其保留为文档化的自定义组件用法。一次合成 Chrome 测试表明，
DOM 变浅并不意味着一定更快：在 1,000 行 fixture 中，tokenizer 与 range
创建占据了主要成本。原始探索数据位于
`test/benchmark/css-highlight-results.json`。正式决策仍需按 Issue #726 的
真实浏览器矩阵执行，并分别测试 MicroLighter 2.1.0 发布包与 PR #18 合并后
的当前 `main`（修复尚未随发布包发布）。静态 fixture 不能代表 streaming 结论，
正式选型前应先运行 split harness。
