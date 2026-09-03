---
title: 按症状排查
description: 按症状卡片快速定位 markstream-vue 的样式丢失、图表不渲染、SSR 报错、peer 依赖警告与流式闪烁问题，并可一键复制 issue 诊断模板。
keywords:
  - 问题排查
  - 症状导向
  - 排障
  - 症状卡片
  - issue 诊断模板
---

<script setup>
import SymptomCards from '../../.vitepress/theme/SymptomCards.vue'
</script>

# 按症状排查

还不知道问题出在哪一层？先从下面的症状卡片入手：按你实际看到的现象——样式丢失、图表不渲染、SSR 崩掉、peer 警告——找到对应的卡片，照着“最可能原因”逐条检查。如果所有卡片都对不上，再按本页下方的子系统分层排查。

<SymptomCards />

## 已经知道是哪个子系统？直接跳转 {#先按你看到的现象分流}

| 你看到的问题 | 先看这里 | 然后看 |
| --- | --- | --- |
| 样式错乱、间距不对、Tailwind 抢样式 | [样式错乱？先做这几件事](/zh/guide/troubleshooting#css-looks-wrong-start-here) | [Tailwind 集成与样式顺序](/zh/guide/tailwind) |
| `<thinking>` 这类可信标签被当成原生 HTML | [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration) 或 [自定义标签与高级组件](/zh/guide/custom-components) | [API 参考](/zh/guide/api) |
| `window is not defined` 或浏览器专属依赖在 SSR 崩掉 | [排查问题](/zh/guide/troubleshooting) | [Nuxt SSR](/zh/nuxt-ssr) |
| Mermaid、KaTeX、`stream-diffs`、D2 没有渲染出来 | [安装](/zh/guide/installation) | [渲染器与节点组件](/zh/guide/components) |
| 聊天输出卡、频繁重解析、长内容越来越慢 | [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) | [性能](/zh/guide/performance) |
| 内置节点形态不适合业务 | [覆盖内置组件](/zh/guide/component-overrides) | [渲染器与节点组件](/zh/guide/components) |

## 1. 样式看起来不对

常见现象：

- 段落、表格、列表间距很奇怪
- 代码块、图片、引用像是没吃到样式
- Tailwind / UnoCSS 把渲染器样式盖掉了

按这个顺序检查：

1. reset 是否在 `markstream-vue/index.css` 之前导入
2. 用了 Tailwind / UnoCSS 时，是否使用 `@import '...' layer(components)`
3. 如果启用了数学公式，是否导入了 `katex/dist/katex.min.css`
4. 如果渲染器嵌在大系统里，是否用 `custom-id` 做了作用域隔离

先从 CSS 清单开始： [排查问题](/zh/guide/troubleshooting#css-looks-wrong-start-here)

## 2. 自定义标签或自定义组件没有生效

常见现象：

- `<thinking>` 被原样输出成 HTML
- 自定义 Vue 组件一直没有渲染
- 某个页面能用，换个地方就失效

按这个顺序检查：

1. 标签是否加入了 `custom-html-tags`
2. 是否用 `setCustomComponents(customId, mapping)` 注册了映射
3. 页面渲染时是否传了匹配的 `custom-id`
4. 如果你在 VitePress 里，注册逻辑是否放在 `enhanceApp`

最适合继续看的路径：

- 文档站 / 主题场景： [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration)
- 应用内自定义标签： [自定义标签与高级组件](/zh/guide/custom-components)

## 3. SSR 报错或浏览器专属依赖崩掉

常见现象：

- `window is not defined`
- Mermaid / stream-diffs 本地能跑，但 SSR 环境报错
- 服务端和客户端 hydration 对不上

按这个顺序检查：

1. 先确认出问题的 peer 是否本来就只能在浏览器里运行
2. 把这部分初始化放到 client-only 边界之后
3. 让基础 `MarkdownRender` 仍然走服务端安全路径

最适合继续看的路径：

- 通用检查项： [排查问题](/zh/guide/troubleshooting)
- Nuxt 专用规则： [Nuxt SSR](/zh/nuxt-ssr)

## 4. 重型能力没有渲染出来

常见现象：

- Mermaid fence 只显示源码
- 数学公式是空白
- `stream-diffs` 增强代码块是空的（未安装 stream-diffs 时回退为普通 `<pre>`）
- D2 退回成原始文本

这类问题多数不是 parser 出错，而是下面几类原因：

- peer 依赖没装
- 必需 CSS 没导，尤其是 KaTeX
- SSR 或 worker 边界处理不对

先从 [安装](/zh/guide/installation) 开始，再去 [渲染器与节点组件](/zh/guide/components) 对照各组件的注意事项。

## 5. 流式输出或聊天界面越来越慢

常见现象：

- 每来一个 token 页面就明显抖动
- 长聊天记录越来越重
- 每次更新都在整篇重解析 Markdown

这类问题通常不是“调个样式”能解决的，而是接法需要调整：

- 把解析移到 `MarkdownRender` 外部
- 改用 `nodes` + `final`
- 重型 peers 按需启用，不要默认全开

最适合继续看的路径： [AI 聊天与流式输出](/zh/guide/ai-chat-streaming)，再配合 [性能](/zh/guide/performance)

## 6. 还是拿不准？

如果你还无法判断是哪一层的问题：

1. 先在 playground 里用最小 Markdown 示例复现
2. 暂时去掉可选 peers，把问题缩小
3. 对照最接近的场景页：
   `文档站与 VitePress 集成`、`AI 聊天与流式输出`、`使用与流式渲染`

如果最后看起来确实像 bug，再准备这些信息：

- 最小 Markdown 示例
- 框架 / 运行时信息
- 是否用了 Tailwind、UnoCSS、SSR
- 当前安装了哪些可选 peers

页面顶部的“复制 issue 模板”按钮已经把这些占位整理好了，直接复制粘贴即可。然后再使用 [排查问题](/zh/guide/troubleshooting) 里的测试页或 issue 链接。
