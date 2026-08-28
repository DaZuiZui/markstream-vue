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

`CssHighlightCodeBlock` 有意只作为仓库内实验代码，不作为已发布包的根导出。
请将本仓库中的原型源码复制到应用内，根据自己的 lexer/高亮器进行调整，再通过
稳定的 `code_block` 覆盖 API 注册。

适配器使用小型 lexer，而不是 MicroLighter 的模块级全局
`highlightAll()` API。每个实例都有独立的 registry 前缀，优先使用
`StaticRange`，会取消过期任务，并在卸载时移除全部 range。不支持 CSS
Custom Highlight 的浏览器和不支持的语言仍会以可读的无高亮形式显示。这是
实验性方案，不会替换默认的 `stream-diffs`。

可以运行可复现的 Chrome fixture benchmark：

```bash
pnpm benchmark:css-highlight
```

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
的当前 `main`（修复尚未随发布包发布）。
