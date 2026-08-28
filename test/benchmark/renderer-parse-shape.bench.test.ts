/**
 * End-to-end per-commit parse cost through the renderer's useMarkdownParsing
 * path (same option shape NodeRenderer passes), measuring:
 *  - parse(stream) ms per commit across a growing document
 *  - the dirty tail metrics (reused nodes, dirtyStart)
 *
 * Confirms the parse layer is incremental (O(dirty tail)) under the exact
 * options the renderer passes. Run against main and an optimized branch and
 * compare the printed medians.
 *
 * @vitest-environment node
 */
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function makeParts(blockCount: number) {
  const parts: string[] = []
  for (let i = 0; i < blockCount; i++) {
    switch (i % 5) {
      case 0:
        parts.push(`# Heading ${i}\n\nSome paragraph text with **bold** and \`code\` and a [link](https://example.com/${i}).`)
        break
      case 1:
        parts.push(`\`\`\`ts\nconst value = ${i}\nconsole.log(value)\n\`\`\``)
        break
      case 2:
        parts.push('- item one\n- item two\n- item three with longer text to wrap a bit')
        break
      case 3:
        parts.push(`> A quote block with some text that spans\n> multiple lines for realism ${i}`)
        break
      case 4:
        parts.push(`Paragraph ${i} with $x^2 + y^2$ inline math and more text to pad length reasonably.`)
        break
    }
  }
  return parts
}

describe('renderer-shape parse cost per streaming commit', () => {
  it('keeps per-commit cost ~O(dirty tail) as the document grows', () => {
    const blockCount = 2400
    const chunkSize = 4096
    const md = getMarkdown('renderer-shape-bench')
    const parts = makeParts(blockCount)
    const full = parts.join('\n\n')
    let src = ''
    const tailSamples: Array<{ chars: number, ms: number }> = []
    let commit = 0

    while (src.length < full.length) {
      src = full.slice(0, Math.min(full.length, src.length + chunkSize))
      const metrics: Record<string, number> = {}
      const t0 = performance.now()
      parseMarkdownToStructure(src, md, {
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: metrics,
      })
      const ms = performance.now() - t0
      const mode = md.stream.stats().lastMode
      if (mode === 'tail' && commit % 5 === 0)
        tailSamples.push({ chars: src.length, ms })
      commit++
    }

    const q = Math.max(1, Math.floor(tailSamples.length / 3))
    const avg = (arr: typeof tailSamples) => arr.reduce((t, s) => t + s.ms, 0) / arr.length
    const early = tailSamples.slice(0, q)
    const late = tailSamples.slice(-q)
    const earlyAvg = avg(early)
    const lateAvg = avg(late)

    console.info(`[parse-shape] docChars=${full.length} commits=${commit}`)
    console.info(`[parse-shape] early avg=${earlyAvg.toFixed(2)}ms @${Math.round(early[0]?.chars ?? 0)}c late avg=${lateAvg.toFixed(2)}ms @${Math.round(late[late.length - 1]?.chars ?? 0)}c`)
    // The tail parse is O(appended chunk), so the late average should stay in
    // the same order as the early average even at ~180KB. Allow generous slack
    // for CI noise: late must be < 8x early (a full O(N) reprocess would be
    // ~20x+ at this size).
    expect(lateAvg).toBeLessThan(earlyAvg * 8 + 2)
  }, 120_000)
})
