import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

/**
 * The reuse tail restores the linkify demotion context captured at the stable
 * prefix boundary. A top-level list whose raw contains a filename keyword
 * while its LAST item does not should therefore produce the same output as a
 * cold parse, where the last remembered context has no filename signal.
 */
describe('structured reuse linkify seed granularity', () => {
  it('streamed reuse output matches cold parse when prefix list mixes filename keyword and plain items', () => {
    const md = getMarkdown('linkify-seed-granularity-1')
    const coldMd = getMarkdown('linkify-seed-granularity-1')

    const commit1 = `- 文件：foo.md\n- 普通内容没有特征词\n\n`
    const commit2 = `${commit1}参考 https://example.com/report.md 文档\n\n`
    const commit3 = `${commit2}以及 a.md\n`

    parseMarkdownToStructure(commit1, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })

    for (const source of [commit2, commit3]) {
      const nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      })
      const cold = parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false })
      expect(JSON.stringify(nodes)).toBe(JSON.stringify(cold))
    }
  })
})
