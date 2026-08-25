#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const benchmarkPath = path.join(repoRoot, 'scripts/benchmark-parser-performance.mjs')
const checkPath = path.join(repoRoot, 'scripts/check-parser-performance.mjs')
const baselinePath = path.join(repoRoot, 'scripts/parser-performance-baseline.json')
const outputDir = path.join(repoRoot, '.tmp/parser-performance-self-test')
const outputPath = path.join(outputDir, 'latest.json')
const invalidReportPath = path.join(outputDir, 'invalid-report.json')
const invalidBaselinePath = path.join(outputDir, 'invalid-baseline.json')
const emptyReportPath = path.join(outputDir, 'empty-report.json')
const emptyBaselinePath = path.join(outputDir, 'empty-baseline.json')
const sameMethodBaselinePath = path.join(outputDir, 'same-method-baseline.json')
const deepOutputPath = path.join(outputDir, 'deep.json')
const zeroProcessedRegressionPath = path.join(outputDir, 'zero-processed-regression.json')
const sampleSummaryMismatchPath = path.join(outputDir, 'sample-summary-mismatch.json')
const jitPhaseReportPath = path.join(outputDir, 'jit-phase-report.json')
const missingHeapDiagnosticsPath = path.join(outputDir, 'missing-heap-diagnostics.json')
const forgedHeapDiagnosticsPath = path.join(outputDir, 'forged-heap-diagnostics.json')
const overCeilingHeapPath = path.join(outputDir, 'over-ceiling-heap.json')
const uniformTimeRegressionPath = path.join(outputDir, 'uniform-time-regression.json')
const uniformHeapRegressionPath = path.join(outputDir, 'uniform-heap-regression.json')
const heapGrowthRegressionPath = path.join(outputDir, 'heap-growth-regression.json')
const crossEnvironmentHeapPath = path.join(outputDir, 'cross-environment-heap.json')
const referenceConfigMismatchPath = path.join(outputDir, 'reference-config-mismatch.json')
const zeroHeapReportPath = path.join(outputDir, 'zero-heap-report.json')
const zeroHeapBaselinePath = path.join(outputDir, 'zero-heap-baseline.json')
const actualHeapBaseDir = path.join(outputDir, 'actual-heap-base')
const actualHeapRegressionDir = path.join(outputDir, 'actual-heap-regression')
const timingMetrics = ['streamTotalMs', 'commitMedianMs', 'commitP95Ms', 'commitMaxMs', 'finalFlushMs']
const countMetrics = ['processedTokenCount', 'reusedNodeCount', 'outputNodeVisits', 'finalNodeCount']
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

assert.match(packageJson.scripts['benchmark:parser-perf'], /^pnpm run build:parser && /)
assert.match(packageJson.scripts['benchmark:real-corpus'], /^pnpm run build:parser && pnpm run build:core && /)

function run(script, args, env = process.env, nodeArgs = []) {
  return spawnSync(process.execPath, [...nodeArgs, script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  })
}

function setSampleRetainedHeap(sample, retainedHeapBytes, codeSpaceDelta = 0, codeLargeObjectSpaceDelta = 0) {
  const before = {
    heapUsedBytes: 16 * 1024 * 1024,
    oldSpaceUsedBytes: 8 * 1024 * 1024,
    codeSpaceUsedBytes: 512 * 1024,
    codeLargeObjectSpaceUsedBytes: 128 * 1024,
  }
  sample.retainedHeapBytes = retainedHeapBytes
  sample.heapDiagnostics = {
    executionMode: 'jitless-child-process-v1',
    before,
    after: {
      heapUsedBytes: before.heapUsedBytes + retainedHeapBytes + codeSpaceDelta + codeLargeObjectSpaceDelta,
      oldSpaceUsedBytes: before.oldSpaceUsedBytes + retainedHeapBytes,
      codeSpaceUsedBytes: before.codeSpaceUsedBytes + codeSpaceDelta,
      codeLargeObjectSpaceUsedBytes: before.codeLargeObjectSpaceUsedBytes + codeLargeObjectSpaceDelta,
    },
  }
}

