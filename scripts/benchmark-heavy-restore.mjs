#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourceRoot = process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT
  ? path.resolve(process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT)
  : repoRoot
const fixtureRoot = path.join(repoRoot, 'test/benchmark/heavy-restore')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_HEAVY_RESTORE_OUTPUT_DIR || '.tmp/benchmark/heavy-restore')
const outputJsonPath = path.join(outputDir, 'latest.json')
const outputMarkdownPath = path.join(outputDir, 'latest.md')
const repeats = Number(process.env.MARKSTREAM_HEAVY_RESTORE_REPEATS || 3)
const cpuThrottleRate = Number(process.env.MARKSTREAM_HEAVY_RESTORE_CPU_THROTTLE_RATE || 4)
const observationMs = Number(process.env.MARKSTREAM_HEAVY_RESTORE_OBSERVATION_MS || 1800)
const timeoutMs = Number(process.env.MARKSTREAM_HEAVY_RESTORE_TIMEOUT_MS || 12000)
const traceEnabled = process.env.MARKSTREAM_HEAVY_RESTORE_TRACE !== '0'
const cpuProfileEnabled = process.env.MARKSTREAM_HEAVY_RESTORE_CPU_PROFILE === '1'
const allowFailure = process.env.MARKSTREAM_HEAVY_RESTORE_ALLOW_FAILURE === '1'
const disableAutoVirtual = process.env.MARKSTREAM_HEAVY_RESTORE_DISABLE_AUTO_VIRTUAL === '1'
const tailNodes = Number(process.env.MARKSTREAM_HEAVY_RESTORE_TAIL_NODES || 72)

if (!Number.isInteger(repeats) || repeats <= 0)
  throw new Error('MARKSTREAM_HEAVY_RESTORE_REPEATS must be a positive integer.')
if (!Number.isFinite(cpuThrottleRate) || cpuThrottleRate < 1)
  throw new Error('MARKSTREAM_HEAVY_RESTORE_CPU_THROTTLE_RATE must be at least 1.')
if (!Number.isFinite(observationMs) || observationMs <= 0)
  throw new Error('MARKSTREAM_HEAVY_RESTORE_OBSERVATION_MS must be positive.')
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
  throw new Error('MARKSTREAM_HEAVY_RESTORE_TIMEOUT_MS must be positive.')
if (!Number.isInteger(tailNodes) || tailNodes < 0)
  throw new Error('MARKSTREAM_HEAVY_RESTORE_TAIL_NODES must be a non-negative integer.')

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const executablePath of candidates) {
    if (existsSync(executablePath))
      return { executablePath, headless: true }
  }
  return { channel: 'chrome', headless: true }
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]))
}

async function getMetrics(client) {
  return metricMap(await client.send('Performance.getMetrics'))
}

async function readProtocolStream(client, handle) {
  const chunks = []
  while (true) {
    const result = await client.send('IO.read', { handle })
    chunks.push(result.base64Encoded ? Buffer.from(result.data, 'base64').toString('utf8') : result.data)
    if (result.eof)
      break
  }
  await client.send('IO.close', { handle })
  return chunks.join('')
}

function summarizeTrace(events) {
  const totals = new Map()
  for (const event of events) {
    if (event.ph !== 'X' || !Number.isFinite(event.dur) || event.dur <= 0)
      continue
    const current = totals.get(event.name) ?? { name: event.name, count: 0, durationMs: 0, maxMs: 0 }
    const durationMs = event.dur / 1000
    current.count += 1
    current.durationMs += durationMs
    current.maxMs = Math.max(current.maxMs, durationMs)
    totals.set(event.name, current)
  }
  const get = name => totals.get(name) ?? { count: 0, durationMs: 0, maxMs: 0 }
  return {
    paintCount: get('Paint').count,
    paintDurationMs: round(get('Paint').durationMs),
    rasterTaskCount: get('RasterTask').count,
    rasterTaskDurationMs: round(get('RasterTask').durationMs),
    compositeLayersCount: get('CompositeLayers').count,
    compositeLayersDurationMs: round(get('CompositeLayers').durationMs),
    animationFrameCount: get('FireAnimationFrame').count,
    animationFrameDurationMs: round(get('FireAnimationFrame').durationMs),
    animationFrameMaxMs: round(get('FireAnimationFrame').maxMs),
    topEvents: Array.from(totals.values())
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20)
      .map(event => ({ ...event, durationMs: round(event.durationMs), maxMs: round(event.maxMs) })),
  }
}

