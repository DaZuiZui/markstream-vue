import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasCompleteHtmlTagContent } from '../packages/markstream-angular/src/components/shared/node-helpers'
import {
  coerceBuiltinHtmlNode,
  coerceCustomHtmlNode,
  resolveNodeOutletCodeMode,
  resolveNodeOutletCustomComponent,
  resolveNodeOutletCustomInputs,
} from '../packages/markstream-angular/src/components/shared/node-outlet-helpers'

class ExactLanguageComponent {}
class GenericCodeBlockComponent {}
class MermaidComponent {}
class D2Component {}
class D2LangComponent {}

const nodeOutletSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-angular/src/components/NodeOutlet/NodeOutlet.component.ts'),
  'utf8',
)

describe('markstream-angular NodeOutlet', () => {
  it('lets explicit fallback line-number props override neutral options', () => {
    expect(nodeOutletSource).toContain('[showLineNumbers]="resolvedPreShowLineNumbers"')
    expect(nodeOutletSource).toContain("typeof explicit === 'boolean'")
    expect(nodeOutletSource).toContain('this.context?.codeBlockOptions?.disableLineNumbers !== true')
  })

  it('keeps direct pre overflow aligned with enhanced fallbacks', () => {
    expect(nodeOutletSource).toContain('[whiteSpace]="resolvedPreWhiteSpace"')
    expect(nodeOutletSource).toContain("this.context?.codeBlockOptions?.overflow === 'scroll' ? 'pre' : 'pre-wrap'")
  })

  it('coerces custom html tags into tag-typed nodes for custom components', () => {
    const node = {
      type: 'html_block',
      tag: 'thinking',
      content: '<thinking>inner body</thinking>',
      raw: '<thinking>inner body</thinking>',
    } as any

    expect((coerceCustomHtmlNode(node) as any).type).toBe('thinking')
    expect((coerceCustomHtmlNode(node) as any).tag).toBe('thinking')
    expect((coerceCustomHtmlNode(node) as any).content).toBe('inner body')
    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).type).toBe('html_block')
    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).content).toBe('<thinking>inner body</thinking>')
  })

  it('preserves standard html wrappers for builtin html nodes', () => {
    const node = {
      type: 'html_block',
      tag: 'details',
      content: '<details><summary>More</summary><p>Body</p></details>',
      raw: '<details><summary>More</summary><p>Body</p></details>',
    } as any

    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).content).toBe('<details><summary>More</summary><p>Body</p></details>')
  })

  it('only escapes malformed unknown html tags', () => {
    expect(hasCompleteHtmlTagContent('<question>ok</question>', 'question')).toBe(true)
    expect(hasCompleteHtmlTagContent('<question>ok', 'question')).toBe(false)
  })

  it('routes heavy node props by code block mode', () => {
    const context = {
      codeBlockProps: { showHeader: false },
      mermaidProps: { renderDebounceMs: 180 },
      d2Props: { themeId: 7 },
      infographicProps: { showHeader: false },
      events: {},
    }

    let node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph TD\nA-->B\n',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('mermaid')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ renderDebounceMs: 180, estimatedPreviewHeightPx: 360 })

    node = {
      type: 'code_block',
      language: 'd2',
      code: 'a -> b',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('d2')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ themeId: 7 })

    node = {
      type: 'code_block',
      language: 'infographic',
      code: 'infographic list-row-simple-horizontal-arrow',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('infographic')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ showHeader: false, estimatedPreviewHeightPx: 360 })

    node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('code')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ showHeader: false })
  })

  it('prefers exact language custom components over code_block fallback', () => {
    const context = {
      customComponents: {
        echarts: ExactLanguageComponent as any,
        code_block: GenericCodeBlockComponent as any,
      },
      codeBlockProps: { showHeader: false },
      events: {},
    } as any

    let node = {
      type: 'code_block',
      language: 'echarts',
      code: 'option = {}',
    } as any
    expect(resolveNodeOutletCustomComponent(node, context)).toBe(ExactLanguageComponent)
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ showHeader: false })

    node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
    } as any
    expect(resolveNodeOutletCustomComponent(node, context)).toBe(GenericCodeBlockComponent)
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ showHeader: false })
  })

  it('keeps specialized mermaid routing ahead of code_block fallback', () => {
    const context = {
      customComponents: {
        mermaid: MermaidComponent as any,
        code_block: GenericCodeBlockComponent as any,
      },
      mermaidProps: { renderDebounceMs: 180 },
      events: {},
    } as any
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph TD\nA-->B\n',
    } as any

    expect(resolveNodeOutletCustomComponent(node, context)).toBe(MermaidComponent)
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ renderDebounceMs: 180, estimatedPreviewHeightPx: 360 })
  })

  it('injects stable preview height estimates for angular mermaid and infographic custom inputs', () => {
    const context = {
      events: {},
    } as any

    let node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n',
    } as any
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ estimatedPreviewHeightPx: 500 })

    node = {
      type: 'code_block',
      language: 'infographic',
      code: ['# Release progress', '- Plan: complete', '- Build: active', '- Verify: pending'].join('\n'),
    } as any
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ estimatedPreviewHeightPx: 500 })
  })

  it('lets d2lang exact overrides beat d2 fallback while keeping d2 inputs', () => {
    const context = {
      customComponents: {
        d2: D2Component as any,
        d2lang: D2LangComponent as any,
      },
      d2Props: { themeId: 7 },
      events: {},
    } as any
    const node = {
      type: 'code_block',
      language: 'd2lang',
      code: 'a -> b',
    } as any

    expect(resolveNodeOutletCustomComponent(node, context)).toBe(D2LangComponent)
    expect(resolveNodeOutletCustomInputs(node, context)).toEqual({ themeId: 7 })
  })
})
