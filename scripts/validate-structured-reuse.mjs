#!/usr/bin/env node
/**
 * Validates structured top-level node reuse correctness:
 * streams every real corpus commit-by-commit through the reuse path and
 * compares the produced nodes with a cold full parse at every commit,
 * then validates the final (final:true) parse of the streamed document
 * against a cold final parse.
 *
 * The reuse path (processTopLevelTokensWithReuse) may only produce output
 * that is byte-identical to a cold parse. Any divergence fails the script.
 *
 * Usage: node scripts/validate-structured-reuse.mjs [corpusId]
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parserDistPath = path.join(repoRoot, 'packages/markdown-parser/dist/index.js')
const parser = await import(pathToFileURL(parserDistPath).href)
const { getMarkdown, parseMarkdownToStructure } = parser

const CORPORA = {
  'changelog': 'CHANGELOG.md',
  'readme-en': 'README.md',
  'readme-zh': 'README.zh-CN.md',
  'docs-performance': 'docs/guide/performance.md',
  'ai-chat-streaming': 'docs/guide/ai-chat-streaming.md',
  'parser-readme': 'packages/markdown-parser/README.md',
  'react-components': 'docs/guide/react-components.md',
}
const CHUNK_COUNT = 120

function stableSignature(value, seen = new Set()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (typeof value === 'string')
    return `s:${value}`
  if (typeof value === 'function')
    return 'fn'
  if (typeof value !== 'object')
    return typeof value
  if (seen.has(value))
    return 'cycle'
  seen.add(value)
  if (Array.isArray(value))
    return `a:${value.length}:${value.map(v => stableSignature(v, seen)).join(',')}`
  const keys = Object.keys(value).sort()
  return `o:${keys.map(key => `${key}=${stableSignature(value[key], seen)}`).join(';')}`
}

function nodesEqual(a, b) {
  return stableSignature(a) === stableSignature(b)
}

async function validate(corpusId, filePath) {
  const markdown = readFileSync(path.join(repoRoot, filePath), 'utf8')
  const chunkSize = Math.max(1, Math.ceil(markdown.length / CHUNK_COUNT))
  const md = getMarkdown(`validate-reuse-${corpusId}`)
  md.stream?.reset?.()
  // Same msgId so instance-derived ids inside html_block/fence content match.
  const coldMd = getMarkdown(`validate-reuse-${corpusId}`)

  let current = ''
  let reusedCount = 0
  let mismatches = 0

  for (let ci = 0; ci < CHUNK_COUNT; ci++) {
    current += markdown.slice(ci * chunkSize, (ci + 1) * chunkSize)
    const commitTiming = {}
    const nodes = parseMarkdownToStructure(current, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: commitTiming,
    })
    const cold = parseMarkdownToStructure(current, coldMd, { final: false, streamParse: false })
    if (!nodesEqual(nodes, cold)) {
      mismatches++
      if (mismatches <= 3)
        console.error(`MISMATCH ${corpusId} commit ${ci} chars ${current.length}`)
    }
    reusedCount += commitTiming.processTokensReusedTopLevelNodes ?? 0
  }

  // Final-commit validation: the renderer ends a streaming session with a
  // final:true parse on the same md instance (streamParse:true, same as
  // useMarkdownParsing). The final path is where regressions like trailing
  // mid-state marker stripping silently drop real characters, so compare it
  // against a cold final parse too.
  const finalTiming = {}
  const finalNodes = parseMarkdownToStructure(current, md, {
    final: true,
    streamParse: true,
    reuseStableTopLevelNodes: true,
    parserMetrics: finalTiming,
  })
  const finalCold = parseMarkdownToStructure(current, coldMd, { final: true, streamParse: false })
  let finalMismatches = 0
  if (!nodesEqual(finalNodes, finalCold)) {
    finalMismatches++
    console.error(`FINAL MISMATCH ${corpusId} chars ${current.length}`)
  }
  mismatches += finalMismatches

  console.log(JSON.stringify({
    corpusId,
    chars: markdown.length,
    mismatches,
    finalMismatches,
    reusedPrefixNodes: reusedCount,
    ok: mismatches === 0,
  }))
  return mismatches === 0
}

const only = process.argv[2]
const entries = only ? Object.entries(CORPORA).filter(([id]) => id === only) : Object.entries(CORPORA)

let allOk = true
for (const [id, filePath] of entries) {
  const ok = await validate(id, filePath)
  allOk = allOk && ok
}
console.log(allOk ? 'ALL CORPUS REUSE OUTPUTS MATCH COLD PARSE' : 'REUSE VALIDATION FAILED')
process.exit(allOk ? 0 : 1)