async function stopTracing(client) {
  const completed = new Promise(resolve => client.once('Tracing.tracingComplete', resolve))
  await client.send('Tracing.end')
  const { stream } = await completed
  const payload = JSON.parse(await readProtocolStream(client, stream))
  return summarizeTrace(payload.traceEvents || [])
}

function metricDelta(before, after) {
  const read = (metrics, name) => {
    const value = metrics[name]
    if (!Number.isFinite(value))
      throw new Error(`Chrome Performance metric is unavailable: ${name}`)
    return value
  }
  const beforeTaskDuration = read(before, 'TaskDuration')
  const afterTaskDuration = read(after, 'TaskDuration')
  const taskDurationMs = (afterTaskDuration - beforeTaskDuration) * 1000
  return {
    taskDurationMs,
    taskOtherDurationMs: (read(after, 'TaskOtherDuration') - read(before, 'TaskOtherDuration')) * 1000,
    threadTimeMs: (read(after, 'ThreadTime') - read(before, 'ThreadTime')) * 1000,
    processTimeMs: (read(after, 'ProcessTime') - read(before, 'ProcessTime')) * 1000,
    scriptDurationMs: (read(after, 'ScriptDuration') - read(before, 'ScriptDuration')) * 1000,
    layoutDurationMs: (read(after, 'LayoutDuration') - read(before, 'LayoutDuration')) * 1000,
    layoutCount: read(after, 'LayoutCount') - read(before, 'LayoutCount'),
    recalcStyleDurationMs: (read(after, 'RecalcStyleDuration') - read(before, 'RecalcStyleDuration')) * 1000,
    recalcStyleCount: read(after, 'RecalcStyleCount') - read(before, 'RecalcStyleCount'),
    heapUsedMB: read(after, 'JSHeapUsedSize') / 1024 / 1024,
    heapDeltaMB: (read(after, 'JSHeapUsedSize') - read(before, 'JSHeapUsedSize')) / 1024 / 1024,
  }
}

function requestSnapshot(counts) {
  return Object.fromEntries(Object.entries(counts))
}

function requestDelta(before, after) {
  return Object.fromEntries(Object.keys(after).map(key => [key, after[key] - (before[key] || 0)]))
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const totals = new Map()
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const node = nodes.get(profile.samples[index])
    if (!node)
      continue
    const frame = node.callFrame
    const key = `${frame.functionName}\n${frame.url}\n${frame.lineNumber}`
    const current = totals.get(key) ?? {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url,
      line: frame.lineNumber + 1,
      selfTimeMs: 0,
      samples: 0,
    }
    current.selfTimeMs += (profile.timeDeltas?.[index] ?? 0) / 1000
    current.samples += 1
    totals.set(key, current)
  }
  return Array.from(totals.values())
    .sort((a, b) => b.selfTimeMs - a.selfTimeMs)
    .slice(0, 30)
    .map(entry => ({ ...entry, selfTimeMs: round(entry.selfTimeMs) }))
}

async function measurePhase(client, page, functionName, options, requests) {
  await client.send('HeapProfiler.collectGarbage').catch(() => {})
  const before = await getMetrics(client)
  const requestsBefore = requestSnapshot(requests)
  if (traceEnabled) {
    await client.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc',
      transferMode: 'ReturnAsStream',
    })
  }
  if (cpuProfileEnabled) {
    await client.send('Profiler.enable')
    await client.send('Profiler.start')
  }
  const result = await page.evaluate(({ functionName, options }) => window[functionName](options), { functionName, options })
  const cpuProfile = cpuProfileEnabled
    ? summarizeCpuProfile((await client.send('Profiler.stop')).profile)
    : undefined
  const after = await getMetrics(client)
  const trace = traceEnabled ? await stopTracing(client) : {}
  await client.send('HeapProfiler.collectGarbage').catch(() => {})
  const retained = await getMetrics(client)
  const retainedHeap = retained.JSHeapUsedSize
  const beforeHeap = before.JSHeapUsedSize
  if (!Number.isFinite(retainedHeap) || !Number.isFinite(beforeHeap))
    throw new Error('Chrome Performance metric is unavailable: JSHeapUsedSize')
  return {
    ...result,
    metrics: {
      ...metricDelta(before, after),
      taskBusyRatio: ((after.TaskDuration - before.TaskDuration) * 1000) / result.totalMs,
      retainedHeapMB: retainedHeap / 1024 / 1024,
      retainedHeapDeltaMB: (retainedHeap - beforeHeap) / 1024 / 1024,
      requests: requestDelta(requestsBefore, requests),
      trace,
      cpuProfile,
    },
  }
}

