import type { MarkdownIt, ParsedNode, ParseOptions } from '../src'
import MarkdownItEngine from 'markdown-it-ts'
import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { factory } from '../src/factory'
import { disposeParserRuntime, getParserRuntime } from '../src/parser/runtime'

interface ParserMetrics {
  processTokensReusedTopLevelNodes?: number
}

let coldParseId = 0

function parseStreaming(
  source: string,
  md: MarkdownIt,
  options: ParseOptions = {},
) {
  return parseMarkdownToStructure(source, md, {
    final: false,
    streamParse: true,
    reuseStableTopLevelNodes: true,
    ...options,
  })
}

function parseCold(source: string, options: ParseOptions = {}) {
  return parseMarkdownToStructure(source, getMarkdown(`parser-runtime-cold-${coldParseId++}`), {
    streamParse: false,
    ...options,
  })
}

function paragraphChildren(node: ParsedNode | undefined) {
  return ((node as ParsedNode & { children?: ParsedNode[] } | undefined)?.children ?? [])
}

describe('parser runtime lifecycle characterization', () => {
  it('keeps same-source replay idempotent and append-only prefix identity eligible', () => {
    const md = getMarkdown('parser-runtime-replay-append')
    const base = 'alpha\n\nbeta\n\n'
    const first = parseStreaming(base, md)
    const replay = parseStreaming(base, md)
    const metrics: ParserMetrics = {}
    const appendedSource = `${base}gamma\n\n`
    const appended = parseStreaming(appendedSource, md, { parserMetrics: metrics })

    expect(replay).toEqual(first)
    expect(appended).toEqual(parseCold(appendedSource, { final: false }))
    expect(appended[0]).toBe(replay[0])
    expect(appended[1]).toBe(replay[1])
    expect(metrics.processTokensReusedTopLevelNodes).toBeGreaterThan(0)

    const runtime = getParserRuntime(md)
    expect(runtime.topLevelStreamParseMode).not.toBe('sync')
    md.stream?.reset?.()
    expect(runtime.safeMarkdown).toBeUndefined()
    expect(runtime.tolerantMathBoundary).toBeUndefined()
    expect(runtime.pendingExplicitMathTail).toBeUndefined()
    expect(runtime.streamParseEnvs.size).toBe(0)
    expect(runtime.topLevelStreamParseMode).toBeUndefined()
    expect(runtime.structuredStream).toBeUndefined()
    expect(runtime.siblingHtmlChildren).toBeUndefined()

    const afterResetSource = `${appendedSource}after reset\n\n`
    const afterReset = parseStreaming(afterResetSource, md)
    expect(afterReset).toEqual(parseCold(afterResetSource, { final: false }))
    expect(afterReset[0]).not.toBe(appended[0])
  })

  it.each([
    ['truncate', 'alpha\n\nbeta\n\ngamma\n\n', 'alpha\n\n'],
    ['replacement', 'alpha\n\nbeta\n\n', 'omega\n\ndelta\n\n'],
  ])('does not leak stale state across a %s transition', (_name, firstSource, nextSource) => {
    const md = getMarkdown(`parser-runtime-${_name}`)
    const first = parseStreaming(firstSource, md)
    const next = parseStreaming(nextSource, md)

    expect(next).toEqual(parseCold(nextSource, { final: false }))
    expect(next[0]).not.toBe(first[0])
  })

  it('does not reset the stream for sync-only replacement parses', () => {
    const md = getMarkdown('parser-runtime-sync-only-replacement')
    const stream = md.stream!
    const originalReset = stream.reset!
    let resetCount = 0
    stream.reset = function (...args: Parameters<NonNullable<typeof originalReset>>) {
      resetCount++
      return Reflect.apply(originalReset, this, args)
    }

    parseMarkdownToStructure('alpha\n\n', md, { final: false, streamParse: false })
    parseMarkdownToStructure('omega\n\n', md, { final: false, streamParse: false })

    expect(resetCount).toBe(0)
  })

  it('resets the stream once per consecutive final auto parse', () => {
    const md = getMarkdown('parser-runtime-consecutive-final-auto')
    const stream = md.stream!
    const originalReset = stream.reset!
    let resetCount = 0
    stream.reset = function (...args: Parameters<NonNullable<typeof originalReset>>) {
      resetCount++
      return Reflect.apply(originalReset, this, args)
    }

    parseStreaming('streaming\n\n', md)
    resetCount = 0

    const resetDeltas = ['streaming\n\n', 'omega\n\n'].map((source) => {
      const before = resetCount
      parseMarkdownToStructure(source, md, { final: true })
      return resetCount - before
    })

    expect(resetDeltas).toEqual([1, 1])
  })

  it.each(['auto', true, false] as const)('ends a %s final document before parsing the next document', (streamParse) => {
    const md = getMarkdown(`parser-runtime-next-document-${streamParse}`)
    const firstSource = 'alpha\n\nbeta\n\n'
    const first = parseStreaming(firstSource, md)

    const final = parseMarkdownToStructure(firstSource, md, {
      final: true,
      streamParse,
    })
    const runtime = getParserRuntime(md)
    const nextSource = 'fresh\n\ndocument\n\n'

    expect(final).toEqual(parseCold(firstSource, { final: true, streamParse }))
    expect(runtime.safeMarkdown).toBeUndefined()
    expect(runtime.streamParseEnvs.size).toBe(0)
    expect(runtime.topLevelStreamParseMode).toBeUndefined()
    expect(runtime.structuredStream).toBeUndefined()

    const next = parseStreaming(nextSource, md)
    expect(next).toEqual(parseCold(nextSource, { final: false }))
    expect(next[0]).not.toBe(first[0])
  })

  it('does not mutate frozen public parse options', () => {
    const customHtmlTags = Object.freeze(['thinking'])
    const options = Object.freeze({
      customHtmlTags,
      final: false,
      includeSourceMap: true,
      requireClosingStrong: true,
      streamParse: true,
    } satisfies ParseOptions)
    const before = Reflect.ownKeys(options)

    expect(() => parseMarkdownToStructure(
      '<thinking>first</thinking>\n\n<thinking>second</thinking>',
      getMarkdown('parser-runtime-frozen-options', { customHtmlTags }),
      options,
    )).not.toThrow()
    expect(Reflect.ownKeys(options)).toEqual(before)
  })

  it('invalidates option-sensitive nodes for custom tags and validators', () => {
    const md = getMarkdown('parser-runtime-option-change')
    const linkSource = '[safe](https://example.com)\n\n'
    const allowed = parseStreaming(linkSource, md, { validateLink: () => true })
    const denied = parseStreaming(linkSource, md, { validateLink: () => false })

    expect(paragraphChildren(allowed[0]).some(node => node.type === 'link')).toBe(true)
    expect(paragraphChildren(denied[0]).some(node => node.type === 'link')).toBe(false)
    expect(denied[0]).not.toBe(allowed[0])

    const customSource = '<thinking>hello</thinking>'
    const plain = parseStreaming(customSource, md)
    const custom = parseStreaming(customSource, md, { customHtmlTags: ['thinking'] })
    const configuredColdMd = getMarkdown('parser-runtime-custom-cold', {
      customHtmlTags: ['thinking'],
    })
    expect(custom).toEqual(parseMarkdownToStructure(customSource, configuredColdMd, {
      customHtmlTags: ['thinking'],
      final: false,
      streamParse: true,
    }))
    expect(custom[0]).not.toBe(plain[0])
  })

  it('invalidates source-map and transform-hook semantic transitions', () => {
    const md = getMarkdown('parser-runtime-semantic-transitions')
    const source = 'alpha\n\nbeta\n\n'
    let previous = parseStreaming(source, md)
    const withSourceMap = parseStreaming(source, md, { includeSourceMap: true })

    expect(withSourceMap).toEqual(parseCold(source, { final: false, includeSourceMap: true }))
    expect(withSourceMap[0]?.sourceMap).toBeDefined()
    expect(withSourceMap[0]).not.toBe(previous[0])
    previous = withSourceMap

    const hookOptions: ParseOptions[] = [
      { preTransformTokens: tokens => tokens },
      { postTransformTokens: tokens => tokens },
      { postTransformNodes: nodes => nodes },
    ]
    for (const options of hookOptions) {
      const next = parseStreaming(source, md, options)
      expect(next).toEqual(parseCold(source, { ...options, final: false }))
      expect(next[0]).not.toBe(previous[0])
      previous = next
    }
  })

  it('keeps fragment parses from evicting an eligible top-level prefix', () => {
    const md = getMarkdown('parser-runtime-fragment')
    const base = [
      'alpha',
      '',
      '<details>',
      '<summary>summary</summary>',
      '',
      'body',
      '</details>',
      '',
    ].join('\n')
    const first = parseStreaming(base, md)
    const runtime = getParserRuntime(md)

    expect(runtime.safeMarkdown?.source).toBe(base)
    expect(runtime.topLevelStreamParseMode).not.toBe('sync')

    const nextSource = `${base}\nomega\n\n`
    const next = parseStreaming(nextSource, md)

    expect(next).toEqual(parseCold(nextSource, { final: false }))
    expect(next[0]).toBe(first[0])
    expect(runtime.safeMarkdown?.source).toBe(nextSource)
  })

  it('isolates state and node identity between markdown-it instances', () => {
    const mdA = getMarkdown('parser-runtime-instance-a')
    const mdB = getMarkdown('parser-runtime-instance-b')
    const base = 'alpha\n\nbeta\n\n'
    const firstA = parseStreaming(base, mdA)
    const firstB = parseStreaming(base, mdB)
    const nextSource = `${base}gamma\n\n`
    const nextA = parseStreaming(nextSource, mdA)
    const replayB = parseStreaming(base, mdB)

    expect(nextA[0]).toBe(firstA[0])
    expect(nextA[0]).not.toBe(firstB[0])
    expect(replayB).toEqual(firstB)
    expect(replayB[0]).not.toBe(firstA[0])
  })

  it('observes markdown-it plugin and set transitions without stale reuse', () => {
    const md = getMarkdown('parser-runtime-md-boundaries')
    const source = 'alpha\n\nbeta\n\n'
    const first = parseStreaming(source, md)
    const runtime = getParserRuntime(md)

    md.use((activeMd) => {
      activeMd.core.ruler.push('parser_runtime_mutate_alpha', (state: any) => {
        for (const token of state.tokens ?? []) {
          if (token.type !== 'inline' || token.content !== 'alpha')
            continue
          token.content = 'alpha changed'
          token.children = [{ type: 'text', content: 'alpha changed' }]
        }
      })
    })
    expect(runtime.safeMarkdown).toBeUndefined()
    expect(runtime.streamParseEnvs.size).toBe(0)

    const withPlugin = parseStreaming(source, md)

    expect(withPlugin[0]?.raw).toBe('alpha changed')
    expect(withPlugin[0]).not.toBe(first[0])

    const linkSource = '[safe](https://example.com)\n\n'
    md.set({ validateLink: () => false })
    expect(runtime.safeMarkdown).toBeUndefined()
    expect(runtime.streamParseEnvs.size).toBe(0)

    const denied = parseStreaming(linkSource, md)
    expect(paragraphChildren(denied[0]).some(node => node.type === 'link')).toBe(false)
  })

  it.each([
    ['getMarkdown', () => getMarkdown('parser-runtime-dynamic-plugin')],
    ['factory', () => factory()],
  ])('switches %s instances to sync parsing after a dynamic plugin install', (_name, createMarkdown) => {
    const countHeadings = (activeMd: MarkdownIt) => {
      activeMd.core.ruler.push('parser_runtime_global_heading_count', (state: any) => {
        const headings = (state.tokens ?? []).filter((token: any) => token.type === 'heading_open')
        for (const token of headings)
          token.attrSet('data-total', String(headings.length))
      })
    }
    const buildHeadings = (count: number) => `${Array.from({ length: count }, (_, index) => `# Heading ${index + 1}`).join('\n\n')}\n\n`
    const md = createMarkdown()
    const firstSource = buildHeadings(40)
    const first = parseStreaming(firstSource, md)

    md.use(countHeadings)

    const source = `${firstSource}# Heading 41\n\n`
    const metrics: ParserMetrics = {}
    const current = parseStreaming(source, md, { parserMetrics: metrics })
    const coldMd = createMarkdown()
    coldMd.use(countHeadings)
    const cold = parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false })

    expect(current).toEqual(cold)
    expect(current).toHaveLength(41)
    expect(current.every(node => (node as ParsedNode & { attrs?: Record<string, string> }).attrs?.['data-total'] === '41')).toBe(true)
    expect(current[0]).not.toBe(first[0])
    expect(metrics.processTokensReusedTopLevelNodes ?? 0).toBe(0)
    expect(getParserRuntime(md).topLevelStreamParseMode).toBe('sync')
  })

  it.each([
    ['factory', () => factory()],
    ['external MarkdownIt', () => new MarkdownItEngine({ experimental: { stream: true } }) as unknown as MarkdownIt],
  ])('keeps a preconfigured %s instance on the sync path', (_name, createMarkdown) => {
    const countHeadings = (activeMd: MarkdownIt) => {
      activeMd.core.ruler.push('parser_runtime_preconfigured_heading_count', (state: any) => {
        const headings = (state.tokens ?? []).filter((token: any) => token.type === 'heading_open')
        for (const token of headings)
          token.attrSet('data-total', String(headings.length))
      })
    }
    const buildHeadings = (count: number) => `${Array.from({ length: count }, (_, index) => `# Heading ${index + 1}`).join('\n\n')}\n\n`
    const md = createMarkdown()
    md.use(countHeadings)
    const firstSource = buildHeadings(40)
    const first = parseStreaming(firstSource, md)

    const source = `${firstSource}# Heading 41\n\n`
    const metrics: ParserMetrics = {}
    const current = parseStreaming(source, md, { parserMetrics: metrics })
    const coldMd = createMarkdown()
    coldMd.use(countHeadings)
    const cold = parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false })

    expect(current).toEqual(cold)
    expect(current.every(node => (node as ParsedNode & { attrs?: Record<string, string> }).attrs?.['data-total'] === '41')).toBe(true)
    expect(current[0]).not.toBe(first[0])
    expect(metrics.processTokensReusedTopLevelNodes ?? 0).toBe(0)
    expect(getParserRuntime(md).topLevelStreamParseMode).toBe('sync')
  })

  it('keeps a partially installed factory plugin on the sync path after use throws', () => {
    const countHeadingsThenThrow = (activeMd: MarkdownIt) => {
      activeMd.core.ruler.push('parser_runtime_partial_heading_count', (state: any) => {
        const headings = (state.tokens ?? []).filter((token: any) => token.type === 'heading_open')
        for (const token of headings)
          token.attrSet('data-total', String(headings.length))
      })
      throw new Error('plugin install failed after mutation')
    }
    const buildHeadings = (count: number) => `${Array.from({ length: count }, (_, index) => `# Heading ${index + 1}`).join('\n\n')}\n\n`
    const md = factory()
    const firstSource = buildHeadings(40)
    const first = parseStreaming(firstSource, md)

    expect(() => md.use(countHeadingsThenThrow)).toThrow('plugin install failed after mutation')

    const source = `${firstSource}# Heading 41\n\n`
    const current = parseStreaming(source, md)
    const coldMd = factory()
    expect(() => coldMd.use(countHeadingsThenThrow)).toThrow('plugin install failed after mutation')
    const cold = parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false })

    expect(current).toEqual(cold)
    expect(current.every(node => (node as ParsedNode & { attrs?: Record<string, string> }).attrs?.['data-total'] === '41')).toBe(true)
    expect(current[0]).not.toBe(first[0])
    expect(getParserRuntime(md).topLevelStreamParseMode).toBe('sync')
  })

  it('keeps ordinary same-source sibling HTML children eligible for identity reuse', () => {
    const source = '<div><section>\n\none\n\n</section><section>\n\ntwo\n\n</section>'
    const md = getMarkdown('parser-runtime-sibling-html-identity')
    const first = parseStreaming(source, md)
    const replay = parseStreaming(source, md)

    expect((replay[0] as any).children[0]).toBe((first[0] as any).children[0])
  })

  it('does not feed postTransformNodes mutations back through the sibling HTML cache', () => {
    const source = '<div><section>\n\none\n\n</section><section>\n\ntwo\n\n</section>'
    const postTransformNodes: NonNullable<ParseOptions['postTransformNodes']> = (nodes) => {
      const text = (nodes[0] as any).children?.[0]?.children?.[0]?.children?.[0]
      text.content = `${text.content}!`
      return nodes
    }
    const options = { final: false, postTransformNodes, streamParse: true } as const
    const md = getMarkdown('parser-runtime-sibling-html-hook')
    const first = parseMarkdownToStructure(source, md, options)
    const replay = parseMarkdownToStructure(source, md, options)
    const cold = parseMarkdownToStructure(source, getMarkdown('parser-runtime-sibling-html-hook-cold'), options)

    expect((first[0] as any).children[0].children[0].children[0].content).toBe('one!')
    expect((replay[0] as any).children[0].children[0].children[0].content).toBe('one!')
    expect(replay).toEqual(cold)
    expect((replay[0] as any).children[0]).not.toBe((first[0] as any).children[0])
  })

  it('does not reuse sibling HTML children for a mutable link validator closure', () => {
    const source = '<div><section>\n\n[one](https://example.com)\n\n</section><section>\n\ntwo\n\n</section>'
    let allowLinks = true
    const validateLink = () => allowLinks
    const options = { final: false, streamParse: true, validateLink } as const
    const containsLink = (value: unknown): boolean => {
      if (Array.isArray(value))
        return value.some(containsLink)
      if (!value || typeof value !== 'object')
        return false
      if ((value as ParsedNode).type === 'link')
        return true
      return Object.values(value).some(containsLink)
    }
    const md = getMarkdown('parser-runtime-sibling-html-validator')
    const first = parseMarkdownToStructure(source, md, options)

    expect(containsLink(first)).toBe(true)
    allowLinks = false

    const replay = parseMarkdownToStructure(source, md, options)
    const cold = parseMarkdownToStructure(source, getMarkdown('parser-runtime-sibling-html-validator-cold'), options)

    expect(containsLink(replay)).toBe(false)
    expect(replay).toEqual(cold)
    expect((replay[0] as any).children[0]).not.toBe((first[0] as any).children[0])
  })

  it('wraps markdown-it reset, use, and set boundaries exactly once', () => {
    const md = getMarkdown('parser-runtime-boundary-wrappers')
    const originalUse = md.use
    const originalSet = md.set
    const stream = md.stream!
    const originalReset = stream.reset!
    const calls: Array<{ boundary: string, self: unknown, args: unknown[] }> = []
    const resetReturn = { reset: true }

    md.use = function (...args: Parameters<MarkdownIt['use']>) {
      calls.push({ boundary: 'use', self: this, args })
      return Reflect.apply(originalUse, this, args)
    }
    md.set = function (...args: Parameters<MarkdownIt['set']>) {
      calls.push({ boundary: 'set', self: this, args })
      return Reflect.apply(originalSet, this, args)
    }
    stream.reset = function (...args: Parameters<NonNullable<typeof originalReset>>) {
      calls.push({ boundary: 'reset', self: this, args })
      Reflect.apply(originalReset, this, args)
      return resetReturn
    }

    const runtime = getParserRuntime(md)
    const wrappedUse = md.use
    const wrappedSet = md.set
    const wrappedReset = stream.reset
    expect(getParserRuntime(md)).toBe(runtime)
    expect(md.use).toBe(wrappedUse)
    expect(md.set).toBe(wrappedSet)
    expect(stream.reset).toBe(wrappedReset)

    const pluginMarker = { plugin: true }
    const pluginCalls: Array<{ self: unknown, marker: unknown }> = []
    const plugin = (activeMd: MarkdownIt, marker: unknown) => {
      pluginCalls.push({ self: activeMd, marker })
    }
    expect(md.use(plugin, pluginMarker)).toBe(md)
    expect(calls.filter(call => call.boundary === 'reset')).toEqual([
      { boundary: 'reset', self: stream, args: [] },
    ])
    expect(pluginCalls).toEqual([{ self: md, marker: pluginMarker }])

    expect(md.set({ breaks: true })).toBe(md)
    expect(calls.filter(call => call.boundary === 'reset')).toEqual([
      { boundary: 'reset', self: stream, args: [] },
      { boundary: 'reset', self: stream, args: [] },
    ])

    const resetMarker = { external: true }
    const externalResetResult = (stream.reset as unknown as (...args: unknown[]) => unknown).call(stream, resetMarker)
    expect(externalResetResult).toBe(resetReturn)

    expect(calls.filter(call => call.boundary === 'use')).toEqual([
      { boundary: 'use', self: md, args: [plugin, pluginMarker] },
    ])
    expect(calls.filter(call => call.boundary === 'set')).toEqual([
      { boundary: 'set', self: md, args: [{ breaks: true }] },
    ])
    expect(calls.filter(call => call.boundary === 'reset')).toEqual([
      { boundary: 'reset', self: stream, args: [] },
      { boundary: 'reset', self: stream, args: [] },
      { boundary: 'reset', self: stream, args: [resetMarker] },
    ])
    expect(calls.every(call => call.self === md || call.self === stream)).toBe(true)
  })

  it('disposes only the internal runtime and creates a fresh owner on demand', () => {
    const md = getMarkdown('parser-runtime-disposal')
    const first = getParserRuntime(md)
    const nodes = parseMarkdownToStructure('alpha\n\n', md, {
      final: false,
      includeSourceMap: true,
      streamParse: true,
    })

    expect(first.safeMarkdown?.source).toBe('alpha\n\n')
    expect(first.nodeSourceRanges.get(nodes[0]!)).toBeDefined()

    disposeParserRuntime(md)
    const second = getParserRuntime(md)

    expect(first.safeMarkdown).toBeUndefined()
    expect(first.streamParseEnvs.size).toBe(0)
    expect(first.nodeSourceRanges.get(nodes[0]!)).toBeUndefined()
    expect(second).not.toBe(first)
    expect(getParserRuntime(md)).toBe(second)
  })
})
