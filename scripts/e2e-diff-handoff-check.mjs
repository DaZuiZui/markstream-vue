#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'
const scenarios = ['ordinary', 'unified', 'split']
const expectedCopyText = {
  ordinary: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'after-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].concat('').join('\n'),
  unified: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'after-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].join('\n'),
  split: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'after-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].join('\n'),
}
const classicScrollbarMode = process.argv.includes('--classic-scrollbar')

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

async function findFreePort() {
  for (let port = 4420; port <= 4460; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error('No free port found in 4420-4460')
}

async function waitForPort(port) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 60000) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
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

function stopDevServer(child) {
  if (!child || child.killed)
    return
  try {
    if (child.pid && process.platform !== 'win32')
      process.kill(-child.pid, 'SIGTERM')
    else
      child.kill('SIGTERM')
  }
  catch {}
}

function resolveChromeLaunchOptions(headless = true) {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const executablePath = candidates.find(candidate => existsSync(candidate))
  return executablePath ? { executablePath, headless } : { channel: 'chrome', headless }
}

async function measureClassicScrollbar(browser) {
  const page = await browser.newPage()
  try {
    await page.setContent(`
      <style>
        #scrollbar-control {
          width: 200px;
          height: 40px;
          overflow: auto;
          scrollbar-width: auto;
        }
        #scrollbar-control::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        #scrollbar-content {
          width: 400px;
          height: 20px;
        }
      </style>
      <div id="scrollbar-control"><div id="scrollbar-content"></div></div>
    `)
    return await page.locator('#scrollbar-control').evaluate(element => ({
      clientHeight: element.clientHeight,
      offsetHeight: element.offsetHeight,
      scrollbarLayoutHeight: element.offsetHeight - element.clientHeight,
    }))
  }
  finally {
    await page.close()
  }
}

