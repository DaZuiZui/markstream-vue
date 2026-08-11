# E2E 测试报告（中文）

> 英文版参见：`docs/e2e-testing-report.md`。

本文档汇总了仓库中新增的端到端（E2E）Markdown 解析测试，便于在未来持续扩展覆盖范围。

## 目标

提供一个精简、可复现的 E2E 测试套件，用于验证解析器和渲染器是否能正确处理常见的 Markdown 结构，并作为后续扩展的基础。

## 新增内容

- `test/fixtures/` —— 收录具有代表性的 Markdown 用例：
  - `headings.md`
  - `code-diff.md`
  - `table.md`
  - `admonition.md`
  - `math.md`
  - `footnotes.md`
  - `image-link.md`
  - `checkbox.md`
  - `mermaid.md`

- `test/e2e.markdown.test.ts` —— Vitest 测试文件，主要职责：
  - 读取每个 fixture
  - 使用 `parseMarkdownToStructure`（基于 `getMarkdown`）进行解析
  - 序列化为最小稳定结构并针对每个 fixture 生成快照
  - 含有一个针对行内数学/代码块渲染的断言

- 快照 —— 由 Vitest 生成，存放在默认快照目录。

- `.github/workflows/ci.yml` —— GitHub Actions 工作流，在 `push` 与 `pull_request` 时执行：
  - 安装依赖
  - 运行 `pnpm test`
  - 运行 `pnpm typecheck`
  - 运行 `pnpm lint`

## 本地运行方式

如需在本地运行测试（并在输出预期发生变化时更新快照）：

```bash
pnpm test -- -u
```

仅运行测试（不更新快照）：

```bash
pnpm test
```

类型检查与 ESLint：

```bash
pnpm typecheck
pnpm lint
```

## 建议 / 下一步

1. 扩展快照内容（例如加入 `children` 文本片段与节点 `meta`），提升对节点 payload 回归的捕捉能力。
2. 增加以下边界场景的 fixture 与断言：
   - 未闭合的代码围栏
   - 深度嵌套列表中混合标记
   - 转义括号等特殊场景
   - 流式代码围栏的异常输入
3. 为需要 DOM 或 Worker 的插件（Mermaid、KaTeX worker 与 `stream-diffs` 代码块 surface）补充集成测试，并考虑在 CI 中加入基于 Playwright 的浏览器流程。

如果需要，我可以：
1. 立即扩充快照的元信息。
2. 补充上述边界场景的 fixture 与测试。
3. 起草一个面向 DOM 插件的 Playwright CI 任务。

欢迎告知下一步的优先项。
