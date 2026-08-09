#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundDir = path.join(repoRoot, 'playground-react19')
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

async function findFreePort(start = 4180, end = 4210) {
  for (let port = start; port <= end; port += 1) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 30000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
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
    ['exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: playgroundDir,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const appendLogs = (chunk) => {
    logs.push(String(chunk))
    if (logs.length > 120)
      logs.splice(0, logs.length - 120)
  }

  child.stdout.on('data', appendLogs)
  child.stderr.on('data', appendLogs)

  return {
    child,
    getLogs: () => logs.join(''),
  }
}

function stopServer(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)
  let browser

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

    await page.addInitScript(() => {
      // Exercise the WebSocket profile deterministically. Sampling 0.75 from
      // its 4–8 character range produces seven-character transport chunks.
      Math.random = () => 0.75
      localStorage.setItem('vmr-settings-stream-delay-min', '8')
      localStorage.setItem('vmr-settings-stream-delay-max', '20')
      localStorage.setItem('vmr-settings-stream-chunk-size-min', '4')
      localStorage.setItem('vmr-settings-stream-chunk-size-max', '8')
      localStorage.setItem('vmr-settings-stream-burstiness', '22')
      localStorage.setItem('vmr-settings-stream-transport-mode', 'readable-stream')
      localStorage.setItem('vmr-settings-stream-slice-mode', 'pure-random')
    })

    await page.goto(`http://${host}:${port}/`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'markstream-react19' }).waitFor()

    const profileSelect = page.locator('label').filter({ hasText: 'Stream Profile' }).locator('..').locator('select')
    assert(await profileSelect.inputValue() === 'websocket', 'The playground did not activate the WebSocket stream profile')

    await page.waitForFunction(
      () => document.body.textContent?.includes('这种联系可以进一步深化'),
      undefined,
      { timeout: 60000 },
    )
    const expectedLanguages = ['Shell', 'JavaScript', 'JSON', 'Python', 'C++', 'Vue', 'JavaScript', 'JavaScript']
    await page.waitForFunction(
      expectedCount => document.querySelectorAll('[data-node-type="code_block"]').length >= expectedCount,
      expectedLanguages.length,
      { timeout: 15000 },
    )

    const slots = page.locator('[data-node-type="code_block"]')
    const blocks = []
    for (const [index, expectedLanguage] of expectedLanguages.entries()) {
      const slot = slots.nth(index)
      await slot.scrollIntoViewIfNeeded()
      await slot.locator('.code-editor-container[data-markstream-enhanced="true"] .stream-diffs-shell').waitFor({ state: 'visible', timeout: 15000 })
      blocks.push(await slot.evaluate((element, { index, expectedLanguage }) => ({
        index: index + 1,
        expectedLanguage,
        language: element.querySelector('.code-block-header')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        hasShell: Boolean(element.querySelector('.code-block-container')),
        hasStreamDiffs: Boolean(element.querySelector('.stream-diffs-shell')),
        enhanced: element.querySelector('.code-editor-container')?.getAttribute('data-markstream-enhanced') === 'true',
        fallbackVisible: Array.from(element.querySelectorAll('.code-fallback-plain')).some((fallback) => {
          const style = getComputedStyle(fallback)
          const rect = fallback.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }),
      }), { index, expectedLanguage }))
    }
    const result = { expectedCount: expectedLanguages.length, blocks }

    assert(
      result.blocks.length === result.expectedCount,
      `Expected ${result.expectedCount} regular code blocks, found ${result.blocks.length}`,
    )

    const degradedBlocks = result.blocks.filter(block =>
      !block.hasShell
      || !block.hasStreamDiffs
      || !block.enhanced
      || block.fallbackVisible
      || block.language !== block.expectedLanguage,
    )
    assert(
      degradedBlocks.length === 0,
      `WebSocket streaming permanently degraded code blocks: ${JSON.stringify(degradedBlocks)}`,
    )

    console.log('[e2e-react-websocket-code-blocks] WebSocket code blocks remained enhanced')
  }
  catch (error) {
    const logs = server.getLogs().trim()
    if (logs) {
      console.error('--- React 19 playground logs ---')
      console.error(logs)
      console.error('--- end playground logs ---')
    }
    throw error
  }
  finally {
    await browser?.close()
    stopServer(server.child)
  }
}

await main()
