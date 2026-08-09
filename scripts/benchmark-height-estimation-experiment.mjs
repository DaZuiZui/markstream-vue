#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findFreePort(start = 4241, end = 4270) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
}

function killProcessTree(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        headless: true,
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
  }
}

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
      },
    },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs() {
      return logs.join('')
    },
  }
}

async function runScenario(page, width) {
  return page.evaluate(async (width) => {
    const api = window.__heightEstimationExperiment
    if (!api)
      throw new Error('Missing __heightEstimationExperiment API.')

    await api.setSourceMode('nodes')
    await api.setLoadingPhase(false)
    await api.setPaneWidth(width)
    await api.waitUntilReady()

    const summary = api.getSummary()
    const allNodes = await api.runEstimatorBenchmark({
      width,
      passes: 5,
      resetCachesBeforeFirstPass: true,
      mode: 'all',
    })

    const skipMeasuredSimpleText = await api.runEstimatorBenchmark({
      width,
      passes: 5,
      resetCachesBeforeFirstPass: true,
      mode: 'skip-measured-simple-text',
    })

    return {
      renderer: 'stream-diffs',
      width,
      summary,
      benchmarks: {
        allNodes,
        skipMeasuredSimpleText,
      },
    }
  }, width)
}

function assertScenario(result) {
  const id = `stream-diffs/${result.width}`
  const { allNodes, skipMeasuredSimpleText } = result.benchmarks ?? {}
  if (!(allNodes?.nodeCount >= 1000))
    throw new Error(`[${id}] Benchmark node count is too low.`)
  if (!(allNodes?.estimableCount >= 900))
    throw new Error(`[${id}] Estimable node coverage is too low.`)
  if (!(Number.isFinite(allNodes?.coldPassMs) && allNodes.coldPassMs > 0))
    throw new Error(`[${id}] Missing cold benchmark pass.`)
  if (!(Number.isFinite(allNodes?.warmAverageMs) && allNodes.warmAverageMs > 0))
    throw new Error(`[${id}] Missing warm benchmark average.`)
  if (!(Number.isFinite(skipMeasuredSimpleText?.warmAverageMs) && skipMeasuredSimpleText.warmAverageMs > 0))
    throw new Error(`[${id}] Missing skip-measured-simple-text warm benchmark average.`)
  if (!(skipMeasuredSimpleText?.skippedMeasuredSimpleTextCount > 0))
    throw new Error(`[${id}] Expected some measured simple-text nodes to be skipped.`)
  if (!(skipMeasuredSimpleText?.warmAverageMs < allNodes.warmAverageMs))
    throw new Error(`[${id}] Skip-measured-simple-text warm pass should be cheaper than all-nodes.`)
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const server = startDevServer(port)
  const cleanup = () => killProcessTree(server.child)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)
    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
    await page.goto(`http://${host}:${port}/height-estimation-experiment`, { waitUntil: 'load' })

    const scenarios = []
    for (const width of [520, 1280])
      scenarios.push(await runScenario(page, width))

    for (const scenario of scenarios)
      assertScenario(scenario)

    const report = {}

    for (const scenario of scenarios)
      report[scenario.width] = scenario

    console.log(JSON.stringify(report, null, 2))
    await browser.close()
  }
  catch (error) {
    console.error('[benchmark-height-estimation-experiment] failed')
    console.error(error)
    console.error(server.getLogs())
    process.exitCode = 1
  }
  finally {
    cleanup()
  }
}

run()