function diagnostic(result) {
  return `${result.stdout}\n${result.stderr}`
}

rmSync(outputDir, { force: true, recursive: true })
mkdirSync(outputDir, { recursive: true })

const unguardedHeapChild = run(benchmarkPath, ['--heap-child', '--profile=deep'])
assert.notEqual(unguardedHeapChild.status, 0, 'heap child unexpectedly ran without explicit jitless/GC flags')
assert.match(diagnostic(unguardedHeapChild), /heap child mode requires --jitless and --expose-gc/)

const benchmarkArgs = ['--profile=deterministic']
const checkArgs = [
  '--deterministic',
  `--input=${outputPath}`,
  `--baseline=${baselinePath}`,
]
const cleanBenchmark = run(benchmarkPath, benchmarkArgs, {
  ...process.env,
  MARKSTREAM_PARSER_PERF_OUTPUT_DIR: outputDir,
})
assert.equal(cleanBenchmark.status, 0, cleanBenchmark.stderr)

const cleanCheck = run(checkPath, checkArgs)
assert.equal(cleanCheck.status, 0, cleanCheck.stderr)
assert.match(cleanCheck.stdout, /PASS deterministic work-count baseline/)

const cleanReport = JSON.parse(readFileSync(outputPath, 'utf8'))
const invalidReport = structuredClone(cleanReport)
for (const testCase of invalidReport.cases) {
  for (const scale of testCase.scales) {
    scale.metrics = {}
    scale.samples = [{}]
  }
}
writeFileSync(invalidReportPath, JSON.stringify(invalidReport))
const invalidReportCheck = run(checkPath, [
  '--deterministic',
  `--input=${invalidReportPath}`,
  `--baseline=${baselinePath}`,
])
assert.notEqual(invalidReportCheck.status, 0, 'report with missing required metrics unexpectedly passed')
assert.match(diagnostic(invalidReportCheck), /Parser performance report invalid at .*metrics\.streamTotalMs/)

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
assert.ok(baseline.cases.every(testCase => Object.values(testCase.budgets.work).every(work => work.processedTokenCountMin > 0)))
assert.equal(baseline.environment.heapExecution?.mode, 'jitless-child-process-v1')
const invalidBaseline = structuredClone(baseline)
delete invalidBaseline.cases[0].budgets.work[1].processedTokenCountMax
writeFileSync(invalidBaselinePath, JSON.stringify(invalidBaseline))
const invalidBaselineCheck = run(checkPath, [
  '--deterministic',
  `--input=${outputPath}`,
  `--baseline=${invalidBaselinePath}`,
])
assert.notEqual(invalidBaselineCheck.status, 0, 'baseline with a missing required budget unexpectedly passed')
assert.match(diagnostic(invalidBaselineCheck), /Parser performance baseline invalid at .*processedTokenCountMax/)

const injectedBenchmark = run(benchmarkPath, benchmarkArgs, {
  ...process.env,
  MARKSTREAM_PARSER_PERF_INJECT_PROCESSED_TOKEN_REGRESSION: '1',
  MARKSTREAM_PARSER_PERF_OUTPUT_DIR: outputDir,
})
assert.equal(injectedBenchmark.status, 0, injectedBenchmark.stderr)

const injectedCheck = run(checkPath, checkArgs)
assert.notEqual(injectedCheck.status, 0, 'synthetic processed-token regression unexpectedly passed')
assert.match(diagnostic(injectedCheck), /scale=4x metric=processedTokenCount exceeded/)
assert.match(diagnostic(injectedCheck), /metric=processedTokenCountGrowth exceeded/)
assert.match(diagnostic(injectedCheck), /actualRatio=/)

