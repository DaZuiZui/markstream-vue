import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../packages/markdown-parser/src'
import { streamContent } from '../playground/src/const/markdown'

function codeBlocks(nodes: any[]) {
  const result: any[] = []
  const walk = (items: any[]) => {
    for (const node of items || []) {
      if (node?.type === 'code_block')
        result.push(node)
      if (Array.isArray(node?.children))
        walk(node.children)
    }
  }
  walk(nodes)
  return result
}

function textContent(nodes: any[]) {
  const result: string[] = []
  const walk = (value: any) => {
    if (!value)
      return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (value.type === 'text')
      result.push(String(value.content ?? ''))
    for (const key of ['children', 'items'])
      walk(value[key])
  }
  walk(nodes)
  return result.join('')
}

describe('playground stream content', () => {
  it('does not contain accidental template-literal control characters', () => {
    const controls = Array.from(streamContent)
      .map(ch => ch.charCodeAt(0))
      .filter(code => code < 32 && code !== 10 && code !== 13)

    expect(controls).toEqual([])
  })

  it('keeps mermaid blocks closed while later math content streams', () => {
    const mathStart = streamContent.indexOf('# 复杂数学公式')
    const mathEnd = streamContent.indexOf('总之，', mathStart)
    const boldsymbolStart = streamContent.indexOf('boldsymbol', mathStart)
    const orthogonalStart = streamContent.indexOf('正交补空间', mathStart)
    expect(mathStart).toBeGreaterThan(0)
    expect(mathEnd).toBeGreaterThan(mathStart)
    expect(boldsymbolStart).toBeGreaterThan(mathStart)
    expect(orthogonalStart).toBeGreaterThan(mathStart)

    const rangeStart = Math.max(1, mathStart - 1200)
    const rangeEnd = mathEnd + 180
    const prefixEnds = new Set<number>()
    for (let end = rangeStart; end <= rangeEnd; end += 16)
      prefixEnds.add(end)
    for (const anchor of [mathStart, boldsymbolStart, orthogonalStart, mathEnd]) {
      for (let end = anchor - 8; end <= anchor + 24; end++) {
        if (end >= rangeStart && end <= rangeEnd)
          prefixEnds.add(end)
      }
    }
    prefixEnds.add(rangeEnd)

    const md = getMarkdown('playground-mermaid-stream-regression')
    for (const end of [...prefixEnds].sort((a, b) => a - b)) {
      const chunk = streamContent.slice(0, end)
      const nodes = parseMarkdownToStructure(chunk, md, {
        final: false,
        streamParse: true,
        customHtmlTags: ['thinking'],
      })
      const mermaidBlocks = codeBlocks(nodes).filter(node => node.language === 'mermaid')

      for (const block of mermaidBlocks) {
        expect(block.code, `prefix length ${end}`).not.toContain('正交补空间')
        expect(block.code, `prefix length ${end}`).not.toContain('boldsymbol')
      }
    }
  })

  it('keeps matrix heading text visible while the following math block is still ambiguous', () => {
    const headingStart = streamContent.indexOf('矩阵', streamContent.indexOf('二项式展开'))
    const mathLikeEnd = streamContent.indexOf('\\begin{bmatrix}', headingStart) + '\\begin{bmatrix}'.length
    expect(headingStart).toBeGreaterThan(0)
    expect(mathLikeEnd).toBeGreaterThan(headingStart)

    const md = getMarkdown('playground-matrix-heading-stream-regression')
    for (let end = headingStart + 1; end <= mathLikeEnd; end++) {
      const nodes = parseMarkdownToStructure(streamContent.slice(0, end), md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any)
      const arrivedHeading = streamContent.slice(headingStart, Math.min(end, headingStart + '矩阵'.length))
      expect(textContent(nodes), `prefix length ${end}`).toContain(arrivedHeading)
    }
  })
})
