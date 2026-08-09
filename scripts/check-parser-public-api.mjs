#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const dtsPath = join(root, 'packages', 'markdown-parser', 'dist', 'index.d.ts')
const snapshotPath = join(root, 'packages', 'markdown-parser', 'test', 'public-api.snapshot.txt')
const shouldUpdate = process.argv.includes('--update')
const shouldPrint = process.argv.includes('--print')
const loose = process.argv.includes('--loose')

if (!existsSync(dtsPath))
  fail(`Missing ${relative(root, dtsPath)}. Run pnpm build:parser first.`)

const compilerOptions = {
  lib: ['lib.es2020.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: false,
  strict: true,
  target: ts.ScriptTarget.ES2020,
  types: [],
}
const exports = collectPublicApiExports(dtsPath, compilerOptions)
const nextSnapshot = `${exports.map(item => item.line).join('\n')}\n`

if (shouldPrint) {
  process.stdout.write(nextSnapshot)
  process.exit(0)
}

if (shouldUpdate) {
  writeFileSync(snapshotPath, nextSnapshot, 'utf8')
  console.log(`[parser-public-api] Updated ${relative(root, snapshotPath)}`)
  process.exit(0)
}

if (!existsSync(snapshotPath))
  fail(`Missing ${relative(root, snapshotPath)}. Run pnpm test:api:parser:update to create it.`)

const currentSnapshot = normalizeSnapshot(readFileSync(snapshotPath, 'utf8'))
const snapshotMatches = currentSnapshot === nextSnapshot
if (!snapshotMatches) {
  const diff = formatSnapshotDiff(currentSnapshot, nextSnapshot)
  if (!loose)
    fail(diff)
  console.warn(diff)
  console.warn('[parser-public-api] Export drift is allowed because --loose was set.')
}

if (snapshotMatches)
  console.log(`[parser-public-api] ${exports.length} exports match ${relative(root, snapshotPath)}.`)

function collectPublicApiExports(entryPath, options) {
  const host = ts.createCompilerHost(options, true)
  const program = ts.createProgram([entryPath], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)

  if (diagnostics.length) {
    const formatHost = {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }
    fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
  }

  const sourceFile = program.getSourceFile(entryPath)
  if (!sourceFile)
    fail(`Unable to read ${relative(root, entryPath)}`)

  const checker = program.getTypeChecker()
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!moduleSymbol)
    fail(`Unable to resolve exports for ${relative(root, entryPath)}`)

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
      const kinds = []
      if (resolved.flags & ts.SymbolFlags.Value)
        kinds.push('value')
      if (resolved.flags & ts.SymbolFlags.Type)
        kinds.push('type')
      if (resolved.flags & ts.SymbolFlags.Namespace)
        kinds.push('namespace')
      const name = symbol.getName()
      const kind = kinds.join('+') || 'unknown'
      return { line: `${name} [${kind}]` }
    })
    .sort((left, right) => left.line.localeCompare(right.line))
}

function normalizeSnapshot(snapshot) {
  return `${snapshot.replace(/\r\n/g, '\n').trimEnd()}\n`
}

function formatSnapshotDiff(currentSnapshot, nextSnapshot) {
  const currentLines = new Set(currentSnapshot.trim().split('\n').filter(Boolean))
  const nextLines = new Set(nextSnapshot.trim().split('\n').filter(Boolean))
  const added = [...nextLines].filter(line => !currentLines.has(line)).sort()
  const removed = [...currentLines].filter(line => !nextLines.has(line)).sort()
  const sections = ['[parser-public-api] Export snapshot changed. Run pnpm test:api:parser:update to accept an intentional change.']

  if (added.length)
    sections.push(`\nAdded:\n${added.map(line => `+ ${line}`).join('\n')}`)
  if (removed.length)
    sections.push(`\nRemoved:\n${removed.map(line => `- ${line}`).join('\n')}`)
  return sections.join('\n')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
