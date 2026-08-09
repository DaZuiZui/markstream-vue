#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parserDistPath = path.resolve(repoRoot, readArg('--parser-dist') ?? process.env.MARKSTREAM_PARSER_PERF_PARSER_DIST ?? 'packages/markdown-parser/dist/index.js')
const parserPackagePath = path.resolve(path.dirname(parserDistPath), '..', 'package.json')
const packageJson = JSON.parse(readFileSync(
  existsSync(parserPackagePath) ? parserPackagePath : path.join(repoRoot, 'packages/markdown-parser/package.json'),
  'utf8',
))
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_PARSER_PERF_OUTPUT_DIR || '.tmp/parser-performance')
const outputPath = path.join(outputDir, 'latest.json')
const profile = readArg('--profile') ?? 'deep'
const rounds = readPositiveIntegerArg('--rounds', profile === 'deterministic' ? 1 : 7)
const warmups = readNonNegativeIntegerArg('--warmups', profile === 'deterministic' ? 0 : 2)
const injectProcessedTokenRegression = process.env.MARKSTREAM_PARSER_PERF_INJECT_PROCESSED_TOKEN_REGRESSION === '1'
const scaleFactors = [1, 2, 4]
const chunkSizes = [97, 211, 73, 149, 127, 181, 61, 233]

if (!['deep', 'deterministic'].includes(profile))
  throw new Error(`Unknown parser performance profile: ${profile}`)

const corpusDefinitions = [
  {
    id: 'prose-code-math',
    baseUnits: 8,
    createUnit(index) {
      return [
        `## Streaming answer ${index}`,
        '',
        `Paragraph ${index} keeps **strong text**, *emphasis*, \`inline code\`, 中文标点，以及 [link ${index}](https://example.com/${index}).`,
        '',
        `> Quoted explanation ${index} with inline math $x_${index} + y_${index}$.`,
        '',
        '```ts',
        `export const value${index} = { label: 'block-${index}', ready: true }`,
        '```',
        '',
        '$$',
        `\\sum_{i=0}^{${index + 2}} i`,
        '$$',
        '',
      ].join('\n')
    },
  },
  {
    id: 'headings-lists',
    baseUnits: 8,
    createUnit(index) {
      return [
        `### Structured result ${index}`,
        '',
        `- item ${index}.1 with ~~old~~ and ==new== text`,
        `- item ${index}.2`,
        `  - nested ${index}.2.a`,
        '',
        `1. ordered ${index}.1`,
        `2. ordered ${index}.2`,
        '',
        `Direct [entry ${index}](https://example.com/reference/${index}).`,
        '',
      ].join('\n')
    },
  },
]

function readArg(name) {
  const prefix = `${name}=`
  const equalsValue = process.argv.find(argument => argument.startsWith(prefix))
  if (equalsValue)
    return equalsValue.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readPositiveIntegerArg(name, fallback) {
  const raw = readArg(name)
  if (raw == null)
    return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`)
  return value
}

function readNonNegativeIntegerArg(name, fallback) {
  const raw = readArg(name)
  if (raw == null)
    return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`)
  return value
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))]
}

function createSource(definition, scale) {
  return Array.from(
    { length: definition.baseUnits * scale },
    (_, index) => definition.createUnit(index),
  ).join('')
}

function createChunks(source) {
  const chunks = []
  let offset = 0
  let planIndex = 0
  while (offset < source.length) {
    const size = chunkSizes[planIndex % chunkSizes.length]
    chunks.push(source.slice(offset, offset + size))
    offset += size
    planIndex++
  }
  return chunks
}

function forceGc() {
  if (typeof globalThis.gc !== 'function')
    return null
  globalThis.gc()
  globalThis.gc()
  return process.memoryUsage().heapUsed
}

function summarizeSamples(samples) {
  const metric = key => round(median(samples.map(sample => sample[key])))
  const retainedHeapSamples = samples
    .map(sample => sample.retainedHeapBytes)
    .filter(Number.isFinite)
  const first = samples[0]
  return {
    streamTotalMs: metric('streamTotalMs'),
    commitMedianMs: metric('commitMedianMs'),
    commitP95Ms: metric('commitP95Ms'),
    commitMaxMs: metric('commitMaxMs'),
    finalFlushMs: metric('finalFlushMs'),
    processedTokenCount: Math.round(median(samples.map(sample => sample.processedTokenCount))),
    reusedNodeCount: Math.round(median(samples.map(sample => sample.reusedNodeCount))),
    reuseRatio: round(median(samples.map(sample => sample.reuseRatio)), 6),
    retainedHeapBytes: retainedHeapSamples.length ? Math.round(median(retainedHeapSamples)) : null,
    outputNodeVisits: Math.round(median(samples.map(sample => sample.outputNodeVisits))),
    finalNodeCount: Math.round(median(samples.map(sample => sample.finalNodeCount))),
    streamStats: first.streamStats,
  }
}

