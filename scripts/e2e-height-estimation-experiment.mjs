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

async function findFreePort(start = 4200, end = 4240) {
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

async function runScenario(page, sourceMode) {
  return page.evaluate(async (sourceMode) => {
    const api = window.__heightEstimationExperiment
    if (!api)
      throw new Error('Missing __heightEstimationExperiment API.')

    await api.setSourceMode(sourceMode)
    await api.waitUntilReady()

    const summaryInitial = api.getSummary()
    const restore = await api.runRestoreTrial()
    const loading = sourceMode === 'nodes' ? await api.runLoadingReadyTrial() : null
    const resize = await api.runResizeTrial([375, 768, 1280])
    await api.waitUntilReady()
    const summaryFinal = api.getSummary()

    return {
      sourceMode,
      summaryInitial,
      summaryFinal,
      restore,
      loading,
      resize,
      reports: api.getReports(),
    }
  }, sourceMode)
}

function absoluteOrNull(value) {
  return value == null ? null : Math.abs(Number(value))
}

function assertScenario(result) {
  const id = result.sourceMode
  const summary = result.summaryFinal
  if (!summary)
    throw new Error(`[${id}] Missing summary.`)

  if (!(summary.actualTotalHeight > 0))
    throw new Error(`[${id}] Actual total height must be > 0.`)

  const restoreDrift = absoluteOrNull(result.restore?.t500?.experiment)
  if (restoreDrift == null)
    throw new Error(`[${id}] Missing experiment restore drift.`)

  if (!Array.isArray(result.resize) || result.resize.length !== 3)
    throw new Error(`[${id}] Resize trial did not return 3 samples.`)

  if (!(summary.experimentError < summary.baselineError))
    throw new Error(`[${id}] Experiment error should be lower than baseline.`)

  if (!(restoreDrift <= 8))
    throw new Error(`[${id}] Experiment restore drift should stay within 8px at t500.`)

  for (const sample of result.resize) {
    const drift = absoluteOrNull(sample?.experiment)
    if (drift == null)
      throw new Error(`[${id}] Missing resize drift for width ${sample?.width ?? 'unknown'}.`)
    if (!(drift <= 12))
      throw new Error(`[${id}] Resize drift should stay within 12px (width ${sample.width}).`)
  }

  if (result.sourceMode === 'nodes' && !result.loading)
    throw new Error(`[${id}] Missing nodes loading trial result.`)

  if (result.sourceMode === 'nodes') {
    const loadingDelta = absoluteOrNull(result.loading?.experiment)
    if (loadingDelta == null)
      throw new Error(`[${id}] Missing experiment loading delta.`)
    if (!(loadingDelta <= 16))
      throw new Error(`[${id}] Loading transition should stay within 16px.`)
  }
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
    for (const sourceMode of ['nodes', 'content'])
      scenarios.push(await runScenario(page, sourceMode))

    for (const scenario of scenarios) {
      try {
        assertScenario(scenario)
      }
      catch (error) {
        console.error('[e2e-height-estimation-experiment] scenario failure')
        console.error(JSON.stringify({
          sourceMode: scenario.sourceMode,
          summaryInitial: scenario.summaryInitial,
          summaryFinal: scenario.summaryFinal,
          restore: scenario.restore,
          loading: scenario.loading,
          resize: scenario.resize,
        }, null, 2))
        throw error
      }
    }

    const report = {}
    for (const scenario of scenarios) {
      report[scenario.sourceMode] = {
        initial: scenario.summaryInitial,
        final: scenario.summaryFinal,
        restore: scenario.restore,
        loading: scenario.loading,
        resize: scenario.resize,
      }
    }

    console.log(JSON.stringify(report, null, 2))

    await browser.close()
  }
  catch (error) {
    console.error('[e2e-height-estimation-experiment] failed')
    console.error(error)
    console.error(server.getLogs())
    process.exitCode = 1
  }
  finally {
    cleanup()
  }
}

run()