const deepReport = {
  schemaVersion: baseline.schemaVersion,
  benchmarkVersion: baseline.benchmarkVersion,
  corpusVersion: baseline.corpusVersion,
  generatedAt: new Date().toISOString(),
  profile: 'deep',
  environment: {
    ...baseline.environment,
    heapExecution: {
      mode: 'jitless-child-process-v1',
      node: baseline.environment.node,
      v8: baseline.environment.v8,
      jitless: true,
      gcExposed: true,
    },
  },
  parser: baseline.parser,
  config: {
    ...baseline.config,
    injectedProcessedTokenRegression: false,
  },
  cases: baseline.cases.map(testCase => ({
    id: testCase.id,
    scales: testCase.referenceScales.map(scale => ({
      ...structuredClone(scale),
      samples: Array.from({ length: baseline.config.rounds }, () => {
        const sample = structuredClone(scale.metrics)
        setSampleRetainedHeap(sample, scale.metrics.retainedHeapBytes)
        return sample
      }),
    })),
  })),
}

const emptyReport = structuredClone(deepReport)
emptyReport.cases = []
writeFileSync(emptyReportPath, JSON.stringify(emptyReport))
const emptyUpdate = run(checkPath, [
  `--input=${emptyReportPath}`,
  `--baseline=${emptyBaselinePath}`,
  '--update-baseline',
  '--evidence=self-test empty report must be rejected',
])
assert.notEqual(emptyUpdate.status, 0, 'empty report unexpectedly created a baseline')
assert.match(diagnostic(emptyUpdate), /Parser performance report invalid at cases\[\]\.id/)
assert.equal(existsSync(emptyBaselinePath), false, 'empty baseline file was created')

writeFileSync(deepOutputPath, JSON.stringify(deepReport))
const sameMethodBaseline = structuredClone(baseline)
sameMethodBaseline.environment.heapExecution = structuredClone(deepReport.environment.heapExecution)
writeFileSync(sameMethodBaselinePath, JSON.stringify(sameMethodBaseline))
const cleanDeepCheck = run(checkPath, [`--input=${deepOutputPath}`, `--baseline=${baselinePath}`])
assert.equal(cleanDeepCheck.status, 0, cleanDeepCheck.stderr)
assert.match(cleanDeepCheck.stdout, /same-environment absolute timing budgets checked/)
assert.match(cleanDeepCheck.stdout, /same-environment frozen retained-heap budgets checked/)

const overCeilingHeap = structuredClone(deepReport)
for (const testCase of overCeilingHeap.cases) {
  const baselineCase = baseline.cases.find(item => item.id === testCase.id)
  for (const scale of testCase.scales) {
    const retainedHeapBytes = baselineCase.budgets.retainedHeapBytesMax[scale.scale] + 1
    scale.metrics.retainedHeapBytes = retainedHeapBytes
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, retainedHeapBytes)
  }
}
writeFileSync(overCeilingHeapPath, JSON.stringify(overCeilingHeap))
const overCeilingHeapCheck = run(checkPath, [`--input=${overCeilingHeapPath}`, `--baseline=${baselinePath}`])
assert.notEqual(overCeilingHeapCheck.status, 0, 'retained heap above the frozen ceiling unexpectedly passed without a same-runner reference')
assert.match(diagnostic(overCeilingHeapCheck), /metric=retainedHeapBytes exceeded max=/)

const jitPhaseReport = structuredClone(deepReport)
for (const testCase of jitPhaseReport.cases) {
  for (const scale of testCase.scales) {
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, sample.retainedHeapBytes, 4 * 1024 * 1024, 2 * 1024 * 1024)
  }
}
writeFileSync(jitPhaseReportPath, JSON.stringify(jitPhaseReport))
const jitPhaseCheck = run(checkPath, [`--input=${jitPhaseReportPath}`, `--baseline=${baselinePath}`])
assert.equal(jitPhaseCheck.status, 0, jitPhaseCheck.stderr)