async function installFrameCapture(page) {
  await page.addInitScript(() => {
    const scenarioIds = ['ordinary', 'unified', 'split']
    const round = value => Math.round(value * 100) / 100
    const normalizeRow = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '')
    const rowsForPre = (pre) => {
      const panes = Array.from(pre.querySelectorAll('.markstream-pre__diff-pane'))
      if (panes.length) {
        return panes.map(pane => (
          Array.from(pane.querySelectorAll('.markstream-pre__diff-content-inner'))
            .filter(row => getComputedStyle(row).visibility !== 'hidden')
            .map(row => normalizeRow(row.textContent))
        ))
      }

      const logicalLines = Array.from(pre.querySelectorAll('.markstream-pre__logical-line'))
      if (logicalLines.length)
        return [logicalLines.map(row => normalizeRow(row.textContent))]

      const code = pre.querySelector('.markstream-pre__code')
      return [String(code?.textContent ?? '').replace(/\r\n?/g, '\n').split('\n').map(normalizeRow)]
    }
    const rowsForRuntime = diffs => Array.from(diffs.shadowRoot?.querySelectorAll('pre > code') ?? []).map((pane) => {
      const content = pane.querySelector('[data-content]')
      return Array.from(content?.children ?? [])
        .filter(row => (row.hasAttribute('data-line') || row.hasAttribute('data-no-newline')) && getComputedStyle(row).visibility !== 'hidden')
        .map(row => normalizeRow(row.textContent))
    })
    const captureWrapFill = (pre, kind) => {
      const row = pre?.querySelector(`.markstream-pre__diff-line--${kind}`)
      if (!(row instanceof HTMLElement))
        return null
      const rowHeight = row.getBoundingClientRect().height
      const lineHeight = Number.parseFloat(getComputedStyle(row).lineHeight || '0')
      const fillHeight = Number.parseFloat(getComputedStyle(row, '::before').height || '0')
      const railHeight = row.querySelector('.markstream-pre__diff-rail')?.getBoundingClientRect().height ?? 0
      const numberHeight = row.querySelector('.markstream-pre__diff-number')?.getBoundingClientRect().height ?? 0
      return {
        fillHeight: round(fillHeight),
        lineHeight: round(lineHeight),
        numberHeight: round(numberHeight),
        railHeight: round(railHeight),
        rowHeight: round(rowHeight),
      }
    }
    const captureStyles = elements => Array.from(elements).map((element) => {
      const style = getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        height: round(element.getBoundingClientRect().height),
      }
    })
    const captureSurface = (scenario, path) => {
      const block = document.querySelector(`[data-handoff-case="${scenario}-${path}"] .code-block-container`)
      if (!(block instanceof HTMLElement))
        return null

      const pre = block.querySelector('pre.code-pre-fallback')
      const diffs = block.querySelector('diffs-container')
      const preVisible = pre instanceof HTMLElement
        && pre.getBoundingClientRect().height > 0
        && getComputedStyle(pre).display !== 'none'
      const runtimeReady = diffs instanceof HTMLElement
        && Boolean(diffs.shadowRoot?.querySelector('[data-line]'))
      const preStyle = pre instanceof HTMLElement ? getComputedStyle(pre) : null
      const header = block.querySelector('.code-block-header')
      const headerStyle = header instanceof HTMLElement ? getComputedStyle(header) : null
      const runtimeSurface = runtimeReady
        ? diffs.shadowRoot?.querySelector('[data-diff], [data-file]')
        : null
      const scrollbarLayoutHeight = pre instanceof HTMLElement && preStyle
        ? round(pre.offsetHeight - pre.clientHeight
          - Number.parseFloat(preStyle.borderTopWidth || '0')
          - Number.parseFloat(preStyle.borderBottomWidth || '0'))
        : null

      return {
        height: round(block.getBoundingClientRect().height),
        headerBackground: headerStyle?.backgroundColor ?? null,
        headerToken: headerStyle?.getPropertyValue('--code-header-bg').trim() ?? null,
        shellBackground: getComputedStyle(block).backgroundColor,
        preVisible,
        preClientWidth: pre instanceof HTMLElement ? pre.clientWidth : null,
        preCollapsedRows: pre?.querySelectorAll('.markstream-pre__diff-line--collapsed').length ?? 0,
        preScrollWidth: pre instanceof HTMLElement ? pre.scrollWidth : null,
        preScrollbarLayoutHeight: scrollbarLayoutHeight,
        preScrollbarWidth: preStyle?.scrollbarWidth ?? null,
        preBackground: preStyle?.backgroundColor ?? null,
        preRows: pre instanceof HTMLElement ? rowsForPre(pre) : null,
        preMetadataRows: pre instanceof HTMLElement
          ? Array.from(pre.querySelectorAll('.markstream-pre__diff-line--metadata')).map(row => normalizeRow(row.textContent))
          : null,
        preMetadataStyles: pre instanceof HTMLElement
          ? captureStyles(pre.querySelectorAll('.markstream-pre__diff-line--metadata'))
          : null,
        preText: pre?.textContent ?? '',
        preWrapFill: pre instanceof HTMLElement
          ? {
              added: captureWrapFill(pre, 'added'),
              removed: captureWrapFill(pre, 'removed'),
            }
          : null,
        runtimeReady,
        runtimeBackground: runtimeSurface instanceof HTMLElement
          ? getComputedStyle(runtimeSurface).backgroundColor
          : null,
        runtimeMetadataRows: runtimeReady
          ? Array.from(diffs.shadowRoot?.querySelectorAll('[data-no-newline]') ?? []).map(row => normalizeRow(row.textContent))
          : null,
        runtimeMetadataStyles: runtimeReady
          ? captureStyles(diffs.shadowRoot?.querySelectorAll('[data-no-newline]') ?? [])
          : null,
        runtimeRows: runtimeReady ? rowsForRuntime(diffs) : null,
        runtimeText: runtimeReady ? diffs.shadowRoot?.textContent ?? '' : '',
      }
    }
    const capture = () => {
      const frame = {
        overflow: document.querySelector('.handoff-check')?.getAttribute('data-handoff-overflow') ?? null,
      }
      for (const scenario of scenarioIds) {
        frame[scenario] = {
          enhanced: captureSurface(scenario, 'enhanced'),
          pre: captureSurface(scenario, 'pre'),
        }
      }
      window.__markstreamDiffHandoffFrames.push(frame)
      requestAnimationFrame(capture)
    }

    window.__markstreamDiffHandoffFrames = []
    window.__captureMarkstreamDiffHandoff = capture
    requestAnimationFrame(capture)
  })
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function uniqueValues(values) {
  return [...new Set(values.map(value => JSON.stringify(value)))].map(value => JSON.parse(value))
}

