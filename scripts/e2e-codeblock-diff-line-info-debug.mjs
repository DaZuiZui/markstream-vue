import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import { chromium } from 'playwright-core'

const host = '127.0.0.1'
const port = 4230
const playground = '/Users/Simon/Github/markstream-vue/playground'

function isOpen(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: portNumber })
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

async function waitForPort(portNumber, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await isOpen(portNumber))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`timeout waiting for ${portNumber}`)
}

async function readFoldingState(page) {
  return page.evaluate(() => {
    function pickStyle(node) {
      if (!(node instanceof HTMLElement))
        return null
      const style = window.getComputedStyle(node)
      return {
        background: style.background,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      }
    }

    function isVisible(node) {
      if (!(node instanceof HTMLElement))
        return false
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.01
    }

    const shell = document.querySelector('.code-block-container.is-diff .stream-diffs-shell')
    const surface = document.querySelector('.code-block-container.is-diff diffs-container')
    const root = surface?.shadowRoot
    const pre = root?.querySelector('pre[data-diff]')
    const separators = Array.from(root?.querySelectorAll('[data-separator="line-info"]') ?? [])
    const labels = Array.from(root?.querySelectorAll('[data-unmodified-lines]') ?? [])
    const buttons = Array.from(root?.querySelectorAll('[data-expand-button]') ?? [])
    const firstLineNumber = root?.querySelector('[data-line-number-content]')
    const firstLine = root?.querySelector('[data-content] [data-line]')

    return {
      surfaceCount: document.querySelectorAll('.code-block-container.is-diff diffs-container').length,
      diffType: pre?.getAttribute('data-diff-type') ?? null,
      hiddenRegionCount: labels.length,
      hiddenRegionTexts: labels.map(node => node.textContent?.trim() ?? ''),
      visibleExpandButtonCount: buttons.filter(isVisible).length,
      pre: pickStyle(pre),
      separator: pickStyle(separators[0]),
      label: pickStyle(labels[0]),
      lineNumber: firstLineNumber instanceof HTMLElement
        ? {
            text: firstLineNumber.textContent?.trim() ?? '',
            left: Math.round(firstLineNumber.getBoundingClientRect().left),
            width: Math.round(firstLineNumber.getBoundingClientRect().width),
          }
        : null,
      code: firstLine instanceof HTMLElement
        ? {
            text: firstLine.textContent?.trim() ?? '',
            left: Math.round(firstLine.getBoundingClientRect().left),
          }
        : null,
      scroll: shell instanceof HTMLElement
        ? {
            top: Math.round(shell.scrollTop),
            height: Math.round(shell.getBoundingClientRect().height),
            scrollHeight: Math.round(shell.scrollHeight),
          }
        : null,
    }
  })
}

async function captureStaticState(page) {
  await page.waitForSelector('.code-block-container.is-diff[data-markstream-enhanced="true"] .stream-diffs-shell', { timeout: 120000 })
  await page.waitForFunction(() => {
    const root = document.querySelector('.code-block-container.is-diff diffs-container')?.shadowRoot
    return (root?.querySelectorAll('[data-unmodified-lines]').length ?? 0) > 0
  }, { timeout: 120000 })
  return readFoldingState(page)
}

async function captureRevealStepState(page) {
  const before = await readFoldingState(page)
  await page.locator('diffs-container [data-expand-button]:visible').first().click()
  await page.waitForTimeout(300)
  const after = await readFoldingState(page)
  return { before, after }
}

async function captureExpandedScrollState(page) {
  await page.evaluate(() => {
    const shell = document.querySelector('.code-block-container.is-diff .stream-diffs-shell')
    if (shell instanceof HTMLElement)
      shell.scrollTop = Math.min(220, shell.scrollHeight - shell.clientHeight)
  })
  await page.waitForTimeout(300)
  return readFoldingState(page)
}

async function main() {
  const vite = spawn(
    'pnpm',
    ['-C', playground, 'dev', '--host', host, '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  )

  let logs = ''
  vite.stdout.on('data', (chunk) => {
    logs += String(chunk)
  })
  vite.stderr.on('data', (chunk) => {
    logs += String(chunk)
  })

  try {
    await waitForPort(port)

    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

    await page.addInitScript(() => {
      localStorage.setItem('vmr-test-render-mode', 'stream-diffs')
      localStorage.setItem('vmr-test-code-stream', 'true')
      localStorage.setItem('vmr-test-viewport-priority', 'false')
      localStorage.setItem('vmr-test-batch-rendering', 'false')
      localStorage.setItem('vmr-test-typewriter', 'false')
      localStorage.setItem('vmr-test-show-settings', 'true')
      localStorage.setItem('vmr-test-stream-speed', '4')
      localStorage.setItem('vmr-test-stream-interval', '24')
    })

    console.log('goto')
    page.setDefaultNavigationTimeout(120000)
    await page.goto(`http://${host}:${port}/diff-line-info-regression`, { waitUntil: 'commit', timeout: 120000 })
    await page.waitForSelector('h1', { timeout: 120000 })
    console.log('page-loaded')

    const staticState = await captureStaticState(page)
    console.log('static-captured')
    const revealStepState = await captureRevealStepState(page)
    console.log('reveal-step-captured')
    const expandedScrollState = await captureExpandedScrollState(page)
    console.log('expanded-scroll-captured')

    console.log(JSON.stringify({ staticState, revealStepState, expandedScrollState }, null, 2))

    await browser.close()
  }
  catch (error) {
    console.error(String(error))
    console.error(logs)
    process.exitCode = 1
  }
  finally {
    try {
      vite.kill('SIGTERM')
    }
    catch {}
  }
}

await main()