const missingHeapDiagnostics = structuredClone(deepReport)
delete missingHeapDiagnostics.cases[0].scales[0].samples[0].heapDiagnostics
writeFileSync(missingHeapDiagnosticsPath, JSON.stringify(missingHeapDiagnostics))
const missingHeapDiagnosticsCheck = run(checkPath, [`--input=${missingHeapDiagnosticsPath}`, `--baseline=${baselinePath}`])
assert.notEqual(missingHeapDiagnosticsCheck.status, 0, 'missing heap diagnostics unexpectedly passed')
assert.match(diagnostic(missingHeapDiagnosticsCheck), /heapDiagnostics: expected an object/)

const forgedHeapDiagnostics = structuredClone(deepReport)
forgedHeapDiagnostics.cases[0].scales[0].samples[0].heapDiagnostics.after.heapUsedBytes++
writeFileSync(forgedHeapDiagnosticsPath, JSON.stringify(forgedHeapDiagnostics))
const forgedHeapDiagnosticsCheck = run(checkPath, [`--input=${forgedHeapDiagnosticsPath}`, `--baseline=${baselinePath}`])
assert.notEqual(forgedHeapDiagnosticsCheck.status, 0, 'forged heap diagnostics unexpectedly passed')
assert.match(diagnostic(forgedHeapDiagnosticsCheck), /retainedHeapBytes: expected .* from heap diagnostics/)

const zeroProcessedRegression = structuredClone(deepReport)
for (const testCase of zeroProcessedRegression.cases) {
  for (const scale of testCase.scales) {
    scale.metrics.processedTokenCount = 0
    for (const sample of scale.samples)
      sample.processedTokenCount = 0
  }
}
writeFileSync(zeroProcessedRegressionPath, JSON.stringify(zeroProcessedRegression))
const zeroProcessedCheck = run(checkPath, [`--input=${zeroProcessedRegressionPath}`, `--baseline=${baselinePath}`])
assert.notEqual(zeroProcessedCheck.status, 0, 'zero processed-token instrumentation unexpectedly passed')
assert.match(diagnostic(zeroProcessedCheck), /processedTokenCount: expected an integer >= 1/)

const sampleSummaryMismatch = structuredClone(deepReport)
for (const testCase of sampleSummaryMismatch.cases) {
  for (const scale of testCase.scales) {
    for (const sample of scale.samples) {
      for (const metric of timingMetrics)
        sample[metric] *= 10
      for (const metric of countMetrics)
        sample[metric] *= 10
      if (Number.isFinite(sample.retainedHeapBytes))
        setSampleRetainedHeap(sample, sample.retainedHeapBytes * 10)
    }
  }
}
writeFileSync(sampleSummaryMismatchPath, JSON.stringify(sampleSummaryMismatch))
const sampleSummaryMismatchCheck = run(checkPath, [`--input=${sampleSummaryMismatchPath}`, `--baseline=${baselinePath}`])
assert.notEqual(sampleSummaryMismatchCheck.status, 0, 'samples that disagree with their summary unexpectedly passed')
assert.match(diagnostic(sampleSummaryMismatchCheck), /metrics\.streamTotalMs: expected .* from the sample median/)

const uniformTimeRegression = structuredClone(deepReport)
for (const testCase of uniformTimeRegression.cases) {
  for (const scale of testCase.scales) {
    for (const metric of timingMetrics) {
      scale.metrics[metric] *= 2
      for (const sample of scale.samples)
        sample[metric] *= 2
    }
  }
}
writeFileSync(uniformTimeRegressionPath, JSON.stringify(uniformTimeRegression))
const uniformTimeCheck = run(checkPath, [
  `--input=${uniformTimeRegressionPath}`,
  `--baseline=${baselinePath}`,
  `--reference=${deepOutputPath}`,
])
assert.notEqual(uniformTimeCheck.status, 0, 'uniform 2x timing regression unexpectedly passed')
assert.match(diagnostic(uniformTimeCheck), /metric=streamTotalMs exceeded same-environment maxMs=/)
assert.match(diagnostic(uniformTimeCheck), /metric=streamTotalMs exceeded same-runner reference maxRatio=1\.75/)

