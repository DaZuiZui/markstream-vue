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
const layouts = process.env.DIFF_LAYOUT === 'side-by-side'
  ? ['side-by-side']
  : process.env.DIFF_LAYOUT === 'inline'
    ? ['inline']
    : ['inline', 'side-by-side']
const renderModes = ['stream-diffs']

const diffSample = [
  '```diff json:package.json',
  '{',
  '  "name": "markstream-vue",',
  '  "type": "module",',
  '- "version": "0.0.49",',
  '+ "version": "0.0.54-beta.1",',
  `- "description": "${'before-description-'.repeat(24)}",`,
  `+ "description": "${'after-description-'.repeat(24)}",`,
  ...Array.from({ length: 24 }, (_, index) => `  "unchanged-${String(index + 1).padStart(2, '0')}": ${index + 1},`),
  '}',
  '```',
].join('\n')

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

async function findFreePort(start = 4370, end = 4410) {
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
    if (child.pid && process.platform !== 'win32')
      process.kill(-child.pid, 'SIGTERM')
    else
      child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (child.pid && process.platform !== 'win32')
        process.kill(-child.pid, 'SIGKILL')
      else if (!child.killed)
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
    if (existsSync(candidate))
      return { executablePath: candidate, headless: true }
  }

  return { channel: 'chrome', headless: true }
}

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: { ...process.env, CI: '1' },
    },
  )
  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))
  return { child, getLogs: () => logs.join('') }
}

async function readState(page) {
  return page.evaluate(() => {
    const block = Array.from(document.querySelectorAll('.preview-surface .code-block-container'))
      .find(element => element.classList.contains('is-diff'))
    if (!(block instanceof HTMLElement))
      return { exists: false }

    const pre = block.querySelector('pre.code-pre-fallback')
    const diffs = block.querySelector('diffs-container')
    const editor = block.querySelector('.code-editor-container')
    const content = block.querySelector('.code-block-shell-content')
    const preRect = pre?.getBoundingClientRect()
    const preStyle = pre ? getComputedStyle(pre) : null
    const round = value => Math.round(value * 100) / 100
    const preGeometry = pre instanceof HTMLElement
      ? Array.from(pre.querySelectorAll('.markstream-pre__diff-pane')).map((pane) => {
          const paneRect = pane.getBoundingClientRect()
          const changedLine = pane.querySelector('.markstream-pre__diff-line--added, .markstream-pre__diff-line--removed')
          const content = changedLine?.querySelector('.markstream-pre__diff-content')
          return {
            paneOffset: round(paneRect.left - pre.getBoundingClientRect().left),
            codeOffset: content instanceof HTMLElement ? round(content.getBoundingClientRect().left - paneRect.left) : null,
            rowHeight: changedLine instanceof HTMLElement ? round(changedLine.getBoundingClientRect().height) : null,
          }
        })
      : null
    const preVisible = Boolean(
      preRect
      && preRect.width > 0
      && preRect.height > 0
      && preStyle?.display !== 'none'
      && preStyle?.visibility !== 'hidden'
      && Number.parseFloat(preStyle?.opacity || '1') > 0.01,
    )
    const diffsText = diffs?.shadowRoot?.textContent ?? ''
    const diffsGeometry = diffs?.shadowRoot
      ? (() => {
          const finalPre = diffs.shadowRoot.querySelector('pre')
          if (!(finalPre instanceof HTMLElement))
            return null
          const code = finalPre.querySelector(':scope > code')
          const codeStyle = code ? getComputedStyle(code) : null
          const preStyle = getComputedStyle(finalPre)
          const gutters = Array.from(finalPre.querySelectorAll(':scope > code > [data-gutter]'))
          return Array.from(finalPre.querySelectorAll(':scope > code > [data-content]')).map((content, index) => {
            const changedLine = content.querySelector('[data-line-type="change-addition"], [data-line-type="change-deletion"]')
            const gutter = gutters[index]
            const gutterRect = gutter instanceof HTMLElement ? gutter.getBoundingClientRect() : null
            const codeText = changedLine?.querySelector(':scope > span')
            return {
              paneOffset: gutterRect ? round(gutterRect.left - finalPre.getBoundingClientRect().left) : null,
              codeOffset: gutterRect && codeText instanceof HTMLElement ? round(codeText.getBoundingClientRect().left - gutterRect.left) : null,
              rowHeight: changedLine instanceof HTMLElement ? round(changedLine.getBoundingClientRect().height) : null,
              grid: codeStyle
                ? {
                    display: codeStyle.display,
                    gridTemplateColumns: codeStyle.gridTemplateColumns,
                    columnGap: codeStyle.columnGap,
                    preDisplay: preStyle.display,
                    preGridTemplateColumns: preStyle.gridTemplateColumns,
                    preColumnGap: preStyle.columnGap,
                    contentMarginLeft: getComputedStyle(content).marginLeft,
                  }
                : null,
            }
          })
        })()
      : null
    const blockRect = block.getBoundingClientRect()
    return {
      exists: true,
      preVisible,
      preCollapsedSections: pre?.querySelectorAll('.markstream-pre__diff-line--collapsed').length ?? 0,
      preWhiteSpace: preStyle?.whiteSpace ?? null,
      diffsCount: block.querySelectorAll('diffs-container').length,
      diffsText,
      preGeometry,
      diffsGeometry,
      codeBlockState: block.dataset.markstreamCodeBlockState,
      enhanced: block.dataset.markstreamEnhanced === 'true',
      height: Math.round(blockRect.height * 100) / 100,
      top: Math.round(blockRect.top * 100) / 100,
      preBox: pre instanceof HTMLElement
        ? {
            height: Math.round(pre.getBoundingClientRect().height * 100) / 100,
            styleHeight: pre.style.height,
            styleMinHeight: pre.style.minHeight,
            styleMaxHeight: pre.style.maxHeight,
          }
        : null,
      editorBox: editor instanceof HTMLElement
        ? {
            height: Math.round(editor.getBoundingClientRect().height * 100) / 100,
            styleHeight: editor.style.height,
            styleMinHeight: editor.style.minHeight,
            styleMaxHeight: editor.style.maxHeight,
          }
        : null,
      contentBox: content instanceof HTMLElement
        ? {
            height: Math.round(content.getBoundingClientRect().height * 100) / 100,
            styleHeight: content.style.height,
            styleMinHeight: content.style.minHeight,
            styleMaxHeight: content.style.maxHeight,
          }
        : null,
      diffsBox: diffs instanceof HTMLElement
        ? {
            height: Math.round(diffs.getBoundingClientRect().height * 100) / 100,
            styleHeight: diffs.style.height,
          }
        : null,
      diffsWrap: diffs?.shadowRoot
        ? (() => {
            const finalPre = diffs.shadowRoot.querySelector('pre')
            if (!(finalPre instanceof HTMLElement))
              return null
            const style = getComputedStyle(finalPre)
            return {
              whiteSpace: style.whiteSpace,
              overflowX: style.overflowX,
            }
          })()
        : null,
    }
  })
}

