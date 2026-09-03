---
title: '组件画廊'
description: 'Markstream 全部内置节点组件的实时渲染画廊 — 基础块、代码、数学与图表、媒体、行内排版以及定制 API。可按分类过滤、按名称搜索。'
keywords:
  - markstream 组件
  - 组件画廊
  - markdown 节点组件
  - mermaid 组件
  - katex 组件
  - 流式代码块组件
---

# 组件画廊

<script setup>
import ComponentGallery from '../../.vitepress/theme/ComponentGallery.vue'
</script>

下方每张卡片都是 `markstream-vue` 的**真实渲染结果** — 你看到的就是用户得到的。按分类过滤、按名称或关键词搜索，点击卡片进入组件页面，里面有可复制的 Markdown、覆盖方法和相关组件。

<ComponentGallery />

## 如何使用一个组件

1. 在组件页面复制 Markdown 输入。
2. 用 `MarkdownRender` 渲染：

```vue
<script setup>
import { MarkdownRender } from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

3. 带 **peer** 徽标的组件需要先安装对应的可选依赖 — 见[安装与可选依赖](/zh/guide/installation)。
4. 想要不同的外观？几乎所有节点都能安全替换 — 见[覆盖内置组件](/zh/guide/component-overrides)。

::: tip 默认就是流式
这些预览在内容逐 token 流入时渲染结果完全一致。未闭合语法保持稳定而不是闪烁 — 这是 Markstream 的核心能力。
:::
