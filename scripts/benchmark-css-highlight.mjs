#!/usr/bin/env node

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const microRoot = path.dirname(path.dirname(require.resolve('microlighter')))
const streamRoot = path.join(realpathSync(path.join(root, 'node_modules/stream-diffs')), 'dist')
const pierreRoot = path.join(realpathSync(path.join(root, 'node_modules/@pierre/diffs')), 'dist')
const microMainRoot = process.env.MICROLIGHTER_MAIN_DIST
  ? path.resolve(process.env.MICROLIGHTER_MAIN_DIST)
  : null
const output = process.env.MARKSTREAM_CSS_HIGHLIGHT_RESULTS || path.join(root, 'test/benchmark/css-highlight-results.json')
function parseMatrix(value, fallback) {
  return value
    ? value.split(',').map(Number).filter(item => Number.isInteger(item) && item > 0)
    : fallback
}
const lineCounts = parseMatrix(process.env.MARKSTREAM_CSS_HIGHLIGHT_LINES, [100, 1000, 10000])
const blockCounts = parseMatrix(process.env.MARKSTREAM_CSS_HIGHLIGHT_BLOCKS, [1, 12, 24])
const modes = ['plain-pre', 'css-highlight-local', 'microlighter-2.1.0', 'microlighter-main', 'stream-diffs-main-thread', 'stream-diffs-worker-pool']

function fixture(lines, blocks) {
  const source = Array.from({ length: lines }, (_, index) => `const value${index} = ${index}; // benchmark`).join('\n')
  return Array.from({ length: blocks }, (_, index) => `<pre><code data-language="typescript" id="code-${index}">${source}</code></pre>`).join('')
}

function localHighlightScript() {
  return `() => {
    if (!CSS.highlights || !window.Highlight || !window.StaticRange) return 0;
    const patterns = [
      ['comment', /\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\//g],
      ['string', /"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\x60(?:\\\\.|[^\\x60\\\\])*\\x60/g],
      ['keyword', /\\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\\b/g],
      ['type', /\\b(?:boolean|number|string|unknown|never|any|void|Promise|Array|Record|Date|Error|Map|Set)\\b/g],
      ['number', /\\b(?:0[xob][\\da-f]+|\\d+(?:\\.\\d+)?)\\b/gi],
      ['function', /\\b[A-Z_$][\\w$]*(?=\\s*\\()/gi],
    ];
    const hashComments = /#[^\\n]*/g;
    const rangesByCategory = new Map();
    let rangeCount = 0;
    for (const root of document.querySelectorAll('pre > code')) {
      const code = root.textContent || '';
      const textNodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) textNodes.push(text);
      if (!textNodes.length) continue;
      const language = (root.dataset.language || '').trim().toLowerCase();
      const tokens = [];
      const add = (regex, category) => {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(code))) {
          const start = match.index;
          const end = start + match[0].length;
          if (!tokens.some(token => token.start < end && start < token.end))
            tokens.push({ start, end, category });
          if (match[0].length === 0) regex.lastIndex++;
        }
      };
      add(patterns[0][1], patterns[0][0]);
      if (['python', 'py', 'shell', 'bash', 'sh', 'yaml', 'yml'].includes(language)) add(hashComments, 'comment');
      for (const [category, regex] of patterns.slice(1)) add(regex, category);
      const resolve = offset => {
        let remaining = offset;
        for (const node of textNodes) {
          if (remaining <= node.data.length) return { node, offset: remaining };
          remaining -= node.data.length;
        }
        return null;
      };
      for (const token of tokens) {
        const start = resolve(token.start);
        const end = resolve(token.end);
        if (!start || !end) continue;
        const ranges = rangesByCategory.get(token.category) || [];
        ranges.push(new StaticRange({ startContainer: start.node, startOffset: start.offset, endContainer: end.node, endOffset: end.offset }));
        rangesByCategory.set(token.category, ranges);
        rangeCount++;
      }
    }
    for (const [category, ranges] of rangesByCategory)
      CSS.highlights.set('benchmark-' + category, new Highlight(...ranges));
    return rangeCount;
  }`
}

function pageHtml(body) {
  return `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"@pierre/diffs":"/pierre/index.js"}}</script><style>body{font:14px monospace}pre{white-space:pre}</style>${body}`
}

