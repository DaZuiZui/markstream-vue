import type { ComponentBody, OctaneNode } from 'octane'
import type { ParsedNode } from 'stream-markdown-parser'
import type {
  CodeBlockPreviewPayload,
  NodeComponentProps,
  NodeRendererProps,
} from '../../src/index'
import { cleanup, fireEvent, render } from '@octanejs/testing-library'
import { createElement } from 'octane'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGlobalCustomComponents,
  HtmlInlineNode,
  LinkNode,
  NodeRenderer,
  setCustomComponents,
} from '../../src/index'

const stableRendererProps = {
  batchRendering: false,
  deferNodesUntilVisible: false,
  maxLiveNodes: 0,
  smoothStreaming: false,
  viewportPriority: false,
} satisfies NodeRendererProps

const nodeContext = {
  typewriter: false,
  codeBlockProps: {},
  mermaidProps: {},
  d2Props: {},
  infographicProps: {},
  showTooltips: true,
  codeBlockStream: true,
  renderCodeBlocksAsPre: false,
  events: {},
}

afterEach(() => {
  cleanup()
  clearGlobalCustomComponents()
  document.body.innerHTML = ''
})

describe('markstream-octane renderer regressions', () => {
  it('keeps inline HTML in one paragraph as an incomplete stream becomes complete', () => {
    const view = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        content: 'A<sup>[3]',
        final: false,
      },
    })

    expect(view.container.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.container.querySelector('p.paragraph-node sup')?.textContent).toBe('[3]')
    expect(view.container.querySelector('p.paragraph-node')?.textContent).toBe('A[3]')
    expect(view.container.textContent).not.toContain('<sup>')

    view.rerender({
      props: {
        ...stableRendererProps,
        content: 'A<sup>[3]</sup>B',
        final: true,
      },
    })

    expect(view.container.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.container.querySelector('p.paragraph-node sup')?.textContent).toBe('[3]')
    expect(view.container.querySelector('p.paragraph-node')?.textContent).toBe('A[3]B')
  })

  it('renders parser superscript syntax without leaking source markers', () => {
    const { container } = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        content: '测试^[1]^',
        final: true,
      },
    })

    expect(container.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(container.textContent).not.toContain('^[1]^')
  })

  it('keeps unknown HTML-like tags literal while rendering standard HTML', () => {
    const { container } = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        content: '<unknown-widget>keep me</unknown-widget>\n\n<div class="known">render me</div>',
        final: true,
      },
    })

    expect(container.textContent).toContain('<unknown-widget>keep me</unknown-widget>')
    expect(container.querySelector('unknown-widget')).toBeNull()
    expect(container.querySelector('div.known')?.textContent).toBe('render me')
  })

  it('sanitizes active HTML and unsafe attributes under the default policy', () => {
    const { container } = render(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Before <img src="x" onerror="alert(1)"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(2)</script> After',
          loading: false,
        },
      },
    })

    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('title')).toBe('ok')
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.innerHTML).not.toContain('alert(')
  })

  it('allows active HTML only when the trusted policy is explicit', () => {
    const nodes: ParsedNode[] = [{
      type: 'html_block',
      content: '<div>Safe</div><iframe src="https://example.com"></iframe><form><input name="q"></form>',
      raw: '',
    }]
    const view = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        nodes,
        final: true,
      },
    })

    expect(view.container.querySelector('iframe')).toBeNull()
    expect(view.container.querySelector('form')).toBeNull()

    view.rerender({
      props: {
        ...stableRendererProps,
        nodes,
        final: true,
        htmlPolicy: 'trusted',
      },
    })

    expect(view.container.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com')
    expect(view.container.querySelector('form')).not.toBeNull()
  })

  it('invalidates parsed nodes when source-map options or line positions change', () => {
    type ProbeNode = ParsedNode & {
      content?: string
    }
    const seen: ProbeNode[] = []
    const Probe: ComponentBody<NodeComponentProps<ProbeNode>> = ({ node }) => {
      seen.push(node)
      return createElement('span', { className: 'source-map-probe', children: node.content })
    }
    const streamingComponents = { probe: Probe }
    const view = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        content: '<Probe>\nstable\n</Probe>',
        final: true,
        parseOptions: { includeSourceMap: false },
        streamingComponents,
      },
    })
    const withoutSourceMap = seen.at(-1)

    expect(withoutSourceMap?.sourceMap).toBeUndefined()

    view.rerender({
      props: {
        ...stableRendererProps,
        content: '<Probe>\nstable\n</Probe>',
        final: true,
        parseOptions: { includeSourceMap: true },
        streamingComponents,
      },
    })
    const originalPosition = seen.at(-1)

    expect(originalPosition).not.toBe(withoutSourceMap)
    expect(originalPosition?.sourceMap).toEqual({ startLine: 0, endLine: 3 })

    view.rerender({
      props: {
        ...stableRendererProps,
        content: '\nAlpha\n\n<Probe>\nstable\n</Probe>',
        final: true,
        parseOptions: { includeSourceMap: true },
        streamingComponents,
      },
    })

    expect(seen.at(-1)).not.toBe(originalPosition)
    expect(seen.at(-1)?.sourceMap).toEqual({ startLine: 3, endLine: 6 })
  })

  it('keeps a custom code-block DOM instance stable while streamed code grows', () => {
    type CodeBlockNode = ParsedNode & {
      code?: string
    }
    const CodeBlockProbe: ComponentBody<NodeComponentProps<CodeBlockNode>> = ({ node }) =>
      createElement('div', {
        'className': 'code-block-probe',
        'data-code': node.code,
      })
    const firstNode: CodeBlockNode = {
      type: 'code_block',
      language: 'ts',
      code: 'export const first = 1',
      raw: '```ts\nexport const first = 1',
      loading: true,
    }
    setCustomComponents({ code_block: CodeBlockProbe })
    const view = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        nodes: [firstNode],
      },
    })
    const originalElement = view.container.querySelector('.code-block-probe')

    view.rerender({
      props: {
        ...stableRendererProps,
        nodes: [{
          ...firstNode,
          code: 'export const first = 1\nexport const second = 2',
          raw: '```ts\nexport const first = 1\nexport const second = 2',
        }],
      },
    })

    expect(view.container.querySelector('.code-block-probe')).toBe(originalElement)
    expect(originalElement?.getAttribute('data-code')).toContain('second = 2')
  })

  it('ignores removed top-level langs while preserving custom code-block props', () => {
    type CodeBlockProbeProps = NodeComponentProps<ParsedNode> & {
      langs?: readonly string[]
    }
    const CodeBlockProbe: ComponentBody<CodeBlockProbeProps> = props =>
      createElement('div', {
        'className': 'code-block-langs-probe',
        'data-langs': JSON.stringify(props.langs ?? null),
      })
    const node: ParsedNode = {
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    }
    setCustomComponents({ code_block: CodeBlockProbe })

    const view = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        nodes: [node],
        langs: ['typescript'],
      } as NodeRendererProps & { langs: readonly string[] },
    })

    expect(view.container.querySelector('.code-block-langs-probe')?.getAttribute('data-langs')).toBe('null')

    view.rerender({
      props: {
        ...stableRendererProps,
        nodes: [node],
        codeBlockProps: { langs: ['python'] },
      },
    })

    expect(view.container.querySelector('.code-block-langs-probe')?.getAttribute('data-langs')).toBe('["python"]')
  })

  it('forwards custom code previews through the renderer artifact event', () => {
    type PreviewProbeProps = NodeComponentProps<ParsedNode> & {
      onPreviewCode?: (payload: {
        type: string
        content: string
        title: string
      }) => void
    }
    const PreviewProbe: ComponentBody<PreviewProbeProps> = props =>
      createElement('button', {
        className: 'preview-probe',
        onClick: () => props.onPreviewCode?.({
          type: 'text/html',
          content: '<div>preview</div>',
          title: 'HTML Preview',
        }),
        children: 'Preview',
      })
    const onHandleArtifactClick = vi.fn<(payload: CodeBlockPreviewPayload) => void>()
    const node: ParsedNode = {
      type: 'code_block',
      language: 'html',
      code: '<div>preview</div>',
      raw: '```html\n<div>preview</div>\n```',
    }
    setCustomComponents({ code_block: PreviewProbe })
    const { container } = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        nodes: [node],
        onHandleArtifactClick,
      },
    })

    fireEvent.click(container.querySelector('button.preview-probe')!)

    expect(onHandleArtifactClick).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: 'text/html',
      artifactTitle: 'HTML Preview',
      node: expect.objectContaining({
        code: '<div>preview</div>',
      }),
    }))
  })

  it('renders a loading link hint instead of an incomplete anchor', () => {
    const { container } = render(LinkNode, {
      props: {
        node: {
          type: 'link',
          href: 'https://example.com',
          title: null,
          text: 'Example',
          loading: true,
          children: [],
        },
        indexKey: 'octane-link-loading',
        ctx: nodeContext,
      },
    })

    expect(container.querySelector('a.link-node')).toBeNull()
    expect(container.querySelector('.link-loading')?.textContent).toContain('Example')
    expect(container.querySelector('.link-loading-indicator')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('.link-loading')?.style.getPropertyValue('--underline-duration')).toBe('1.6s')
  })

  it('renders renderer-local HTML bindings with their children', () => {
    interface BadgeProps {
      kind?: string
      children?: OctaneNode
    }
    const Badge: ComponentBody<BadgeProps> = ({ children, kind }) =>
      createElement('mark', {
        className: `badge badge--${kind}`,
        children,
      })
    const { container } = render(NodeRenderer, {
      props: {
        ...stableRendererProps,
        content: '<badge kind="info">Bound locally</badge>',
        final: true,
        htmlComponents: { badge: Badge },
      },
    })

    expect(container.querySelector('mark.badge--info')?.textContent).toBe('Bound locally')
  })
})