const uniformHeapRegression = structuredClone(deepReport)
for (const testCase of uniformHeapRegression.cases) {
  for (const scale of testCase.scales) {
    scale.metrics.retainedHeapBytes *= 5
    assert.ok(scale.metrics.retainedHeapBytes < 8 * 1024 * 1024)
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, sample.retainedHeapBytes * 5)
  }
}
writeFileSync(uniformHeapRegressionPath, JSON.stringify(uniformHeapRegression))
const uniformHeapCheck = run(checkPath, [
  `--input=${uniformHeapRegressionPath}`,
  `--baseline=${baselinePath}`,
  `--reference=${deepOutputPath}`,
])
assert.notEqual(uniformHeapCheck.status, 0, 'uniform 5x same-runner retained-heap regression unexpectedly passed')
assert.match(diagnostic(uniformHeapCheck), /metric=retainedHeapBytes exceeded same-runner reference maxRatio=2 plus fixedSlackBytes=262144/)

const heapGrowthRegression = structuredClone(deepReport)
const retainedHeapBytes = [0.5, 2, 7.5].map(mebibytes => mebibytes * 1024 * 1024)
for (const testCase of heapGrowthRegression.cases) {
  for (const [index, scale] of testCase.scales.entries()) {
    scale.metrics.retainedHeapBytes = retainedHeapBytes[index]
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, retainedHeapBytes[index])
  }
}
writeFileSync(heapGrowthRegressionPath, JSON.stringify(heapGrowthRegression))
const heapGrowthCheck = run(checkPath, [`--input=${heapGrowthRegressionPath}`, `--baseline=${sameMethodBaselinePath}`])
assert.notEqual(heapGrowthCheck.status, 0, 'strong retained-heap growth unexpectedly passed')
assert.match(diagnostic(heapGrowthCheck), /metric=retainedHeapBytesGrowth exceeded/)

const crossEnvironmentHeap = structuredClone(deepReport)
crossEnvironmentHeap.environment.cpuModel = 'self-test cross-environment CPU'
const crossEnvironmentHeapBytes = [16, 40, 100].map(mebibytes => mebibytes * 1024 * 1024)
for (const testCase of crossEnvironmentHeap.cases) {
  for (const [index, scale] of testCase.scales.entries()) {
    scale.metrics.retainedHeapBytes = crossEnvironmentHeapBytes[index]
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, crossEnvironmentHeapBytes[index])
  }
}
writeFileSync(crossEnvironmentHeapPath, JSON.stringify(crossEnvironmentHeap))
const crossEnvironmentHeapCheck = run(checkPath, [`--input=${crossEnvironmentHeapPath}`, `--baseline=${baselinePath}`])
assert.equal(crossEnvironmentHeapCheck.status, 0, crossEnvironmentHeapCheck.stderr)
assert.match(crossEnvironmentHeapCheck.stdout, /frozen retained-heap ceilings\/growth skipped because baseline and report environments differ/)

const referenceConfigMismatch = structuredClone(deepReport)
referenceConfigMismatch.config.rounds++
referenceConfigMismatch.config.warmups++
referenceConfigMismatch.config.chunkPlan.sizes[0]++
for (const testCase of referenceConfigMismatch.cases) {
  for (const scale of testCase.scales)
    scale.samples.push(structuredClone(scale.samples[0]))
}
writeFileSync(referenceConfigMismatchPath, JSON.stringify(referenceConfigMismatch))
const referenceConfigCheck = run(checkPath, [
  `--input=${deepOutputPath}`,
  `--baseline=${baselinePath}`,
  `--reference=${referenceConfigMismatchPath}`,
])
assert.notEqual(referenceConfigCheck.status, 0, 'same-runner config mismatch unexpectedly passed')
assert.match(diagnostic(referenceConfigCheck), /same-runner config\.rounds mismatch/)
assert.match(diagnostic(referenceConfigCheck), /same-runner config\.warmups mismatch/)
assert.match(diagnostic(referenceConfigCheck), /same-runner chunk config mismatch/)