function compareHandoffGeometry(preGeometry, diffsGeometry) {
  if (!Array.isArray(preGeometry) || !Array.isArray(diffsGeometry) || preGeometry.length !== diffsGeometry.length || preGeometry.length === 0)
    return { ok: false, reason: 'missing pane geometry' }

  const panes = preGeometry.map((prePane, index) => {
    const diffsPane = diffsGeometry[index]
    return {
      paneOffsetDelta: prePane.paneOffset == null || diffsPane.paneOffset == null
        ? null
        : Math.abs(prePane.paneOffset - diffsPane.paneOffset),
      codeOffsetDelta: prePane.codeOffset == null || diffsPane.codeOffset == null
        ? null
        : Math.abs(prePane.codeOffset - diffsPane.codeOffset),
      rowHeightDelta: prePane.rowHeight == null || diffsPane.rowHeight == null
        ? null
        : Math.abs(prePane.rowHeight - diffsPane.rowHeight),
    }
  })
  return {
    ok: panes.every(pane => pane.paneOffsetDelta != null && pane.paneOffsetDelta <= 2 && pane.codeOffsetDelta != null && pane.codeOffsetDelta <= 2 && pane.rowHeightDelta != null && pane.rowHeightDelta <= 1),
    panes,
  }
}

async function verifyFinalCollapseCycle(page) {
  return page.evaluate(async () => {
    const block = Array.from(document.querySelectorAll('.preview-surface .code-block-container'))
      .find(element => element.classList.contains('is-diff'))
    if (!(block instanceof HTMLElement))
      return { ok: false, reason: 'diff block is missing' }

    const button = block.querySelector('button[aria-pressed]')
    const content = block.querySelector('.code-block-shell-content')
    if (!(button instanceof HTMLButtonElement) || !(content instanceof HTMLElement))
      return { ok: false, reason: 'collapse controls are missing' }

    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))
    const snapshot = () => ({
      blockHeight: Math.round(block.getBoundingClientRect().height * 100) / 100,
      contentHeight: Math.round(content.getBoundingClientRect().height * 100) / 100,
      collapsed: button.getAttribute('aria-pressed') === 'true',
      preVisible: (() => {
        const pre = block.querySelector('pre.code-pre-fallback')
        if (!(pre instanceof HTMLElement))
          return false
        const rect = pre.getBoundingClientRect()
        const style = getComputedStyle(pre)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      })(),
      diffsCount: block.querySelectorAll('diffs-container').length,
    })
    const captureFrames = async () => {
      const frames = []
      for (let index = 0; index < 6; index++) {
        await frame()
        frames.push(snapshot())
      }
      return frames
    }

    const initial = snapshot()
    button.click()
    const collapsedFrames = await captureFrames()
    const collapsed = collapsedFrames.at(-1)
    button.click()
    const restoredFrames = await captureFrames()
    const restored = restoredFrames.at(-1)
    const allFrames = [...collapsedFrames, ...restoredFrames]
    const sameSurface = allFrames.every(state => !state.preVisible && state.diffsCount === 1)
    const heightRestored = initial && restored
      ? Math.abs(restored.contentHeight - initial.contentHeight) <= 2
      && Math.abs(restored.blockHeight - initial.blockHeight) <= 2
      : false
    const collapsedReduced = initial && collapsed
      ? collapsed.collapsed
      && collapsed.contentHeight < initial.contentHeight
      && collapsed.blockHeight < initial.blockHeight
      : false

    return {
      ok: sameSurface && collapsedReduced && heightRestored && restored?.collapsed === false,
      initial,
      collapsed,
      restored,
      sameSurface,
      collapsedReduced,
      heightRestored,
    }
  })
}

