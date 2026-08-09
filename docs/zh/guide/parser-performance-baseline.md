---
description: 运行、比较并显式刷新解析器性能基线。
---

# 解析器性能基线

解析器回归门禁使用固定语料、固定 chunk 大小循环以及 1x/2x/4x 输入。版本化 JSON 会记录环境元数据、流式总耗时、重复运行中位数的 commit median/p95/max、final flush、处理 token 数、复用节点数与比例、stream parser 计数，以及 Node 支持强制 GC 时的 retained heap。

## 门禁分层

`pnpm verify:parser-release` 只运行短、确定性的门禁：语料与 chunk plan 哈希、processed-token 预算及增长率、复用节点预算、复用比例和 full-parse 次数。墙钟时间和 heap 不会让这个发布门禁失败。

运行深度 benchmark 与比较：

```bash
pnpm run benchmark:parser-perf
pnpm run check:parser-perf
```

`pnpm benchmark:real-corpus` 会先运行同一套深度解析器 benchmark，再生成原有 parser/browser real-corpus 报告。定时的 `1.0 Benchmark` workflow 也会运行深度比较，并把 JSON 上传到 `benchmark/parser-performance/`。

深度 profile 先 warmup 两次，再取七次测量的中位数。每个 runner 都会检查这些中位数的 1x/2x/4x 时间增长率。当平台、架构、CPU 型号和 Node 主版本与受版本控制的基线环境一致时，还会检查绝对毫秒预算。runner 不同时，命令会明确报告跳过绝对时间，只检查重复中位数的规模预算。这样不会把单个噪声样本或另一种硬件的绝对数值误判为回归。

CI 还会在同一个 runner 上依次构建并测量 PR base SHA 与 head；push、schedule 和手动运行则比较 `HEAD^` 与 `HEAD`。head 的每个时间重复中位数不得超过同机 base 的 1.75 倍。retained heap 使用 2 倍比例加 256 KiB 固定余量，既吸收接近零时的 GC 噪声，也能拒绝全尺度 heap 增长；比较还要求 rounds、warmups 与 chunk 配置完全一致。额外成本是 checkout、安装并构建 base，以及第二轮 42 个样本的 deep benchmark。base 不存在、构建失败、报告不合法或指标超限都会让 job 失败；两份报告都会保留在 artifact 中。

`retainedHeapBytes` 在强制 GC 后、仍保留活跃流式解析缓存时测量。deep 门禁同时检查每个 scale 的上限和 1x/2x/4x heap 增长预算；增长率使用固定 256 KiB 有效分母下限，因此测得零值也会生成有限、可复用的基线。如果没有 `global.gc`，该值为 `null`。heap 不进入单样本 deterministic 发布门禁。

本地报告默认写入 `.tmp/parser-performance/latest.json`。可以通过 `MARKSTREAM_PARSER_PERF_OUTPUT_DIR` 修改目录。

## 刷新基线

不要手工修改或悄悄放宽预算。先在同一台空闲 runner 上采集 before/after，并解释工作量或规模曲线变化为何合理。然后运行：

```bash
pnpm run benchmark:parser-perf
pnpm run update:parser-perf-baseline -- --evidence="Issue #NNN；同机 before/after 摘要与原因"
git diff -- scripts/parser-performance-baseline.json
pnpm run check:parser-perf
```

更新命令会拒绝畸形或空报告、固定 case 和 1x/2x/4x 之外的输入、归零或非有限的必需 work/timing 指标、不一致的 timing/reuse 关系、与样本中位数不符的 summary、deterministic 报告、少于三次测量的报告、带故障注入的报告以及没有 `--evidence` 的更新。processed-token 同时有冻结值 95% 的下限和上限，instrumentation 消失不会被误判为优化。候选 baseline 会先验证，再原子替换目标文件。

修改 benchmark 基础设施时运行门禁自测：

```bash
node scripts/test-parser-performance-gate.mjs
```

自测会验证干净的 deterministic、deep 和零 heap 基线路径、严格的 report/baseline/config 校验、sample-summary 一致性，以及拒绝空基线更新；然后分别构造 instrumentation 归零、quadratic processed work、同机 2 倍全尺度统一时间、同机 5 倍全尺度 heap 和强 retained-heap 增长，并要求失败。