async function runSample(parser, definition, scale, sampleIndex) {
  const { getMarkdown, parseMarkdownToStructure } = parser
  const source = createSource(definition, scale)
  const chunks = createChunks(source)
  forceGc()
  const beforeHeap = forceGc()
  const md = getMarkdown(`parser-perf-${definition.id}-${scale}-${sampleIndex}`)
  md.stream?.reset?.()
  md.stream?.resetStats?.()
  const commitDurations = []
  let current = ''
  let processedTokenCount = 0
  let reusedNodeCount = 0
  let outputNodeVisits = 0

  for (const chunk of chunks) {
    current += chunk
    const timing = {}
    const startedAt = performance.now()
    const nodes = parseMarkdownToStructure(current, md, {
      final: false,
      streamParse: true,
      __reuseStableTopLevelNodes: true,
      __timing: timing,
    })
    commitDurations.push(performance.now() - startedAt)
    processedTokenCount += Number(timing.processTokensInputTokens || 0)
    reusedNodeCount += Number(timing.processTokensReusedTopLevelNodes || 0)
    outputNodeVisits += nodes.length
  }

  const afterStreamHeap = forceGc()
  const finalTiming = {}
  const finalStartedAt = performance.now()
  const finalNodes = parseMarkdownToStructure(source, md, {
    final: true,
    streamParse: true,
    __reuseStableTopLevelNodes: true,
    __timing: finalTiming,
  })
  const finalFlushMs = performance.now() - finalStartedAt
  const streamStats = md.stream?.stats?.() ?? null
  md.stream?.reset?.()

  if (injectProcessedTokenRegression)
    processedTokenCount *= scale

  return {
    streamTotalMs: commitDurations.reduce((total, duration) => total + duration, 0),
    commitMedianMs: median(commitDurations),
    commitP95Ms: percentile(commitDurations, 0.95),
    commitMaxMs: Math.max(...commitDurations),
    finalFlushMs,
    processedTokenCount,
    reusedNodeCount,
    reuseRatio: outputNodeVisits ? reusedNodeCount / outputNodeVisits : 0,
    retainedHeapBytes: beforeHeap == null || afterStreamHeap == null
      ? null
      : Math.max(0, afterStreamHeap - beforeHeap),
    outputNodeVisits,
    finalNodeCount: finalNodes.length,
    streamStats,
  }
}

async function runScale(parser, definition, scale) {
  const source = createSource(definition, scale)
  const chunks = createChunks(source)
  const samples = []
  for (let sampleIndex = 0; sampleIndex < warmups + rounds; sampleIndex++) {
    const sample = await runSample(parser, definition, scale, sampleIndex)
    if (sampleIndex >= warmups)
      samples.push(sample)
  }

  return {
    scale,
    sourceChars: source.length,
    sourceBytes: Buffer.byteLength(source),
    sourceSha256: hash(source),
    chunkPlan: {
      id: 'fixed-size-cycle-v1',
      chunks: chunks.length,
      sizesSha256: hash(JSON.stringify(chunks.map(chunk => chunk.length))),
    },
    metrics: summarizeSamples(samples),
    samples: samples.map(sample => ({
      ...sample,
      streamTotalMs: round(sample.streamTotalMs),
      commitMedianMs: round(sample.commitMedianMs),
      commitP95Ms: round(sample.commitP95Ms),
      commitMaxMs: round(sample.commitMaxMs),
      finalFlushMs: round(sample.finalFlushMs),
      reuseRatio: round(sample.reuseRatio, 6),
    })),
  }
}

function environmentMetadata() {
  const cpus = os.cpus()
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    gcExposed: typeof globalThis.gc === 'function',
  }
}

const parser = await import(pathToFileURL(parserDistPath).href)
const cases = []
for (const definition of corpusDefinitions) {
  const scales = []
  for (const scale of scaleFactors) {
    console.log(`[parser-perf] case=${definition.id} scale=${scale}x profile=${profile}`)
    scales.push(await runScale(parser, definition, scale))
  }
  cases.push({ id: definition.id, scales })
}

const corpusManifest = corpusDefinitions.map(definition => ({
  id: definition.id,
  baseUnits: definition.baseUnits,
  sources: scaleFactors.map(scale => hash(createSource(definition, scale))),
}))
const report = {
  schemaVersion: 1,
  benchmarkVersion: 'parser-performance-v1',
  corpusVersion: `sha256:${hash(JSON.stringify(corpusManifest))}`,
  generatedAt: new Date().toISOString(),
  profile,
  environment: environmentMetadata(),
  parser: {
    package: packageJson.name,
    version: packageJson.version,
  },
  config: {
    rounds,
    warmups,
    scaleFactors,
    chunkPlan: {
      id: 'fixed-size-cycle-v1',
      sizes: chunkSizes,
    },
    injectedProcessedTokenRegression: injectProcessedTokenRegression,
  },
  cases,
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`[parser-perf] wrote ${path.relative(repoRoot, outputPath)}`)
