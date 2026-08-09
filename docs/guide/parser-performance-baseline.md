---
description: Run, compare, and deliberately refresh the parser performance baseline.
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

The deep profile uses seven measured runs after two warmups. Every runner checks 1x/2x/4x timing growth from those medians. Absolute millisecond budgets are also checked when platform, architecture, CPU model, and Node major version match the checked-in baseline environment. A different runner explicitly reports that absolute timing was skipped and checks the repeated-median scale budgets instead. This avoids treating one noisy sample or an absolute number from unrelated hardware as a regression.

CI additionally builds and measures the pull request base SHA and head sequentially on the same runner. Pushes, scheduled runs, and manual runs compare `HEAD^` with `HEAD`. Each head repeated timing median must stay within 1.75x of its same-runner base median. Retained heap uses a 2x ratio plus 256 KiB fixed slack, which absorbs near-zero GC noise while rejecting a uniform heap increase. The comparison also requires identical rounds, warmups, and chunk configuration. Checking out, installing, and building the base plus the second 42-sample deep run is the intentional extra cost. A missing base, build failure, malformed report, or exceeded metric fails the job; both reports remain in the uploaded artifact.

`retainedHeapBytes` is measured after forced GC while the live streaming parser cache is retained. The deep gate checks both per-scale ceilings and 1x/2x/4x heap-growth budgets. Heap-growth ratios use a fixed 256 KiB denominator floor, so a measured zero produces a finite, reusable baseline. It is `null` when `global.gc` is unavailable. Heap never enters the single-sample deterministic release gate.

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

It verifies clean deterministic, deep, and zero-heap baseline paths; strict report/baseline/config validation; sample-summary consistency; and rejection of an empty baseline update. It then requires failures for zeroed instrumentation, synthetic quadratic processed work, a 2x uniform same-runner timing regression, a 5x uniform same-runner heap regression, and strong retained-heap growth.