function serve() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    if (pathname === '/fixture') {
      const url = new URL(request.url, 'http://127.0.0.1')
      response.setHeader('content-type', 'text/html')
      response.end(pageHtml(fixture(Number(url.searchParams.get('lines')), Number(url.searchParams.get('blocks')))))
      return
    }
    if (pathname.startsWith('/stream/')) {
      const file = path.join(streamRoot, pathname.slice('/stream/'.length))
      try {
        response.setHeader('content-type', 'text/javascript')
        response.end(readFileSync(file))
      }
      catch { response.writeHead(404).end() }
      return
    }
    if (pathname.startsWith('/pierre/')) {
      const file = path.join(pierreRoot, pathname.slice('/pierre/'.length))
      try {
        response.setHeader('content-type', 'text/javascript')
        response.end(readFileSync(file))
      }
      catch { response.writeHead(404).end() }
      return
    }
    if (pathname.startsWith('/micro/') || pathname.startsWith('/micro-main/')) {
      const useMain = pathname.startsWith('/micro-main/')
      const base = useMain ? microMainRoot : path.join(microRoot, 'dist')
      const prefix = useMain ? '/micro-main/' : '/micro/'
      const file = base && path.join(base, pathname.slice(prefix.length))
      try {
        if (!file)
          throw new Error('MicroLighter main build unavailable')
        response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        response.end(readFileSync(file))
      }
      catch { response.writeHead(404).end() }
      return
    }
    response.writeHead(404).end()
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  const server = await serve()
  const port = server.address().port
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const browserVersion = browser.version()
  const results = []
  try {
    for (const blocks of blockCounts) {
      for (const lines of lineCounts) {
        for (const mode of modes) {
          if (mode === 'stream-diffs-worker-pool') {
            results.push({ mode, blocks, lines, status: 'not-run', reason: 'Run this harness against the stream-diffs playground surface; the standalone fixture cannot construct its worker pool.' })
            continue
          }
          if (mode === 'microlighter-main' && !microMainRoot) {
            results.push({ mode, blocks, lines, status: 'not-run', reason: 'Set MICROLIGHTER_MAIN_DIST to a built dist directory from current upstream main.' })
            continue
          }
          const page = await browser.newPage()
          try {
            const url = `http://127.0.0.1:${port}/fixture?lines=${lines}&blocks=${blocks}`
            const started = Date.now()
            await page.goto(url)
            let ranges = 0
            if (mode === 'css-highlight-local') {
              ranges = await page.evaluate(`(${localHighlightScript()})()`)
            }
            else if (mode.startsWith('microlighter-')) {
              const prefix = mode === 'microlighter-main' ? 'micro-main' : 'micro'
              await page.evaluate(async (scriptUrl) => {
                const module = await import(scriptUrl)
                await module.highlightAll()
              }, `http://127.0.0.1:${port}/${prefix}/highlight.js`)
              ranges = await page.evaluate(() => [...(CSS.highlights?.values() ?? [])].reduce((total, highlight) => total + (highlight.size ?? 0), 0))
            }
            else if (mode === 'stream-diffs-main-thread') {
              await page.evaluate(async (scriptUrl) => {
                const { useMonaco } = await import(scriptUrl)
                const blocks = [...document.querySelectorAll('pre > code')]
                document.body.replaceChildren()
                await Promise.all(blocks.map(async (block) => {
                  const container = document.createElement('div')
                  document.body.appendChild(container)
                  const runtime = useMonaco({ stream: false })
                  await runtime.createEditor(container, block.textContent || '', 'typescript')
                }))
              }, `http://127.0.0.1:${port}/stream/markstream.mjs`)
            }
            const domNodes = await page.locator('body *').count()
            results.push({ mode, blocks, lines, durationMs: Date.now() - started, domNodes, ranges, status: 'measured' })
          }
          catch (error) {
            results.push({ mode, blocks, lines, status: 'unavailable', reason: String(error?.message || error) })
          }
          finally {
            await page.close()
          }
        }
      }
    }
  }
  finally {
    await browser.close()
    server.close()
  }
  const payload = {
    status: 'exploratory',
    generatedAt: new Date().toISOString(),
    environment: { browser: `Chrome ${browserVersion}`, cpu: cpus()[0]?.model || 'unknown', platform: process.platform },
    fixture: { blocks: blockCounts, lines: lineCounts },
    implementations: { 'css-highlight-local': 'same lexer categories and StaticRange strategy as src/components/CodeBlockNode/cssHighlightAdapter.ts', 'microlighter-2.1.0': 'npm package pinned in devDependencies', 'microlighter-main': microMainRoot || 'not supplied' },
    modes,
    results,
    caveat: 'Run with Chrome. stream-diffs rows are explicit not-run entries until the playground adapter is supplied; do not use this exploratory artifact as release evidence.',
  }
  await import('node:fs/promises').then(fs => fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`))
  console.log(`Wrote ${output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
