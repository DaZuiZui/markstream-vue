#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const checkerPath = join(root, 'scripts', 'check-parser-public-api.mjs')
const dtsPath = join(root, 'packages', 'markdown-parser', 'dist', 'index.d.ts')
const temporaryDir = mkdtempSync(join(tmpdir(), 'parser-public-api-gate-'))

function run(args) {
  return spawnSync(process.execPath, [checkerPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

try {
  const clean = run([])
  assert.equal(clean.status, 0, clean.stderr)

  const declaration = readFileSync(dtsPath, 'utf8')
  const originalSignature = 'declare function getMarkdown(msgId?: string, options?: GetMarkdownOptions): MarkdownIt;'
  const breakingSignature = 'declare function getMarkdown(msgId?: number, options?: GetMarkdownOptions): number;'
  assert.match(declaration, new RegExp(originalSignature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const mutatedPath = join(temporaryDir, 'index.d.ts')
  writeFileSync(mutatedPath, declaration.replace(originalSignature, breakingSignature))
  const mutation = run([`--dts=${mutatedPath}`])
  const diagnostic = `${mutation.stdout}\n${mutation.stderr}`
  assert.notEqual(mutation.status, 0, 'breaking getMarkdown signature unexpectedly passed the public API gate')
  assert.match(diagnostic, /DTS snapshot changed/)
  assert.match(diagnostic, /getMarkdown/)

  console.log('[parser-public-api-self-test] Breaking declaration signatures are rejected.')
}
finally {
  rmSync(temporaryDir, { recursive: true, force: true })
}