function getInitialLightweightChecks(initial) {
  const snapshot = initial.settledSnapshot
  // Math blocks with a synchronous custom loader render immediately by
  // contract (test/math-final-restore-defer.test.ts), so they are excluded
  // from the deferral gate; code/image/mermaid/infographic still must defer.
  const deferredHeavyStates = Object.entries(snapshot.heavy)
    .filter(([type]) => type !== 'math')
    .map(([, state]) => state)
  const counterKeys = ['mermaidLoader', 'mermaidParse', 'mermaidRender', 'infographicLoader', 'infographicConstruct', 'infographicRender']
  const counterValues = counterKeys.map(key => snapshot.counters[key])
  return {
    sourceMatches: initial.sourceMatches === true,
    automaticFinalRestore: snapshot.rendererState?.finalRestoreAutoVirtualEnabled === !disableAutoVirtual,
    viewportPriorityEnabled: snapshot.rendererState?.viewportPriorityEnabled === true,
    boundedSlots: disableAutoVirtual
      ? snapshot.slots === snapshot.rendererState?.parsedNodeCount
      : snapshot.slots === 50,
    targetsMounted: heavyStatesAllMounted(snapshot),
    targetsOffscreen: heavyStatesAllOffscreen(snapshot),
    deferralProvided: deferredHeavyStates.every(state => state.offscreenDeferral === true),
    noEnhancements: deferredHeavyStates.every(state => state.enhanced === false),
    noHeavyLoaderWork: counterValues.every(value => value === 0),
    noImageRequest: initial.metrics.requests.image === 0,
    noCodeRuntimeRequest: initial.metrics.requests.codeRuntimeModules === 0,
    noMathRuntimeRequest: initial.metrics.requests.mathRuntimeModules === 0,
    noMermaidRuntimeRequest: initial.metrics.requests.mermaidRuntimeModules === 0,
    noInfographicRuntimeRequest: initial.metrics.requests.infographicRuntimeModules === 0,
  }
}

function heavyStatesAllMounted(snapshot) {
  return Object.values(snapshot.heavy).every(state => state.mounted)
}

function heavyStatesAllOffscreen(snapshot) {
  return Object.values(snapshot.heavy).every(state => !state.visible && state.distanceFromViewportPx > 0)
}

function classifyRequest(url, counts) {
  counts.total += 1
  if (url.includes('heavy-image.svg'))
    counts.image += 1
  if (/\/components\/CodeBlockNode/i.test(url))
    counts.codeComponentModules += 1
  if (/stream-diffs/i.test(url))
    counts.codeRuntimeModules += 1
  if (/\/components\/(?:MathBlockNode|MathInlineNode)/i.test(url))
    counts.mathComponentModules += 1
  if (/node_modules\/katex/i.test(url))
    counts.mathRuntimeModules += 1
  if (/\/components\/MermaidBlockNode/i.test(url))
    counts.mermaidComponentModules += 1
  if (/node_modules\/mermaid/i.test(url))
    counts.mermaidRuntimeModules += 1
  if (/\/components\/InfographicBlockNode/i.test(url))
    counts.infographicComponentModules += 1
  if (/node_modules\/.*infographic/i.test(url))
    counts.infographicRuntimeModules += 1
}