function changedRowsHaveModeHeight(surface, scenario, overflow) {
  if (scenario === 'ordinary')
    return true

  return ['removed', 'added'].every((kind) => {
    const fill = surface?.preWrapFill?.[kind]
    if (!fill)
      return false
    if (overflow === 'scroll') {
      return Math.abs(fill.rowHeight - fill.lineHeight) <= 1
        && Math.abs(fill.fillHeight - fill.rowHeight) <= 1
        && Math.abs(fill.railHeight - fill.rowHeight) <= 1
        && Math.abs(fill.numberHeight - fill.rowHeight) <= 1
    }
    return fill.rowHeight > fill.lineHeight + 1
      && Math.abs(fill.fillHeight - fill.rowHeight) <= 1
      && Math.abs(fill.railHeight - fill.rowHeight) <= 1
      && Math.abs(fill.numberHeight - fill.rowHeight) <= 1
  })
}

function metadataMatchesRuntime(surface, runtime, scenario) {
  const expectedRows = scenario === 'ordinary' ? 0 : 2
  return surface?.preMetadataRows?.length === expectedRows
    && runtime?.runtimeMetadataRows?.length === expectedRows
    && sameValue(surface.preMetadataRows, runtime.runtimeMetadataRows)
    && sameValue(surface.preMetadataStyles, runtime.runtimeMetadataStyles)
    && (scenario === 'ordinary' || surface.preMetadataRows.every(row => row === 'No newline at end of file'))
}

function surfaceHasPalette(surface, expectedBackground) {
  return surface?.shellBackground === expectedBackground
    && (!surface.preVisible || surface.preBackground === expectedBackground)
    && (!surface.runtimeReady || surface.runtimeBackground === expectedBackground)
}

function surfaceHasHeaderPalette(surface, reference) {
  return surface?.headerBackground === reference?.headerBackground
    && surface?.headerToken === reference?.headerToken
}

