#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const parserDir = join(root, 'packages', 'markdown-parser')
const temporaryDir = mkdtempSync(join(tmpdir(), 'stream-markdown-parser-pack-'))

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
    env: {
      ...process.env,
      CI: '1',
      npm_config_auto_install_peers: 'false',
    },
  })
}

function writeTemporaryFile(relativePath, contents) {
  const filePath = join(temporaryDir, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
}

function packParser() {
  const output = run('pnpm', ['pack', '--pack-destination', temporaryDir, '--json'], {
    cwd: parserDir,
    stdio: 'pipe',
  }).trim()
  const info = JSON.parse(output)
  const filename = Array.isArray(info) ? info[0]?.filename : info?.filename
  if (!filename)
    throw new Error('pnpm pack did not report a parser tarball')

  const tarball = [resolve(filename), resolve(temporaryDir, basename(filename))].find(existsSync)
  if (!tarball)
    throw new Error(`Packed parser tarball was not found: ${filename}`)
  return tarball
}

try {
  if (!existsSync(join(parserDir, 'dist', 'index.js')))
    throw new Error('Parser dist is missing. Run pnpm build:parser first.')

  const tarball = packParser()
  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  writeTemporaryFile('package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackage.packageManager,
    dependencies: {
      'stream-markdown-parser': `file:${tarball}`,
    },
  }, null, 2)}\n`)

  writeTemporaryFile('smoke.mjs', `import assert from 'node:assert/strict'\nimport { createRequire } from 'node:module'\n\nconst esm = await import('stream-markdown-parser')\nconst require = createRequire(import.meta.url)\nconst cjs = require('stream-markdown-parser')\n\nfor (const [format, parser] of [['ESM', esm], ['CJS', cjs]]) {\n  assert.equal(typeof parser.getMarkdown, 'function', \`\${format} getMarkdown export is missing\`)\n  assert.equal(typeof parser.parseMarkdownToStructure, 'function', \`\${format} parseMarkdownToStructure export is missing\`)\n}\n\nconst source = '# Packed parser\\n\\n- ESM\\n- CJS\\n'\nconst esmNodes = esm.parseMarkdownToStructure(source, esm.getMarkdown('packed-smoke'), { final: true, streamParse: false })\nconst cjsNodes = cjs.parseMarkdownToStructure(source, cjs.getMarkdown('packed-smoke'), { final: true, streamParse: false })\nassert.deepEqual(esmNodes, cjsNodes)\nconsole.log('[parser-packed-smoke] ESM and CJS imports produced matching nodes.')\n`)

  writeTemporaryFile('no-dom-consumer.ts', `import type { BaseNode, ParseOptions } from 'stream-markdown-parser'\nimport { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'\n\nconst options: ParseOptions = { final: true, streamParse: false }\nconst nodes: BaseNode[] = parseMarkdownToStructure('# no DOM', getMarkdown('no-dom'), options)\nvoid nodes\n`)
  writeTemporaryFile('tsconfig.json', `${JSON.stringify({
    compilerOptions: {
      lib: ['ES2020'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2020',
      types: [],
    },
    include: ['./no-dom-consumer.ts'],
  }, null, 2)}\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: temporaryDir })
  run(process.execPath, ['smoke.mjs'], { cwd: temporaryDir })
  run('pnpm', ['exec', 'tsc', '-p', join(temporaryDir, 'tsconfig.json')])
  console.log('[parser-packed-smoke] Packed ESM/CJS and no-DOM type smoke passed.')
}
finally {
  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(temporaryDir, { recursive: true, force: true })
  else
    console.log(`[parser-packed-smoke] Preserved ${temporaryDir}`)
}