async function runOnce(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const requests = {
    total: 0,
    image: 0,
    codeComponentModules: 0,
    codeRuntimeModules: 0,
    mathComponentModules: 0,
    mathRuntimeModules: 0,
    mermaidComponentModules: 0,
    mermaidRuntimeModules: 0,
    infographicComponentModules: 0,
    infographicRuntimeModules: 0,
  }
  const pageErrors = []
  const consoleMessages = []
  page.on('request', request => classifyRequest(request.url(), requests))
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error')
      consoleMessages.push({ type: message.type(), text: message.text() })
  })
  await page.route('**/heavy-image.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" fill="#2563eb"/><text x="20" y="40" fill="white">HEAVY_IMAGE_READY</text></svg>',
  }))
  const params = new URLSearchParams({ tailNodes: String(tailNodes) })
  if (disableAutoVirtual)
    params.set('disableAutoVirtual', '1')
  await page.goto(`http://127.0.0.1:${port}/?${params}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true)
  if (cpuThrottleRate > 1)
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate })
  for (const key of Object.keys(requests))
    requests[key] = 0

  const initial = await measurePhase(client, page, '__runHeavyRestoreInitial', { observationMs }, requests)
  initial.lightweightChecks = getInitialLightweightChecks(initial)
  initial.lightweightPassed = Object.values(initial.lightweightChecks).every(Boolean)
  if (!allowFailure && !initial.lightweightPassed)
    throw new Error(`Heavy restore initial deferral failed: ${JSON.stringify(initial.lightweightChecks)}`)
  const deep = await measurePhase(client, page, '__runHeavyRestoreDeep', { timeoutMs, strict: !allowFailure }, requests)
  await page.close()
  if (pageErrors.length)
    throw new Error(`Heavy restore page errors:\n${pageErrors.join('\n')}`)
  return { initial, deep, consoleMessages }
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function summarizeRuns(runs, phase) {
  const phaseRuns = runs.map(run => run[phase])
  const representative = phaseRuns.slice().sort((a, b) => a.totalMs - b.totalMs)[Math.floor(phaseRuns.length / 2)]
  const numericPaths = [
    'totalMs',
    'observers.longTaskCount',
    'observers.longTaskTotalMs',
    'observers.longTaskMaxMs',
    'observers.frameP95Ms',
    'observers.frameMaxMs',
    'observers.droppedFrameEstimate',
    'observers.heapPeakMB',
    'observers.mutations',
    'observers.heightJumpCount',
    'observers.heightMaxDeltaPx',
    'observers.cls',
    'metrics.taskDurationMs',
    'metrics.taskBusyRatio',
    'metrics.taskOtherDurationMs',
    'metrics.threadTimeMs',
    'metrics.processTimeMs',
    'metrics.scriptDurationMs',
    'metrics.layoutDurationMs',
    'metrics.layoutCount',
    'metrics.recalcStyleDurationMs',
    'metrics.recalcStyleCount',
    'metrics.heapUsedMB',
    'metrics.heapDeltaMB',
    'metrics.retainedHeapMB',
    'metrics.retainedHeapDeltaMB',
  ]
  if (traceEnabled) {
    numericPaths.push(
      'metrics.trace.paintCount',
      'metrics.trace.paintDurationMs',
      'metrics.trace.rasterTaskCount',
      'metrics.trace.rasterTaskDurationMs',
      'metrics.trace.animationFrameCount',
      'metrics.trace.animationFrameDurationMs',
      'metrics.trace.animationFrameMaxMs',
    )
  }
  const summary = {}
  for (const dottedPath of numericPaths) {
    const parts = dottedPath.split('.')
    const values = phaseRuns.map((run) => {
      let value = run
      for (const part of parts)
        value = value?.[part]
      if (!Number.isFinite(value))
        throw new Error(`Benchmark metric is unavailable: ${phase}.${dottedPath}`)
      return value
    })
    let target = summary
    for (const part of parts.slice(0, -1))
      target = target[part] ??= {}
    target[parts.at(-1)] = round(median(values))
  }
  summary.snapshot = phase === 'initial' ? representative.settledSnapshot : representative.finalSnapshot
  summary.correctness = representative.correctness ?? { sourceMatches: representative.sourceMatches }
  summary.lightweightChecks = representative.lightweightChecks
  summary.lightweightPassed = representative.lightweightPassed
  summary.targets = representative.targets
  summary.requests = representative.metrics.requests
  summary.traceTopEvents = representative.metrics.trace.topEvents ?? []
  return summary
}

function formatMs(value) {
  return Number.isFinite(value) ? `${round(value, 1)}ms` : 'n/a'
}

function renderMarkdown(payload) {
  const lines = [
    '# Heavy Restore Benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Method: ${payload.method}`,
    '',
    '| Phase | Total | Task | Thread CPU | Script | Layout | Paint | RAF | Raster | Long tasks | Frame p95/max | Peak/retained heap | DOM | Placeholders | Height jumps |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const phase of ['initial', 'deep']) {
    const row = payload.median[phase]
    lines.push(`| ${phase} | ${formatMs(row.totalMs)} | ${formatMs(row.metrics.taskDurationMs)} | ${formatMs(row.metrics.threadTimeMs)} | ${formatMs(row.metrics.scriptDurationMs)} | ${formatMs(row.metrics.layoutDurationMs)} | ${formatMs(row.metrics.trace?.paintDurationMs)} | ${row.metrics.trace?.animationFrameCount ?? 'n/a'} / ${formatMs(row.metrics.trace?.animationFrameDurationMs)} | ${formatMs(row.metrics.trace?.rasterTaskDurationMs)} | ${row.observers.longTaskCount} / ${formatMs(row.observers.longTaskTotalMs)} | ${formatMs(row.observers.frameP95Ms)} / ${formatMs(row.observers.frameMaxMs)} | ${round(row.observers.heapPeakMB, 1)} / ${round(row.metrics.retainedHeapMB, 1)} MB | ${row.snapshot.domNodes} | ${row.snapshot.nodePlaceholders} | ${row.observers.heightJumpCount} |`)
  }
  lines.push('', '## Initial heavy state', '', '```json', JSON.stringify(payload.median.initial.snapshot, null, 2), '```')
  lines.push('', '## Initial lightweight checks', '', '```json', JSON.stringify(payload.median.initial.lightweightChecks, null, 2), '```')
  lines.push('', '## Deep enhancement', '', '```json', JSON.stringify({ targets: payload.median.deep.targets, snapshot: payload.median.deep.snapshot, correctness: payload.median.deep.correctness }, null, 2), '```')
  return `${lines.join('\n')}\n`
}