async function runCase(browser, port, overflow, theme) {
  const context = await browser.newContext({ viewport: { width: 1800, height: 2200 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://${host}:${port}` })
  const page = await context.newPage()
  await installFrameCapture(page)
  const url = `http://${host}:${port}/diff-handoff-check?theme=${theme}&codeOverflow=${overflow}`
  const expectedBackground = theme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)'

  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(scenarioIds => scenarioIds.every(scenario => (
      document.querySelector(`[data-handoff-case="${scenario}-enhanced"] diffs-container`)
        ?.shadowRoot
        ?.querySelector('[data-line]')
    )), scenarios)

    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction((scenarioIds) => {
      const frames = window.__markstreamDiffHandoffFrames ?? []
      return scenarioIds.every(scenario => (
        frames.filter(frame => frame[scenario]?.enhanced?.runtimeReady && !frame[scenario]?.enhanced?.preVisible).length >= 12
      ))
    }, scenarios)

    const frames = await page.evaluate(() => window.__markstreamDiffHandoffFrames ?? [])
    const permanentPreScrollability = await page.evaluate((scenarioIds) => {
      return Object.fromEntries(scenarioIds.map((scenario) => {
        const pre = document.querySelector(`[data-handoff-case="${scenario}-pre"] pre.code-pre-fallback`)
        if (!(pre instanceof HTMLElement))
          return [scenario, false]
        pre.scrollLeft = 100
        const scrollable = pre.scrollWidth > pre.clientWidth && pre.scrollLeft > 0
        pre.scrollLeft = 0
        return [scenario, scrollable]
      }))
    }, scenarios)
    const headerReference = [...frames].reverse().map(frame => frame.ordinary?.pre).find(frame => frame?.preVisible)
    const results = scenarios.map((scenario) => {
      const samples = frames.map(frame => frame[scenario]?.enhanced).filter(Boolean)
      const preFrames = samples.filter(frame => frame.preVisible)
      const finalFrames = samples.filter(frame => frame.runtimeReady && !frame.preVisible)
      const lastPre = preFrames.at(-1)
      const final = finalFrames.at(-1)
      const permanentPreFrames = frames.map(frame => frame[scenario]?.pre).filter(frame => frame?.preVisible)
      const permanentPre = permanentPreFrames.at(-1)
      const transitionHeights = samples
        .filter(frame => frame.preVisible || frame.runtimeReady)
        .map(frame => frame.height)
      const heightDelta = lastPre && final ? Math.abs(lastPre.height - final.height) : null
      const permanentHeightDelta = permanentPre && final ? Math.abs(permanentPre.height - final.height) : null
      const heightRange = transitionHeights.length
        ? Math.max(...transitionHeights) - Math.min(...transitionHeights)
        : null
      const rowsMatch = preFrames.every(frame => sameValue(frame.preRows, final?.runtimeRows))
      const fallbackRowsMatch = permanentPreFrames.every(frame => sameValue(frame.preRows, final?.runtimeRows))
      const metadataFramesMatch = preFrames.every(frame => metadataMatchesRuntime(frame, final, scenario))
        && permanentPreFrames.every(frame => metadataMatchesRuntime(frame, final, scenario))
        && finalFrames.every(frame => sameValue(frame.runtimeMetadataRows, final?.runtimeMetadataRows)
          && sameValue(frame.runtimeMetadataStyles, final?.runtimeMetadataStyles))
      const metadataVisible = metadataFramesMatch
      const wrapFillComplete = preFrames.every(frame => changedRowsHaveModeHeight(frame, scenario, overflow))
        && permanentPreFrames.every(frame => changedRowsHaveModeHeight(frame, scenario, overflow))
      const backgroundFramesMatch = samples.every(frame => surfaceHasPalette(frame, expectedBackground))
        && permanentPreFrames.every(frame => surfaceHasPalette(frame, expectedBackground))
      const headerFramesMatch = samples.every(frame => surfaceHasHeaderPalette(frame, headerReference))
        && permanentPreFrames.every(frame => surfaceHasHeaderPalette(frame, headerReference))
      const noTransientFold = preFrames.every(frame => (
        frame.preCollapsedRows === 0 && !frame.preText.includes('Unmodified lines')
      ))
      const finalHasNoFold = !final?.runtimeText.includes('Unmodified lines')
      const classicScrollbarSafe = scenario !== 'unified' || overflow !== 'scroll' || (
        preFrames.every(frame => frame.preScrollbarWidth === 'none' && frame.preScrollbarLayoutHeight === 0)
        && permanentPre?.preScrollbarWidth === 'none'
        && permanentPre?.preScrollbarLayoutHeight === 0
        && permanentPreScrollability[scenario] === true
      )
      const ok = preFrames.length > 0
        && finalFrames.length >= 12
        && noTransientFold
        && finalHasNoFold
        && rowsMatch
        && fallbackRowsMatch
        && metadataFramesMatch
        && metadataVisible
        && wrapFillComplete
        && backgroundFramesMatch
        && headerFramesMatch
        && heightDelta != null
        && heightDelta <= 2
        && permanentHeightDelta != null
        && permanentHeightDelta <= 2
        && heightRange != null
        && heightRange <= 2
        && classicScrollbarSafe

      return {
        ok,
        scenario,
        preFrames: preFrames.length,
        finalFrames: finalFrames.length,
        noTransientFold,
        classicScrollbarSafe,
        rowsMatch,
        fallbackRowsMatch,
        metadataFramesMatch,
        metadataVisible,
        wrapFillComplete,
        backgroundFramesMatch,
        headerFramesMatch,
        headerBackground: headerReference?.headerBackground ?? null,
        headerToken: headerReference?.headerToken ?? null,
        preMetadataRows: lastPre?.preMetadataRows ?? null,
        runtimeMetadataRows: final?.runtimeMetadataRows ?? null,
        preMetadataStyles: lastPre?.preMetadataStyles ?? null,
        runtimeMetadataStyles: final?.runtimeMetadataStyles ?? null,
        preWrapFill: lastPre?.preWrapFill ?? null,
        permanentPreWrapFill: permanentPre?.preWrapFill ?? null,
        visibleRowsPerPane: lastPre?.preRows?.map(rows => rows.length) ?? null,
        lastPreHeight: lastPre?.height ?? null,
        finalHeight: final?.height ?? null,
        heightDelta,
        heightRange,
        permanentPreHeight: permanentPre?.height ?? null,
        permanentHeightDelta,
        preScrollbarLayoutHeight: lastPre?.preScrollbarLayoutHeight ?? null,
        preScrollbarWidth: lastPre?.preScrollbarWidth ?? null,
        permanentPreScrollable: permanentPreScrollability[scenario] ?? false,
        observedPreBackgrounds: uniqueValues(preFrames.concat(permanentPreFrames).map(frame => frame.preBackground)),
        observedRuntimeBackgrounds: uniqueValues(finalFrames.map(frame => frame.runtimeBackground)),
        observedShellBackgrounds: uniqueValues(samples.concat(permanentPreFrames).map(frame => frame.shellBackground)),
        observedHeaderBackgrounds: uniqueValues(samples.concat(permanentPreFrames).map(frame => frame.headerBackground)),
        observedHeaderTokens: uniqueValues(samples.concat(permanentPreFrames).map(frame => frame.headerToken)),
        observedMetadataStyles: uniqueValues(preFrames.concat(permanentPreFrames).map(frame => frame.preMetadataStyles)),
        ...(rowsMatch ? {} : { preRows: lastPre?.preRows, runtimeRows: final?.runtimeRows }),
        ...(fallbackRowsMatch ? {} : { permanentPreRows: permanentPre?.preRows }),
      }
    })

    const copyResults = []
    for (const scenario of scenarios) {
      const preCase = page.locator(`[data-handoff-case="${scenario}-pre"]`)
      await page.evaluate(() => window.getSelection()?.removeAllRanges())
      await preCase.locator('button.code-action-btn').click()
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-label') === 'Copied', `[data-handoff-case="${scenario}-pre"] button.code-action-btn`)
      const copyState = await preCase.evaluate(() => {
        return {
          rangeCount: window.getSelection()?.rangeCount ?? -1,
          selection: window.getSelection()?.toString() ?? '',
        }
      })
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
      const expected = expectedCopyText[scenario]
      copyResults.push({
        ok: clipboardText === expected && copyState.selection === '' && copyState.rangeCount === 0,
        scenario,
        clipboardMatches: clipboardText === expected,
        clipboardLength: clipboardText.length,
        expectedLength: expected.length,
        clipboardSuffix: clipboardText.slice(-12),
        selection: copyState.selection,
        selectionRangeCount: copyState.rangeCount,
      })
    }

    async function runInteraction(targetOverflow) {
      await page.evaluate(() => {
        window.__markstreamDiffHandoffFrames = []
      })
      await page.locator(`[data-overflow-toggle="${targetOverflow}"]`).click()
      await page.waitForFunction(expected => document.querySelector('.handoff-check')?.getAttribute('data-handoff-overflow') === expected, targetOverflow)
      await page.waitForFunction(({ scenarioIds, expectedOverflow }) => {
        const captured = (window.__markstreamDiffHandoffFrames ?? []).filter(frame => frame.overflow === expectedOverflow)
        return scenarioIds.every(scenario => (
          captured.filter(frame => frame[scenario]?.enhanced?.runtimeReady && !frame[scenario]?.enhanced?.preVisible).length >= 12
        ))
      }, { scenarioIds: scenarios, expectedOverflow: targetOverflow })
      const capturedFrames = await page.evaluate(expectedOverflow => (
        (window.__markstreamDiffHandoffFrames ?? []).filter(frame => frame.overflow === expectedOverflow)
      ), targetOverflow)
      const interactionResults = scenarios.map((scenario) => {
        const enhanced = capturedFrames.map(frame => frame[scenario]?.enhanced).filter(Boolean)
        const initialPre = enhanced.filter(frame => frame.preVisible)
        const finalFrames = enhanced.filter(frame => frame.runtimeReady && !frame.preVisible)
        const final = finalFrames.at(-1)
        const permanentPreFrames = capturedFrames.map(frame => frame[scenario]?.pre).filter(frame => frame?.preVisible)
        const permanentPre = permanentPreFrames.at(-1)
        const initialPreHeightsValid = initialPre.length > 0
          && initialPre.every(frame => changedRowsHaveModeHeight(frame, scenario, targetOverflow))
        const permanentPreHeightsValid = permanentPreFrames.length > 0
          && permanentPreFrames.every(frame => changedRowsHaveModeHeight(frame, scenario, targetOverflow))
        const metadataFramesMatch = initialPre.every(frame => metadataMatchesRuntime(frame, final, scenario))
          && permanentPreFrames.every(frame => metadataMatchesRuntime(frame, final, scenario))
          && finalFrames.every(frame => sameValue(frame.runtimeMetadataRows, final?.runtimeMetadataRows)
            && sameValue(frame.runtimeMetadataStyles, final?.runtimeMetadataStyles))
        const rowsMatch = initialPre.every(frame => sameValue(frame.preRows, final?.runtimeRows))
          && permanentPreFrames.every(frame => sameValue(frame.preRows, final?.runtimeRows))
        const backgroundFramesMatch = enhanced.every(frame => surfaceHasPalette(frame, expectedBackground))
          && permanentPreFrames.every(frame => surfaceHasPalette(frame, expectedBackground))
        const headerFramesMatch = enhanced.every(frame => surfaceHasHeaderPalette(frame, headerReference))
          && permanentPreFrames.every(frame => surfaceHasHeaderPalette(frame, headerReference))
        const initialShellHeightsValid = initialPre.every(frame => Math.abs(frame.height - final.height) <= 2)
        const permanentShellHeightsValid = permanentPreFrames.every(frame => Math.abs(frame.height - final.height) <= 2)
        const shellHeightDelta = permanentPre && final ? Math.abs(permanentPre.height - final.height) : null
        return {
          ok: initialPreHeightsValid
            && permanentPreHeightsValid
            && metadataFramesMatch
            && rowsMatch
            && backgroundFramesMatch
            && headerFramesMatch
            && initialShellHeightsValid
            && permanentShellHeightsValid,
          scenario,
          targetOverflow,
          initialPreFrames: initialPre.length,
          initialPreHeightsValid,
          permanentPreFrames: permanentPreFrames.length,
          permanentPreHeightsValid,
          metadataFramesMatch,
          rowsMatch,
          backgroundFramesMatch,
          headerFramesMatch,
          initialShellHeightsValid,
          permanentShellHeightsValid,
          shellHeightDelta,
          finalHeight: final?.height ?? null,
          permanentPreHeight: permanentPre?.height ?? null,
          permanentPreWrapFill: permanentPre?.preWrapFill ?? null,
        }
      })
      return {
        ok: interactionResults.every(result => result.ok),
        targetOverflow,
        sampledFrames: capturedFrames.length,
        results: interactionResults,
      }
    }

    const interactions = []
    if (!classicScrollbarMode) {
      interactions.push(await runInteraction('scroll'))
      interactions.push(await runInteraction('wrap'))
    }

    return {
      ok: results.every(result => result.ok)
        && copyResults.every(result => result.ok)
        && interactions.every(interaction => interaction.ok),
      overflow,
      theme,
      sampledFrames: frames.length,
      results,
      copyResults,
      interactions,
    }
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
    const browser = await chromium.launch(resolveChromeLaunchOptions(!classicScrollbarMode))
    const results = []
    let classicScrollbar = null
    try {
      if (classicScrollbarMode) {
        classicScrollbar = await measureClassicScrollbar(browser)
        if (classicScrollbar.scrollbarLayoutHeight < 10)
          throw new Error(`Classic scrollbar geometry was not active: ${JSON.stringify(classicScrollbar)}`)
      }
      for (const theme of classicScrollbarMode ? ['dark'] : ['dark', 'light'])
        results.push(await runCase(browser, port, classicScrollbarMode ? 'scroll' : 'wrap', theme))
    }
    finally {
      await browser.close()
    }

    const ok = results.every(result => result.ok)
    console.log(JSON.stringify({ ok, classicScrollbar, results }, null, 2))
    if (!ok)
      process.exitCode = 1
  }
  catch (error) {
    console.error(server.getLogs())
    console.error(error)
    process.exitCode = 1
  }
  finally {
    stopDevServer(server.child)
  }
}

main()
