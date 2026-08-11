import type { ComponentBody, ElementDescriptor } from 'octane'
import type { ParsedNode } from 'stream-markdown-parser'
import type { CodeBlockOptions, NodeComponentProps, RenderContext } from '../../src/index'
import { isValidElement } from 'octane'
import { describe, expect, it } from 'vitest'
import { renderNode } from '../../src/index'

const ExactLanguageProbe: ComponentBody<NodeComponentProps> = () => null
const GenericCodeBlockProbe: ComponentBody<NodeComponentProps> = () => null
const MermaidProbe: ComponentBody<NodeComponentProps> = () => null
const InfographicProbe: ComponentBody<NodeComponentProps> = () => null
const callbackOptions = {
  onLineClick: (_event: { lineNumber: number }) => {},
} satisfies CodeBlockOptions
void callbackOptions

const baseCtx: RenderContext = {
  customId: 'octane-heavy-props-test',
  isDark: false,
  indexKey: 'octane-heavy-props-test',
  typewriter: false,
  codeBlockProps: {},
  mermaidProps: {},
  d2Props: {},
  infographicProps: {},
  showTooltips: true,
  codeBlockStream: true,
  renderCodeBlocksAsPre: false,
  customComponents: {},
  customHtmlTags: [],
  events: {},
}

function descriptor(node: ParsedNode, key: string, ctx: RenderContext) {
  const result = renderNode(node, key, ctx)
  if (!isValidElement(result))
    throw new Error(`Expected an Octane element descriptor for ${node.type}`)
  return result as ElementDescriptor<Record<string, unknown>>
}

describe('markstream-octane heavy-node routing', () => {
  it('forwards Mermaid props and calculates a stable preview estimate', () => {
    const result = descriptor({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }, 'mermaid-props', {
      ...baseCtx,
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
    })

    expect(result.props.showHeader).toBe(false)
    expect(result.props.renderDebounceMs).toBe(180)
    expect(result.props.estimatedPreviewHeightPx).toBe(360)
  })

  it('keeps structural props authoritative over codeBlockProps', () => {
    const realNode: ParsedNode = {
      type: 'code_block',
      language: 'ts',
      code: 'export const real = 1',
      raw: '```ts\nexport const real = 1\n```',
    }
    const fakeNode: ParsedNode = {
      type: 'code_block',
      language: 'python',
      code: 'wrong = True',
      raw: '```python\nwrong = True\n```',
    }
    const result = descriptor(realNode, 'default-code', {
      ...baseCtx,
      codeBlockProps: {
        node: fakeNode,
        indexKey: 'wrong-index',
        renderNode: null,
        showHeader: false,
      },
    })

    expect(result.props.node).toBe(realNode)
    expect(result.props.showHeader).toBe(false)
    expect(result.props.indexKey).toBeUndefined()
    expect(result.props.renderNode).toBeUndefined()
  })

  it('forwards top-level codeBlockOptions after the legacy codeBlockProps bag', () => {
    const codeBlockOptions = {
      diffStyle: 'unified' as const,
      fontSize: 16,
    }
    const result = descriptor({
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    }, 'code-options', {
      ...baseCtx,
      codeBlockOptions,
      codeBlockProps: {
        codeBlockOptions: { fontSize: 99 },
      } as any,
    })

    expect(result.props.codeBlockOptions).toBe(codeBlockOptions)
  })

  it('lets an explicit fallback showLineNumbers prop override codeBlockOptions', () => {
    const node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
      raw: '```ts\nconst value = 1\n```',
    } as ParsedNode
    const renderPre = (ctx: Partial<RenderContext>, key: string) => descriptor(node, key, {
      ...baseCtx,
      renderCodeBlocksAsPre: true,
      ...ctx,
    })

    const defaults = renderPre({}, 'pre-defaults')
    expect(defaults.props.showLineNumbers).toBe(false)
    expect(defaults.props.style).toBeUndefined()

    expect(renderPre({
      codeBlockOptions: { disableLineNumbers: false },
    }, 'pre-enabled').props.showLineNumbers).toBe(true)

    expect(renderPre({
      codeBlockOptions: { disableLineNumbers: false },
      codeBlockProps: { showLineNumbers: false },
    }, 'pre-explicit-disabled').props.showLineNumbers).toBe(false)

    const result = renderPre({
      codeBlockOptions: { disableLineNumbers: true, overflow: 'scroll' },
      codeBlockProps: { showLineNumbers: true },
    }, 'pre-options')

    expect(result.props.showLineNumbers).toBe(true)
    expect(result.props.style).toEqual({ whiteSpace: 'pre' })

    const wrapped = renderPre({
      codeBlockOptions: { overflow: 'wrap' },
    }, 'pre-wrap')
    expect(wrapped.props.style).toEqual({ whiteSpace: 'pre-wrap' })
  })

  it('prefers exact language bindings over the generic code block binding', () => {
    const context: RenderContext = {
      ...baseCtx,
      customComponents: {
        echarts: ExactLanguageProbe,
        code_block: GenericCodeBlockProbe,
      },
    }
    const exact = descriptor({
      type: 'code_block',
      language: 'echarts',
      code: 'option = {}',
      raw: '```echarts\noption = {}\n```',
    }, 'echarts', context)
    const generic = descriptor({
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    }, 'typescript', context)

    expect(exact.type).toBe(ExactLanguageProbe)
    expect(generic.type).toBe(GenericCodeBlockProbe)
  })

  it('routes specialized diagram bindings ahead of code_block fallback', () => {
    const context: RenderContext = {
      ...baseCtx,
      customComponents: {
        mermaid: MermaidProbe,
        infographic: InfographicProbe,
        code_block: GenericCodeBlockProbe,
      },
    }
    const mermaid = descriptor({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }, 'mermaid', context)
    const infographic = descriptor({
      type: 'code_block',
      language: 'infographic',
      code: '# Release progress\n- Plan: complete\n- Build: active\n- Verify: pending',
      raw: '```infographic\n# Release progress\n- Plan: complete\n- Build: active\n- Verify: pending\n```',
    }, 'infographic', context)

    expect(mermaid.type).toBe(MermaidProbe)
    expect(mermaid.props.estimatedPreviewHeightPx).toBe(360)
    expect(infographic.type).toBe(InfographicProbe)
    expect(infographic.props.estimatedPreviewHeightPx).toBe(500)
  })
})
