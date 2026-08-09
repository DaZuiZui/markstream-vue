import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure, processTokens } from '../src'

describe('token-to-node pipeline', () => {
  it('keeps token hooks before final loading cleanup and the node hook', () => {
    const order: string[] = []
    const nodes = parseMarkdownToStructure('<section>\nalpha', getMarkdown('token-to-nodes-hook-order'), {
      final: true,
      preTransformTokens(tokens) {
        order.push('pre')
        return tokens
      },
      postTransformTokens(tokens) {
        order.push('post-tokens')
        return tokens
      },
      postTransformNodes(nodes) {
        order.push('post-nodes')
        expect(nodes[0]?.type).toBe('html_block')
        expect(nodes[0]?.loading).toBe(false)
        return nodes
      },
    })

    expect(order).toEqual(['pre', 'post-tokens', 'post-nodes'])
    expect(nodes[0]?.loading).toBe(false)
  })

  it('keeps all hooks observable without changing standalone HTML output', () => {
    const order: string[] = []
    const nodes = parseMarkdownToStructure(
      '<!doctype html>\n<html><body>Hello</body></html>',
      getMarkdown('token-to-nodes-standalone-hooks'),
      {
        final: true,
        preTransformTokens() {
          order.push('pre')
          return []
        },
        postTransformTokens(tokens) {
          order.push('post-tokens')
          expect(tokens).toEqual([])
          return tokens
        },
        postTransformNodes(nodes) {
          order.push('post-nodes')
          return nodes
        },
      },
    )

    expect(order).toEqual(['pre', 'post-tokens', 'post-nodes'])
    expect(nodes).toMatchObject([{ type: 'html_block', tag: 'html', loading: false }])
  })

  it('runs the node hook once when tokenization returns a non-array value', () => {
    const md = getMarkdown('token-to-nodes-invalid-token-result')
    md.parse = () => undefined as any
    let calls = 0

    const nodes = parseMarkdownToStructure('alpha', md, {
      final: true,
      streamParse: false,
      postTransformNodes(nodes) {
        calls++
        expect(nodes).toEqual([])
        return nodes
      },
    })

    expect(nodes).toEqual([])
    expect(calls).toBe(1)
  })

  it('recovers root text and inline tokens as block-safe paragraphs', () => {
    const md = getMarkdown('token-to-nodes-root-recovery')
    const inlineToken = md.parseInline('root **strong**', {})[0]
    const nodes = processTokens([
      { type: 'text', content: 'root text', raw: 'root text' } as any,
      { ...inlineToken, type: 'inline', content: 'root **strong**' } as any,
    ]) as any[]

    expect(nodes.map(node => [node.type, node.raw])).toEqual([
      ['paragraph', 'root text'],
      ['paragraph', 'root **strong**'],
    ])
    expect(nodes[1]?.children?.map((node: any) => node.type)).toEqual(['text', 'strong'])
  })

  it('keeps root token raw text and source maps intact', () => {
    const source = 'alpha\nbeta'
    const nodes = processTokens([
      { type: 'text', content: 'beta', raw: 'beta', map: [1, 2] } as any,
    ], {
      includeSourceMap: true,
      __sourceMarkdown: source,
      __sourceLineMapper: (line: number) => ({ startLine: line, endLine: line + 1 }),
    } as any) as any[]

    expect(nodes).toMatchObject([{
      type: 'paragraph',
      raw: 'beta',
      sourceMap: { startLine: 1, endLine: 2 },
      children: [{ type: 'text', content: 'beta', raw: 'beta' }],
    }])
  })
})
