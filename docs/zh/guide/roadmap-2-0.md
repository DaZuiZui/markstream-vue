---
title: 2.0 路线图
description: markstream-vue 2.0.0 路线图与任务清单。跟踪 2.0 的破坏性变更、发布验证、运行时验证与遗留清理。
keywords:
  - 2.0 路线图
  - 破坏性变更
  - 发布验证
---

# 2.0.0 路线图

`markstream-vue@2.0.0` 是一个破坏性的大版本。本页是 2.0 范围的持续更新路线图：每个目标带任务清单，已完成项标注 commit/PR，同一份清单在 GitHub 的 `2.0.0` milestone 下跟踪。

## 目标 1：移除 Monaco 与 stream-markdown，只保留 `stream-diffs` ✅

2.0 的核心破坏性变更：移除基于 Monaco 的代码块 API 与基于 Shiki 的 `stream-markdown` 渲染器。代码块只由 `stream-diffs` 渲染（未安装可选 peer 时回退为普通 `<pre>`）。

跟踪于 [issue #615](https://github.com/Simon-He95/markstream-vue/issues/615)，并已通过 [PR #619](https://github.com/Simon-He95/markstream-vue/pull/619) 合入 `2.0.0` 集成分支。

- [x] 移除 `monacoOptions` / `codeBlockMonacoOptions` 与全部 `CodeBlockMonaco*` 参数/API（无替代；diff 选项回退 stream-diffs 内置默认值）
- [x] 删除 `stream-markdown` 的 `MarkdownCodeBlockNode` 组件及其样式
- [x] `codeRenderer` 取值 `'monaco'` → `'stream-diffs'`；删除 `'shiki'` / `'markdown'` 渲染器类型
- [x] 公共标识符去 Monaco 命名（`CodeBlockTheme`、`resolveLanguageId`、`getStreamDiffsRuntime`）
- [x] vue2 / react / svelte / angular / octane 迁移到仅 stream-diffs
- [x] 更新测试与快照；全量测试通过（313 文件 / 2684 用例）
- [x] 清理 playground（依赖、vite 配置、sandbox 页面）
- [x] 更新文档（en + zh）、LLM 文档、包描述

## 目标 2：Parser 可靠性与可维护性 ✅

2.0 的中性 parser 工作与渲染器移除独立跟踪，主任务见 [issue #625](https://github.com/Simon-He95/markstream-vue/issues/625)，内部 runtime 所有权与 reset 生命周期见 [issue #633](https://github.com/Simon-He95/markstream-vue/issues/633)。

九个 parser 增量已按依赖顺序通过 PR [#635](https://github.com/Simon-He95/markstream-vue/pull/635)、[#636](https://github.com/Simon-He95/markstream-vue/pull/636)、[#637](https://github.com/Simon-He95/markstream-vue/pull/637)、[#638](https://github.com/Simon-He95/markstream-vue/pull/638)、[#639](https://github.com/Simon-He95/markstream-vue/pull/639)、[#640](https://github.com/Simon-He95/markstream-vue/pull/640)、[#641](https://github.com/Simon-He95/markstream-vue/pull/641)、[#642](https://github.com/Simon-He95/markstream-vue/pull/642) 与 [#643](https://github.com/Simon-He95/markstream-vue/pull/643) 合入 `2.0.0`。这组改动先冻结正确性、API、内存分配与性能门禁，再拆分 parser 阶段并收紧流式生命周期的所有权。

### Parser options 迁移

2.0 移除了此前从包根入口导出的 parser-only options 接口。应用代码应统一使用 `ParseOptions` 描述解析配置。原先未文档化的结构复用与计时采集字段现已正式命名为 `reuseStableTopLevelNodes` 与 `parserMetrics`；其余 cursor、fragment 与 stream-control 标志全部保持内部实现，不提供公开替代项。`ParserRuntime` 与 `ParseContext` 只是内部细节，不是 Session API。

## 目标 3：2.0.0 发布验证

在发布前跑通常规发布门禁。

- [x] 全量库构建（`pnpm build`）与 DTS 生成
- [x] `pnpm test:api:strict`（public API 快照、exports、子路径隔离）
- [x] 各框架 smoke：react / octane / vue2-cjs / minimal / pack（可选 peer）
- [x] 收敛 `check:peer-deps` 工作区根目录可选 peer
- [x] 准备协调一致的 `2.0.0-beta.1` 包版本、release notes 与 [2.0 迁移指南](/zh/guide/migration-2-0)；先发布 beta 完成验证，再将同一版本矩阵提升到稳定版

发布维护者切换步骤（需要 npm maintainer 权限）：首个 beta 前先运行 `npm dist-tag add markstream-vue@1.1.2-beta.3 legacy-next` 保留当前预发布；2.0 stable 前运行 `npm dist-tag add markstream-vue@1.0.9 legacy` 保留当前稳定版。`release:family:preflight` 会在发布任何包之前检查全部候选 dist-tag；别名缺失时会给出所需命令并失败关闭。

## 目标 4：运行时视觉验证

stream-diffs 交接已同时通过真实浏览器、单测与类型检查验证。

- [x] playground：代码块高度同步、diff 主题切换、inline/side-by-side 行为
- [x] `test:e2e:octane-playground` 在 stream-diffs 选择器下通过
- [x] svelte 在 `.is-diff .code-block-body` 上的 diff 颜色映射

## 目标 5：遗留清理（低优先）

目标 1 中刻意未纳入的小型一致性清理。

- [x] 重命名 svelte / react / vue2 包内的 Monaco 命名内部变量（例如 `resolvedMonacoOptions`）
- [x] 将手动 e2e 调试脚本更新为 stream-diffs 选择器与仓库相对路径
- [x] 移除 react / vue2 代码块主题类型中未使用的 `langs` 字段
- [x] 记录不在 2.0 范围内的既有 typecheck 问题：Vue2 包直接运行 `vue-tsc` 时会触达 `markstream-core` 的 `rootDir` 之外（TS6059），且 `HtmlPreviewFrame.vue` 使用了 `import.meta.env`

## 相关

- GitHub milestone：`2.0.0`
- 路线图 checklist：[issue #618](https://github.com/Simon-He95/markstream-vue/issues/618)
- 迁移指南：[从 1.x 迁移到 2.0](/zh/guide/migration-2-0)
- 1.0 基线：[1.0 Release Readiness](/zh/guide/release-1-0)
