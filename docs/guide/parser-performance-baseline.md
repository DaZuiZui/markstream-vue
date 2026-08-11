---
title: Parser Performance Baseline
description: Run, compare, and deliberately refresh the parser performance baseline, including the versioned JSON report and the fixed-corpus regression gate.
keywords:
  - parser performance baseline
  - parser regression gate
  - streaming parser benchmark
---

# Parser Performance Baseline

The parser regression gate uses a fixed corpus, a fixed chunk-size cycle, and 1x/2x/4x inputs. Its versioned JSON report records environment metadata, stream total, repeated-median commit median/p95/max, final flush, processed token count, reused node count and ratio, stream parser counters, and retained heap when Node exposes forced GC.

## Gates

`pnpm verify:parser-release` runs the short deterministic gate. It checks corpus and chunk-plan hashes, processed-token budgets and growth, reused-node budgets, reuse ratio, and full-parse count. Wall-clock and heap measurements cannot fail this release gate.

Run the deep benchmark and comparison with:

```bash
pnpm run benchmark:parser-perf
pnpm run check:parser-perf
```

`pnpm benchmark:real-corpus` runs the same deep parser benchmark before the existing parser/browser real-corpus report. The scheduled `1.0 Benchmark` workflow also runs the deep comparison and uploads its JSON under `benchmark/parser-performance/`.

The deep profile uses seven measured runs after two warmups. Every runner checks 1x/2x/4x timing growth from those medians. Absolute millisecond budgets and the checked-in per-scale heap ceilings and heap-growth curves are only checked when platform, architecture, CPU model, and Node major version match the checked-in baseline environment. A different runner explicitly reports that those frozen machine-specific budgets were skipped and checks repeated-median timing scale plus deterministic work budgets instead. This avoids treating timing or forced-GC heap behavior from unrelated hardware as a regression.

CI additionally builds and measures the pull request base SHA and head sequentially on the same runner. Pushes, scheduled runs, and manual runs compare `HEAD^` with `HEAD`. Each head repeated timing median must stay within 1.75x of its same-runner base median. Retained heap uses a 2x ratio plus 256 KiB fixed slack, which absorbs near-zero GC noise while rejecting a uniform heap increase. This same-runner heap comparison remains active when the CI machine differs from the checked-in baseline machine. The comparison also requires identical rounds, warmups, chunk configuration, and environment metadata. Checking out, installing, and building the base plus the second 42-sample deep run is the intentional extra cost. A missing base, build failure, malformed report, or exceeded metric fails the job; both reports remain in the uploaded artifact.

Normal-JIT samples continue to provide all timing, work, reuse, and scale measurements. Deep reports collect `retainedHeapBytes` separately in a fresh `--jitless --expose-gc` child process running the same current collector and parser dist, recorded as execution mode `jitless-child-process-v1`. No temporary report is used between the parent and child. Every heap sample records before/after `heapUsed`, old-space, code-space, and code-large-object-space bytes. Retained application heap is the after-GC heap delta with positive code/code-large phase growth removed; the checker binds that value to the diagnostics and rejects missing or inconsistent records.

Frozen per-scale heap ceilings and 1x/2x/4x growth budgets are only comparable when both the runner environment and recorded heap execution mode match. A baseline without mode provenance is explicitly treated as legacy in-process JIT data, so it is not applied to a new jitless-child report; absolute timing remains independently comparable. This keeps the checked-in baseline and thresholds unchanged without mixing measurement methods. CI relies on the same-runner base/head heap comparison until a reviewed baseline is captured with the new mode. Heap-growth ratios retain their fixed 256 KiB denominator floor, and heap never enters the single-sample deterministic release gate.

The default local report is `.tmp/parser-performance/latest.json`. Set `MARKSTREAM_PARSER_PERF_OUTPUT_DIR` to retain it elsewhere.

## Refreshing the baseline

Do not hand-edit or silently relax a budget. First capture before/after reports on the same otherwise-idle runner and explain why a changed work count or scale curve is expected. Then run:

```bash
pnpm run benchmark:parser-perf
pnpm run update:parser-perf-baseline -- --evidence="Issue #NNN; same-run before/after summary and reason"
git diff -- scripts/parser-performance-baseline.json
pnpm run check:parser-perf
```

The update command rejects malformed or empty reports, anything other than the fixed cases and 1x/2x/4x scales, zero or non-finite required work/timing metrics, inconsistent timing/reuse relationships, summaries that do not match their recorded sample medians, deterministic reports, reports with fewer than three measured rounds, injected regressions, and updates without `--evidence`. Processed-token budgets include both a 95% lower bound and an upper bound, so missing instrumentation cannot look like an improvement. The generated candidate is validated before an atomic replacement. The checker applies the same strict shape validation to a frozen baseline before using it.

Run the gate self-test when changing the harness:

```bash
node scripts/test-parser-performance-gate.mjs
```

It verifies clean deterministic, deep jitless-child, code-space phase, zero-heap, and cross-environment paths; strict diagnostics/report/baseline/config validation; sample-summary consistency; and rejection of an empty baseline update. It proves code-space phase changes and cross-environment frozen heap budgets do not cause failures, while requiring failures for missing/forged heap diagnostics, a real strongly retained heap allocation, zeroed instrumentation, synthetic quadratic processed work, uniform timing/heap regressions, and same-environment retained-heap growth.