async function createBenchmarkServer() {
  const server = await createServer({
    root: fixtureRoot,
    logLevel: 'silent',
    plugins: [vue()],
    resolve: {
      alias: [
        { find: 'markstream-vue/index.css', replacement: path.join(sourceRoot, 'src/index.css') },
        { find: 'markstream-core', replacement: path.join(sourceRoot, 'packages/markstream-core/src/index.ts') },
        { find: 'stream-markdown-parser', replacement: path.join(sourceRoot, 'packages/markdown-parser/src/index.ts') },
        { find: 'markstream-vue', replacement: path.join(sourceRoot, 'src/exports.ts') },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 4182,
      strictPort: false,
      fs: { allow: [repoRoot, sourceRoot] },
    },
  })
  await server.listen()
  const address = server.httpServer?.address()
  return { server, port: typeof address === 'object' && address ? address.port : server.config.server.port }
}

async function main() {
  const { server, port } = await createBenchmarkServer()
  const browser = await chromium.launch(resolveChromeLaunchOptions())
  try {
    const runs = []
    for (let index = 0; index < repeats; index++) {
      console.log(`heavy-restore run=${index + 1}/${repeats}`)
      runs.push(await runOnce(browser, port))
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'scripts/benchmark-heavy-restore.mjs',
      fixture: 'test/benchmark/heavy-restore',
      method: `${repeats}-run median, 4x CPU by default after page ready, ${observationMs}ms unscrolled observation, deterministic counted heavy loaders, per-phase CDP trace`,
      config: { repeats, cpuThrottleRate, observationMs, timeoutMs, traceEnabled, cpuProfileEnabled, allowFailure, disableAutoVirtual, tailNodes, sourceRoot },
      environment: {
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        totalMemoryGB: round(totalmem() / 1024 / 1024 / 1024, 1),
        browser: await browser.version(),
      },
      median: {
        initial: summarizeRuns(runs, 'initial'),
        deep: summarizeRuns(runs, 'deep'),
      },
      runs,
    }
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`)
    writeFileSync(outputMarkdownPath, renderMarkdown(payload))
    console.log(`wrote ${path.relative(repoRoot, outputJsonPath)}`)
    console.log(`wrote ${path.relative(repoRoot, outputMarkdownPath)}`)
  }
  finally {
    await browser.close()
    await server.close()
  }
}

await main()
