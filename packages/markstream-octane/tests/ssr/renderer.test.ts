import type { ComponentBody } from 'octane'
import type { NodeComponentProps } from '../../src/server'
import { createElement, renderToStaticMarkup, renderToString } from 'octane/server'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearGlobalCustomComponents,
  MathBlockNode,
  MathInlineNode,
  NodeRenderer,
  setCustomComponents,
} from '../../src/server'

afterEach(() => {
  clearGlobalCustomComponents()
})

describe('markstream-octane SSR renderer', () => {
  it('renders Markdown with the native Octane server runtime', () => {
    const output = renderToString(NodeRenderer, {
      content: '# Server heading\n\nA **server-rendered** paragraph.',
      final: true,
    })

    expect(output.html).toContain('class="markstream-octane markdown-renderer"')
    expect(output.html).toContain('<h1')
    expect(output.html).toContain('Server heading')
    expect(output.html).toContain('<strong')
    expect(output.html).toContain('server-rendered')
  })

  it('renders inline image links without client-only wrappers', () => {
    const output = renderToStaticMarkup(NodeRenderer, {
      content: [
        '[![NPM](https://img.shields.io/npm/v/markstream-vue)](https://www.npmjs.com/package/markstream-vue)',
        '[![Docs](https://img.shields.io/badge/docs-中文-blue)](README.zh-CN.md)',
      ].join('\n'),
      final: true,
    })

    expect(output.html).toContain('href="README.zh-CN.md"')
    expect(output.html).toContain('<img')
    expect(output.html).not.toContain('class="text-node')
    expect(output.html).toContain('</a> <a')
  })

  it('renders unicode KaTeX units without falling back to raw Markdown', () => {
    const inline = renderToStaticMarkup(
      MathInlineNode,
      {
        node: {
          type: 'math_inline',
          content: 'c=0.75\\times10^3\\ \\text{J/(kg·℃)}',
          raw: '$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$',
          markup: '$',
          loading: false,
        },
      },
    )
    const block = renderToStaticMarkup(
      MathBlockNode,
      {
        node: {
          type: 'math_block',
          content: 'Q=3.3\\times10^4\\ \\text{J}',
          raw: '$$Q=3.3\\times10^4\\ \\text{J}$$',
          loading: false,
        },
      },
    )

    expect(inline.html).toContain('class="katex"')
    expect(inline.html).not.toContain('math-inline--fallback')
    expect(block.html).toContain('class="katex-display"')
    expect(block.html).not.toContain('math-block__fallback')
  })

  it('accepts local Octane component bindings during SSR', () => {
    interface InsightNode {
      type: 'insight'
      raw: string
      tag: 'insight'
      label: string
    }
    const Insight: ComponentBody<NodeComponentProps<InsightNode>> = ({ node }) =>
      createElement('aside', {
        className: 'ssr-insight',
        children: node.label,
      })
    const output = renderToStaticMarkup(NodeRenderer, {
      nodes: [{
        type: 'insight',
        raw: '<insight>SSR binding</insight>',
        tag: 'insight',
        label: 'SSR binding',
      }],
      streamingComponents: { insight: Insight },
    })

    expect(output.html).toContain('class="ssr-insight"')
    expect(output.html).toContain('SSR binding')
  })

  it('does not forward removed top-level langs during SSR', () => {
    interface CodeBlockProbeProps extends NodeComponentProps {
      langs?: readonly string[]
    }
    const CodeBlockProbe: ComponentBody<CodeBlockProbeProps> = props =>
      createElement('div', {
        'className': 'ssr-code-block-langs-probe',
        'data-langs': JSON.stringify(props.langs ?? null),
      })
    setCustomComponents({ code_block: CodeBlockProbe })

    const output = renderToStaticMarkup(NodeRenderer, {
      nodes: [{
        type: 'code_block',
        language: 'ts',
        code: 'export const value = 1',
        raw: '```ts\nexport const value = 1\n```',
      }],
      langs: ['typescript'],
    } as unknown as Parameters<typeof NodeRenderer>[0] & { langs: readonly string[] })

    expect(output.html).toContain('class="ssr-code-block-langs-probe"')
    expect(output.html).toContain('data-langs="null"')
  })

  it('keeps direct pre overflow aligned with the enhanced fallback', () => {
    const content = '```ts\nexport const value = 1\n```'
    const scrolled = renderToStaticMarkup(NodeRenderer, {
      codeBlockOptions: { overflow: 'scroll' },
      content,
      final: true,
      renderCodeBlocksAsPre: true,
    })
    const wrapped = renderToStaticMarkup(NodeRenderer, {
      codeBlockOptions: { overflow: 'wrap' },
      content,
      final: true,
      renderCodeBlocksAsPre: true,
    })

    expect(scrolled.html).toContain('white-space:pre')
    expect(wrapped.html).toContain('white-space:pre-wrap')
  })
})
