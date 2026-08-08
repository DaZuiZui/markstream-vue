import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const markdown = [
  '# Title',
  '',
  'Paragraph text',
  '',
  '- one',
  '- two',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '---',
].join('\n')

describe('node source map metadata', () => {
  it('keeps node shapes unchanged by default', () => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('source-map-default'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => node.sourceMap)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('attaches opt-in source line ranges to top-level block nodes', () => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('source-map-enabled'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['heading', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 2, endLine: 3 }],
      ['list', { startLine: 4, endLine: 7 }],
      ['code_block', { startLine: 7, endLine: 10 }],
      ['thematic_break', { startLine: 11, endLine: 12 }],
    ])
    expect(nodes[3].startLine).toBe(7)
    expect(nodes[3].endLine).toBe(10)
  })

  it('attaches source maps to additional block types', () => {
    const nodes = parseMarkdownToStructure([
      '> Quote',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '$$',
      'x + y',
      '$$',
    ].join('\n'), getMarkdown('source-map-extra-blocks'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['blockquote', { startLine: 0, endLine: 1 }],
      ['table', { startLine: 2, endLine: 5 }],
      ['math_block', { startLine: 6, endLine: 9 }],
    ])
  })

  it('attaches source maps to list and blockquote child blocks', () => {
    const nodes = parseMarkdownToStructure([
      '- item',
      '  - nested',
      '',
      '> quote',
      '> - quoted item',
    ].join('\n'), getMarkdown('source-map-nested-list-blockquote'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    const list = nodes[0]
    const nestedList = list.items[0].children[1]
    const blockquote = nodes[1]
    const quotedList = blockquote.children[1]

    expect(list.sourceMap).toEqual({ startLine: 0, endLine: 3 })
    expect(list.items[0].sourceMap).toEqual({ startLine: 0, endLine: 3 })
    expect(list.items[0].children[0].sourceMap).toEqual({ startLine: 0, endLine: 1 })
    expect(nestedList.sourceMap).toEqual({ startLine: 1, endLine: 3 })
    expect(nestedList.items[0].sourceMap).toEqual({ startLine: 1, endLine: 3 })
    expect(nestedList.items[0].children[0].sourceMap).toEqual({ startLine: 1, endLine: 2 })

    expect(blockquote.sourceMap).toEqual({ startLine: 3, endLine: 5 })
    expect(blockquote.children[0].sourceMap).toEqual({ startLine: 3, endLine: 4 })
    expect(quotedList.sourceMap).toEqual({ startLine: 4, endLine: 5 })
    expect(quotedList.items[0].sourceMap).toEqual({ startLine: 4, endLine: 5 })
    expect(quotedList.items[0].children[0].sourceMap).toEqual({ startLine: 4, endLine: 5 })
  })

  it('maps ranges back to caller source lines after custom tag preprocessing', () => {
    const nodes = parseMarkdownToStructure([
      'Alpha',
      '<thinking>hi</thinking>',
      '',
      '## Next',
    ].join('\n'), getMarkdown('source-map-custom-tags'), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 1, endLine: 2 }],
      ['heading', { startLine: 3, endLine: 4 }],
    ])
  })

  it('maps repeated lines and same-line custom tag preprocessing back to caller source lines', () => {
    const repeatedNodes = parseMarkdownToStructure([
      'same',
      '<thinking>hi</thinking>',
      'same',
      '<thinking>hi</thinking>',
    ].join('\n'), getMarkdown('source-map-repeated-custom-tags'), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    const splitNodes = parseMarkdownToStructure([
      'Alpha',
      '<thinking>hi',
      '</thinking>',
      'Alpha',
    ].join('\n'), getMarkdown('source-map-same-line-custom-open'), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(repeatedNodes.map(node => node.sourceMap)).toEqual([
      { startLine: 0, endLine: 1 },
      { startLine: 1, endLine: 3 },
      { startLine: 3, endLine: 4 },
    ])
    expect(splitNodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['thinking', { startLine: 1, endLine: 3 }],
      ['paragraph', { startLine: 3, endLine: 4 }],
    ])
  })

  it('keeps source maps anchored when an inline custom block prefix repeats later', () => {
    const source = [
      'Alpha <thinking>',
      'body',
      '</thinking>',
      'Alpha',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-inline-prefix-repeat', {
      customHtmlTags: ['thinking'],
    }), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['thinking', { startLine: 0, endLine: 3 }],
      ['paragraph', { startLine: 3, endLine: 4 }],
    ])
  })

  it('attaches source maps to admonition containers', () => {
    const nodes = parseMarkdownToStructure('::: tip Title\nBody\n:::', getMarkdown('source-map-container'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['admonition', { startLine: 0, endLine: 3 }],
    ])
  })

  it('keeps admonition source maps aligned across blank lines and child lists', () => {
    const nodes = parseMarkdownToStructure([
      '::: tip Title',
      'line 1',
      '',
      '- item',
      ':::',
    ].join('\n'), getMarkdown('source-map-container-multiline'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
    expect(nodes[0]?.children?.[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
    expect(nodes[0]?.children?.[1]?.sourceMap).toEqual({ startLine: 3, endLine: 4 })
  })

  it('uses close token maps when paired container open maps are already exclusive', () => {
    const nodes = parseMarkdownToStructure([
      '::: tip',
      'body',
      ':::',
      'after',
    ].join('\n'), getMarkdown('source-map-container-close-token-map'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
      postTransformTokens(tokens) {
        const openToken = tokens.find(token => token.type === 'container_tip_open')
        const closeToken = tokens.find(token => token.type === 'container_tip_close')
        if (openToken)
          openToken.map = [0, 3]
        if (closeToken)
          closeToken.map = [2, 3]
        return tokens
      },
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 3 })
    expect(nodes[1]?.sourceMap).toEqual({ startLine: 3, endLine: 4 })
  })

  it('attaches source maps to VMR fallback containers and heading children', () => {
    const nodes = parseMarkdownToStructure('::: viewcode:demo\n# title\n:::', getMarkdown('source-map-vmr'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 3 })
    expect(nodes[0]?.children?.[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
  })

  it('attaches source maps to VMR fallback paragraph and list children', () => {
    const paragraphNodes = parseMarkdownToStructure('::: viewcode:demo\nbody\n:::', getMarkdown('source-map-vmr-paragraph'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]
    const listNodes = parseMarkdownToStructure('::: viewcode:demo\n- item\n:::', getMarkdown('source-map-vmr-list'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(paragraphNodes[0]?.children?.[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
    expect(listNodes[0]?.children?.[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
  })

  it('attaches source maps to admonition paragraph children', () => {
    const nodes = parseMarkdownToStructure('::: tip\nbody\n:::', getMarkdown('source-map-admonition-child'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.children?.[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
  })

  it('preserves source maps when postTransformTokens returns tokens', () => {
    const nodes = parseMarkdownToStructure('# Title\n\nParagraph text', getMarkdown('source-map-post-transform'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
      postTransformTokens: tokens => tokens,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['heading', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 2, endLine: 3 }],
    ])
  })

  it('preserves parse options when postTransformTokens returns tokens without source maps', () => {
    const nodes = parseMarkdownToStructure('<thinking>hi</thinking>', getMarkdown('source-map-post-transform-options', {
      customHtmlTags: ['thinking'],
    }), {
      customHtmlTags: ['thinking'],
      final: true,
      streamParse: false,
      postTransformTokens: tokens => tokens,
    }) as any[]

    expect(nodes[0]?.children?.[0]?.type).toBe('thinking')
    expect(nodes[0]?.sourceMap).toBeUndefined()
    expect(nodes[0]?.children?.[0]?.sourceMap).toBeUndefined()
  })

  it('maps source ranges across math newline preprocessing that collapses lines', () => {
    const nodes = parseMarkdownToStructure('x $\nabla$', getMarkdown('source-map-math-collapse'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 2 })
  })

  it('maps source ranges across CRLF math newline preprocessing', () => {
    const nodes = parseMarkdownToStructure('x $\r\nabla$', getMarkdown('source-map-math-crlf'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 2 })
  })

  it('keeps CRLF math newline preprocessing on the default path without source maps', () => {
    const nodes = parseMarkdownToStructure('x $\r\nabla$', getMarkdown('source-map-math-crlf-default'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.raw).toBe('x $\\nabla$')
    expect(nodes[0]?.sourceMap).toBeUndefined()
  })

  it('does not rewrite prose line breaks before other/equal/exists', () => {
    const nodes = parseMarkdownToStructure('First.\nother things and\nequal parts below', getMarkdown('prose-softbreak-regression'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.raw).toBe('First.\nother things and\nequal parts below')
    expect(nodes.length).toBe(1)
  })

  it('reconstructs split LaTeX commands inside single-$ math', () => {
    const nodes = parseMarkdownToStructure('use $\nabla f$ here', getMarkdown('math-split-reconstruct'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.raw).toBe('use $\\nabla f$ here')
  })

  it('attaches source maps when root-level inline tokens expand to html blocks', () => {
    const nodes = parseMarkdownToStructure('Alpha\n<section>Body</section>', getMarkdown('source-map-root-inline-html'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
      postTransformTokens: () => [{
        type: 'inline',
        content: '<section>Body</section>',
        map: [1, 2],
        children: [
          { type: 'html_block', content: '<section>Body</section>' },
        ],
      } as any],
    }) as any[]

    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.sourceMap).toEqual({ startLine: 1, endLine: 2 })
  })

  it('keeps source maps on paragraph nodes promoted from inline custom tags', () => {
    const nodes = parseMarkdownToStructure('<br><thinking>hi</thinking>', getMarkdown('source-map-promoted-custom', {
      customHtmlTags: ['thinking'],
    }), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['thinking', { startLine: 0, endLine: 1 }],
    ])
  })

  it('maps custom html block source maps to the re-extracted raw source range', () => {
    const source = [
      '<thinking>',
      '',
      'Body',
      '',
      '</thinking>',
    ].join('\n')
    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-custom-html-raw', {
      customHtmlTags: ['thinking'],
    }), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.raw).toBe(source)
    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })

  it('updates sourceMap when details html blocks are merged', () => {
    const source = [
      '<details>',
      '<summary>Title</summary>',
      '',
      'Body',
      '</details>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-details'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
    expect(nodes[0]?.children?.find((child: any) => child?.tag === 'summary')?.sourceMap).toBeUndefined()
    expect(nodes[0]?.children?.find((child: any) => child?.type === 'paragraph')?.sourceMap).toEqual({ startLine: 3, endLine: 4 })
  })

  it('updates sourceMap when split top-level html blocks are merged', () => {
    const source = [
      '<span>',
      '',
      '- item',
      '',
      '</span>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-html-merge'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })

  it('attaches sourceMap to standalone html documents', () => {
    const source = [
      '<html>',
      '<body>',
      'Document',
      '</body>',
      '</html>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-standalone-html'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })
})
