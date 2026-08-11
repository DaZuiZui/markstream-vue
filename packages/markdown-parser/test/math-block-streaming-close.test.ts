import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collect(nodes: any, type: string): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (!node)
      return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === type)
      out.push(node)
    for (const key of ['children', 'items', 'rows', 'cells']) {
      if (Array.isArray(node[key]))
        node[key].forEach(walk)
    }
  }
  walk(nodes)
  return out
}

describe('math block streaming close handling', () => {
  it('hides an ambiguous explicit bracket math tail until it becomes math-like', () => {
    const md = getMarkdown('math-block-streaming-ambiguous-open')
    const prefix = 'Before the formula.\n\n'
    const partialFormula = '\\[\nf(x)'

    for (let end = 2; end < partialFormula.length; end++) {
      const pending = parseMarkdownToStructure(`${prefix}${partialFormula.slice(0, end)}`, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(pending)).toContain('Before the formula.')
      expect(collect(pending, 'text').map(node => node.content).join('')).toBe('Before the formula.')
      expect(collect(pending, 'math_block')).toHaveLength(0)
    }

    const mathLike = parseMarkdownToStructure(`${prefix}${partialFormula}`, md, {
      final: false,
      streamParse: true,
    }) as any[]
    expect(collect(mathLike, 'math_block')).toMatchObject([{
      content: 'f(x)',
      loading: true,
    }])
  })

  it('hides an ambiguous dollar math tail until it becomes math-like', () => {
    const md = getMarkdown('math-block-streaming-ambiguous-dollar-open')
    const prefix = 'Before the formula.\n\n'
    const partialFormula = '$$\nf(x)'

    for (let end = 1; end < partialFormula.length; end++) {
      const nodes = parseMarkdownToStructure(`${prefix}${partialFormula.slice(0, end)}`, md, {
        final: false,
        streamParse: true,
      }) as any[]
      const serialized = JSON.stringify(nodes)
      expect(serialized).toContain('Before the formula.')
      expect(collect(nodes, 'text').map(node => node.content).join('')).toBe('Before the formula.')
      expect(collect(nodes, 'math_block')).toHaveLength(0)
    }

    const mathLike = parseMarkdownToStructure(`${prefix}${partialFormula}`, md, {
      final: false,
      streamParse: true,
    }) as any[]
    expect(collect(mathLike, 'math_block')).toMatchObject([{
      content: 'f(x)',
      loading: true,
    }])
  })

  it('restores an unclosed non-math explicit bracket tail when the stream is final', () => {
    const md = getMarkdown('math-block-streaming-final-non-math-open')
    const markdown = '\\[\nf('

    const streaming = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]
    expect(streaming).toHaveLength(0)

    const final = parseMarkdownToStructure(markdown, md, {
      final: true,
      streamParse: true,
    }) as any[]
    expect(final.length).toBeGreaterThan(0)
    expect(JSON.stringify(final)).toContain('f(')
    expect(collect(final, 'math_block')).toHaveLength(0)
  })

  it('restores an unclosed non-math dollar tail when the stream is final', () => {
    const md = getMarkdown('math-block-streaming-final-non-math-dollar-open')
    const markdown = '$$\nf('

    const streaming = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]
    expect(streaming).toHaveLength(0)

    const final = parseMarkdownToStructure(markdown, md, {
      final: true,
      streamParse: true,
    }) as any[]
    expect(final.length).toBeGreaterThan(0)
    expect(JSON.stringify(final)).toContain('f(')
  })

  it('does not hide explicit bracket text inside code while streaming', () => {
    const md = getMarkdown('math-block-streaming-code-open')
    const markdown = '```text\n\\[\n$$\nf('

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(JSON.stringify(nodes)).toContain('f(')
    expect(collect(nodes, 'math_block')).toHaveLength(0)
  })

  it('promotes same-line explicit bracket math before the closing delimiter arrives', () => {
    const md = getMarkdown('math-block-streaming-same-line-open')
    const chunks = [
      '- **自然对数**（在 x = 0 附近）：\n\n\\[',
      '\\ln(1+x)',
      ' = x - \\frac{x^2}{2}',
      '\\]',
    ]
    let markdown = ''

    for (const [index, chunk] of chunks.entries()) {
      markdown += chunk
      const nodes = parseMarkdownToStructure(markdown, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any) as any[]
      const mathBlocks = collect(nodes, 'math_block')

      if (index === 0) {
        expect(mathBlocks).toHaveLength(0)
        continue
      }

      expect(mathBlocks).toHaveLength(1)
      expect(mathBlocks[0].content).toBe(markdown.slice(markdown.indexOf('\\[') + 2, markdown.endsWith('\\]') ? -2 : undefined))
      expect(mathBlocks[0].loading).toBe(index < chunks.length - 1)
    }
  })

  it('does not keep a standalone plain ] close line inside \\[ math content', () => {
    const md = getMarkdown('math-block-streaming-plain-close')
    const markdown = String.raw`- **矩阵：**

\[
\begin{bmatrix}
2x_2 - 8x_3 = 8 \\
5x_1 - 5x_3 = 10
\end{bmatrix}
]`

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]
    const mathBlocks = collect(nodes, 'math_block')
    const textNodes = collect(nodes, 'text')

    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('\\end{bmatrix}')
    expect(mathBlocks[0].content).not.toMatch(/\]\s*$/)
    expect(textNodes.map(node => node.content)).not.toContain(']')
  })

  it('keeps multiple completed formulas after a streamed list', () => {
    const md = getMarkdown('math-block-streaming-list-formulas')
    const markdown = String.raw`- **矩阵：**

\[\begin{bmatrix}
2x_2 - 8x_3 = 8 \\
5x_1 - 5x_3 = 10
\end{bmatrix}\]

- **公式**

- **代入数据**

\[\frac{363}{15,\!135} \times 100\% = 2.398\%\]

- **差异说明**

$$E=mc^2$$`

    let streamed: any[] = []
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownToStructure(markdown.slice(0, end), md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any) as any[]
    }

    const final = parseMarkdownToStructure(markdown, md, {
      final: true,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any) as any[]
    const cold = parseMarkdownToStructure(markdown, getMarkdown('math-block-streaming-list-formulas-cold'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(collect(streamed, 'math_block')).toHaveLength(3)
    expect(final).toEqual(cold)
    expect(collect(final, 'math_block').map(node => node.content)).toEqual([
      '\\begin{bmatrix}\n2x_2 - 8x_3 = 8 \\\\\n5x_1 - 5x_3 = 10\n\\end{bmatrix}',
      '\\frac{363}{15,\\!135} \\times 100\\% = 2.398\\%',
      'E=mc^2',
    ])
  })

  it('closes bracket math after lines that should not keep a markdown fence open', () => {
    const prefix = `${Array.from(
      { length: 40 },
      (_, index) => `Paragraph ${index + 1} before the bracket math streaming close regression.`,
    ).join('\n\n')}\n\n`
    const cases = [
      { label: 'four spaces', firstChunk: `${prefix}    \`\`\`\n\\[\n` },
      { label: 'tab indent', firstChunk: `${prefix}\t\`\`\`\n\\[\n` },
      { label: 'backtick info', firstChunk: `${prefix}\`\`\` bad\`info\n\\[\n` },
      { label: 'ended blockquote', firstChunk: `${prefix}> \`\`\`\n\\[\n` },
      { label: 'ended list', firstChunk: `${prefix}- item\n  \`\`\`\n\\[\n` },
    ]

    for (const testCase of cases) {
      const md = getMarkdown(`math-block-streaming-fence-rules-${testCase.label}`)
      const chunks = [
        testCase.firstChunk,
        'x + y\n',
        '\\',
        ']',
      ]
      let markdown = ''
      let nodes: any[] = []

      for (const chunk of chunks) {
        markdown += chunk
        nodes = parseMarkdownToStructure(markdown, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }

      const mathBlocks = collect(nodes, 'math_block')

      expect(mathBlocks, testCase.label).toHaveLength(1)
      expect(mathBlocks[0].loading, testCase.label).toBe(false)
      expect(mathBlocks[0].content, testCase.label).toBe('x + y')
    }
  })

  it('does not repeatedly rescan previous source for literal bracket closes without an opener', () => {
    const run = (chunk: string) => {
      const md = getMarkdown(`math-block-streaming-close-perf-${chunk}`)
      let markdown = ''
      const startedAt = performance.now()

      for (let index = 0; index < 240; index++) {
        markdown += chunk
        parseMarkdownToStructure(markdown, md, {
          final: false,
          streamParse: true,
        })
      }

      return performance.now() - startedAt
    }

    const plainMs = run('plain text\n')
    const literalCloseMs = run('\\]\n')

    expect(literalCloseMs).toBeLessThan(plainMs * 8 + 80)
  })

  it('does not regress on long single-line streaming text without bracket math', () => {
    const md = getMarkdown('long-single-line-no-bracket-math')
    let markdown = `prefix\n\n${'x'.repeat(8_000)}`

    parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    })
    const before = md.stream?.stats?.() as { fullParses?: number, tailHits?: number } | undefined

    const startedAt = performance.now()
    for (let index = 0; index < 80; index++) {
      markdown += ` token${index}`
      parseMarkdownToStructure(markdown, md, {
        final: false,
        streamParse: true,
      })
    }
    const elapsedMs = performance.now() - startedAt
    const after = md.stream?.stats?.() as typeof before

    expect((after?.tailHits ?? 0) - (before?.tailHits ?? 0)).toBe(80)
    expect((after?.fullParses ?? 0) - (before?.fullParses ?? 0)).toBe(0)
    expect(elapsedMs).toBeLessThan(1000)
  })
})