const zeroHeapReport = structuredClone(deepReport)
for (const testCase of zeroHeapReport.cases) {
  for (const scale of testCase.scales) {
    scale.metrics.retainedHeapBytes = 0
    for (const sample of scale.samples)
      setSampleRetainedHeap(sample, 0)
  }
}
writeFileSync(zeroHeapReportPath, JSON.stringify(zeroHeapReport))
const zeroHeapUpdate = run(checkPath, [
  `--input=${zeroHeapReportPath}`,
  `--baseline=${zeroHeapBaselinePath}`,
  '--update-baseline',
  '--evidence=self-test zero retained heap must produce a valid baseline',
])
assert.equal(zeroHeapUpdate.status, 0, zeroHeapUpdate.stderr)
const zeroHeapBaseline = JSON.parse(readFileSync(zeroHeapBaselinePath, 'utf8'))
for (const testCase of zeroHeapBaseline.cases) {
  for (const budget of testCase.budgets.retainedHeapGrowth) {
    assert.equal(Number.isFinite(budget.maxRatio), true)
    assert.equal(budget.denominatorFloorBytes, 256 * 1024)
  }
}
const zeroHeapCheck = run(checkPath, [`--input=${zeroHeapReportPath}`, `--baseline=${zeroHeapBaselinePath}`])
assert.equal(zeroHeapCheck.status, 0, zeroHeapCheck.stderr)

const actualHeapBenchmarkArgs = ['--profile=deep', '--rounds=3', '--warmups=1', '--transform']
const actualHeapBaseBenchmark = run(benchmarkPath, actualHeapBenchmarkArgs, {
  ...process.env,
  MARKSTREAM_PARSER_PERF_OUTPUT_DIR: actualHeapBaseDir,
}, ['--expose-gc'])
assert.equal(actualHeapBaseBenchmark.status, 0, actualHeapBaseBenchmark.stderr)
const actualHeapBaseReport = JSON.parse(readFileSync(path.join(actualHeapBaseDir, 'latest.json'), 'utf8'))
assert.equal(actualHeapBaseReport.config.transformMode, true)
for (const testCase of actualHeapBaseReport.cases) {
  for (const scale of testCase.scales) {
    for (const sample of scale.samples) {
      const incrementalHits = Number(sample.streamStats?.cacheHits || 0)
        + Number(sample.streamStats?.appendHits || 0)
        + Number(sample.streamStats?.tailHits || 0)
      assert.ok(incrementalHits > 0, 'stable transform hook did not preserve incremental parser hits')
    }
  }
}
const actualHeapRegressionBenchmark = run(benchmarkPath, actualHeapBenchmarkArgs, {
  ...process.env,
  MARKSTREAM_PARSER_PERF_INJECT_HEAP_RETENTION_BYTES: String(4 * 1024 * 1024),
  MARKSTREAM_PARSER_PERF_OUTPUT_DIR: actualHeapRegressionDir,
}, ['--expose-gc'])
assert.equal(actualHeapRegressionBenchmark.status, 0, actualHeapRegressionBenchmark.stderr)
const actualHeapRegressionCheck = run(checkPath, [
  `--input=${path.join(actualHeapRegressionDir, 'latest.json')}`,
  `--baseline=${baselinePath}`,
  `--reference=${path.join(actualHeapBaseDir, 'latest.json')}`,
])
assert.notEqual(actualHeapRegressionCheck.status, 0, 'strongly retained heap in the jitless child unexpectedly passed')
assert.match(diagnostic(actualHeapRegressionCheck), /metric=retainedHeapBytes exceeded same-runner reference/)

rmSync(outputDir, { force: true, recursive: true })
console.log('[parser-perf-self-test] Clean jitless, JIT-phase, zero-heap, and cross-environment paths passed; invalid diagnostics/shapes/config, zero instrumentation, summary/sample disagreement, quadratic work, frozen heap ceilings, uniform timing/heap, real heap retention, and same-environment heap-growth regressions were rejected.')