async function runCase(browser, port, layout, renderMode) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://${host}:${port}`,
        localStorage: [
          { name: 'vmr-test-render-mode', value: renderMode },
          { name: 'vmr-test-code-stream', value: 'true' },
          { name: 'vmr-test-stream-chunk-size-min', value: '1' },
          { name: 'vmr-test-stream-chunk-size-max', value: '1' },
          { name: 'vmr-test-stream-delay-min', value: '4' },
          { name: 'vmr-test-stream-delay-max', value: '4' },
          { name: 'vmr-test-stream-burstiness', value: '0' },
          { name: 'vmr-test-stream-slice-mode', value: 'pure-random' },
          { name: 'vmr-test-stream-transport-mode', value: 'scheduler' },
          { name: 'vmr-test-diff-layout-mode', value: layout },
        ],
      }],
    },
  })

  try {
    const page = await context.newPage()
    await page.goto(`http://${host}:${port}/test?diffLayout=${layout}`, { waitUntil: 'load' })
    await page.waitForSelector('.editor-textarea')
    await page.evaluate((sample) => {
      const textarea = document.querySelector('.editor-textarea')
      textarea.value = sample
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }, diffSample)
    await page.getByRole('button', { name: '开始流式渲染' }).click()
    await page.waitForSelector('.preview-surface .code-block-container.is-diff')
    await page.evaluate(() => document.querySelector('.preview-surface .code-block-container.is-diff')?.scrollIntoView({ block: 'center' }))

    const states = []
    const startedAt = Date.now()
    let finalFrameCount = 0
    while (Date.now() - startedAt < 20000) {
      await page.waitForTimeout(16)
      const state = await readState(page)
      states.push(state)
      if (state.diffsCount === 1 && !state.preVisible)
        finalFrameCount++
      else
        finalFrameCount = 0
      if (finalFrameCount >= 12)
        break
    }

    const visibleStates = states.filter(state => state.exists)
    const streamingStates = visibleStates.filter(state => state.codeBlockState === 'streaming')
    const stateKinds = visibleStates.map((state) => {
      // Diffs is mounted into the hidden host before the visible `<pre>` is
      // removed. That is still the pre state from the user's perspective.
      if (state.preVisible)
        return 'pre'
      if (!state.preVisible && state.diffsCount === 1)
        return 'diffs'
      return 'invalid'
    })
    const firstPre = stateKinds.indexOf('pre')
    const firstDiffs = stateKinds.indexOf('diffs')
    const lastPre = [...visibleStates].reverse().find(state => state.preVisible)
    const streamingHeightDrops = streamingStates
      .slice(1)
      .map((state, index) => ({ previous: streamingStates[index], current: state }))
      .filter(({ previous, current }) => current.height + 1 < previous.height)
    const unexpectedStreamingHeightDrops = streamingHeightDrops.filter(({ previous, current }) =>
      current.preCollapsedSections <= previous.preCollapsedSections,
    )
    const transitionStates = firstPre === -1
      ? stateKinds
      : stateKinds.slice(firstPre)
    const handoffGeometry = compareHandoffGeometry(lastPre?.preGeometry, visibleStates.at(-1)?.diffsGeometry)
    const result = {
      layout,
      renderMode,
      sampledFrames: visibleStates.length,
      preFrames: stateKinds.filter(kind => kind === 'pre').length,
      preWithDiffsFrames: visibleStates.filter(state => state.preVisible && state.diffsCount === 1).length,
      diffsFrames: stateKinds.filter(kind => kind === 'diffs').length,
      invalidFrames: transitionStates.filter(kind => kind === 'invalid').length,
      invalidStates: transitionStates
        .map((kind, index) => ({ kind, state: visibleStates[firstPre + index] }))
        .filter(entry => entry.kind === 'invalid'),
      latePreFrames: firstDiffs === -1 ? 0 : stateKinds.slice(firstDiffs).filter(kind => kind === 'pre').length,
      streamingDiffsFrames: visibleStates.filter(state => state.codeBlockState === 'streaming' && !state.preVisible && state.diffsCount === 1).length,
      streamingHeightDrops: streamingHeightDrops.length,
      streamingHeightDropSamples: streamingHeightDrops,
      unexpectedStreamingHeightDrops: unexpectedStreamingHeightDrops.length,
      unexpectedStreamingHeightDropSamples: unexpectedStreamingHeightDrops,
      handoffHeightDelta: lastPre ? Math.abs(lastPre.height - (visibleStates.at(-1)?.height ?? lastPre.height)) : null,
      handoffGeometry,
      lastPre,
      final: visibleStates.at(-1) ?? null,
      timeline: process.env.E2E_TRACE === '1'
        ? visibleStates.map(({ codeBlockState, preVisible, diffsCount, height }) => ({
            codeBlockState,
            preVisible,
            diffsCount,
            height,
          }))
        : undefined,
    }
    result.collapseCycle = await verifyFinalCollapseCycle(page)
    const finalText = result.final?.diffsText ?? ''
    const ok = result.sampledFrames >= 12
      && result.preFrames > 0
      && result.diffsFrames >= 12
      && result.invalidFrames === 0
      && result.latePreFrames === 0
      && result.unexpectedStreamingHeightDrops === 0
      && (result.handoffHeightDelta == null || result.handoffHeightDelta <= 2)
      && result.handoffGeometry.ok
      && result.collapseCycle.ok
      && result.final?.enhanced === true
      && result.lastPre?.preWhiteSpace === 'pre'
      && result.final?.diffsWrap?.whiteSpace === 'pre'
      && finalText.includes('0.0.49')
      && finalText.includes('0.0.54-beta.1')
      && visibleStates.every(state => state.diffsCount !== 1 || state.codeBlockState !== 'streaming' || state.preVisible)

    return { ok, ...result }
  }
  finally {
    await context.close()
  }
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)
  try {
    await waitForPort(port)
    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const results = []
    for (const renderMode of renderModes) {
      for (const layout of layouts)
        results.push(await runCase(browser, port, layout, renderMode))
    }
    await browser.close()

    const ok = results.every(result => result.ok)
    console.log(JSON.stringify({ ok, results }, null, 2))
    if (!ok)
      process.exitCode = 1
  }
  catch (error) {
    console.error(server.getLogs())
    console.error(error)
    process.exitCode = 1
  }
  finally {
    killProcessTree(server.child)
  }
}

main()
