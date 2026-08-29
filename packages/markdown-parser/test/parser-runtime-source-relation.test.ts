import MarkdownItEngine from 'markdown-it-ts'
import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { getParserRuntime, getSourceAppendRelation } from '../src/parser/runtime'

function semantics() {
  return {
    customHtmlTags: '',
    hasCustomParserExtensions: false,
    includeSourceMap: false,
    postTransformNodes: undefined,
    postTransformTokens: undefined,
    preTransformTokens: undefined,
    requireClosingStrong: undefined,
    reuseStableTopLevelNodes: true,
    streamParse: true as const,
    validateLink: undefined,
  }
}

describe('source append relation', () => {
  it.each([
    [undefined, '', 'none', null],
    ['', '', 'same', null],
    ['', 'x', 'append', 0],
    ['a', 'ab', 'append', 1],
    ['a', '', 'replace', null],
    ['abc', 'ab', 'replace', null],
    ['abc', 'abX', 'replace', null],
    ['a\n', 'a\r\n', 'replace', null],
    ['a😀', 'a😀tail', 'append', 3],
    ['a', 'a\uD83D', 'append', 1],
  ] as const)('classifies %j -> %j', (previous, current, kind, appendStart) => {
    const relation = getSourceAppendRelation(previous, current)
    expect(relation.kind).toBe(kind)
    expect(relation.appendStart).toBe(appendStart)
    expect(relation.currentSource).toBe(current)
  })
})

describe('parser runtime source relation memo', () => {
  it('memoizes one exact pair per cache kind and isolates kinds', () => {
    const runtime = getParserRuntime(new MarkdownItEngine())
    const first = runtime.getSourceRelation('document', 'a', 'ab')
    const replay = runtime.getSourceRelation('document', 'a', 'ab')
    const otherKind = runtime.getSourceRelation('line-offsets', 'a', 'ab')
    const changedPair = runtime.getSourceRelation('document', 'a', 'abc')

    expect(replay).toBe(first)
    expect(otherKind).not.toBe(first)
    expect(otherKind).toEqual(first)
    expect(changedPair).not.toBe(first)
    expect(changedPair.kind).toBe('append')
  })

  it('clears document-scoped memo state on reset and final parse', () => {
    const md = getMarkdown('parser-runtime-source-relation-lifecycle')
    const runtime = getParserRuntime(md)
    const first = runtime.getSourceRelation('document', undefined, 'a')
    expect(runtime.getSourceRelation('document', undefined, 'a')).toBe(first)

    runtime.resetDocument(false)
    const afterReset = runtime.getSourceRelation('document', undefined, 'a')
    expect(afterReset).not.toBe(first)

    parseMarkdownToStructure('a\n\n', md, { final: true, streamParse: false })
    const afterFinal = runtime.getSourceRelation('document', undefined, 'a')
    expect(afterFinal).not.toBe(afterReset)
  })

  it('does not clear pure source relations on stream-only reset', () => {
    const md = getMarkdown('parser-runtime-source-relation-stream-reset')
    const runtime = getParserRuntime(md)
    const relation = runtime.getSourceRelation('tolerant-math', 'a', 'ab')

    runtime.resetStreamOnly()

    expect(runtime.getSourceRelation('tolerant-math', 'a', 'ab')).toBe(relation)
  })

  it('starts a fresh relation sequence after root replacement and final reset', () => {
    const runtime = getParserRuntime(new MarkdownItEngine())
    const rootA = 'root A'
    const rootB = 'root B'

    runtime.beginRootParse(rootA, semantics())
    expect(runtime.getSourceRelation('document', undefined, rootA).kind).toBe('none')

    runtime.beginRootParse(rootB, semantics())
    const rootBAppend = runtime.getSourceRelation('document', rootB, `${rootB}!`)
    expect(rootBAppend.kind).toBe('append')
    expect(rootBAppend.appendStart).toBe(rootB.length)

    runtime.finishRootParse(true)
    runtime.beginRootParse('next root', semantics())
    expect(runtime.getSourceRelation('document', undefined, 'next root').kind).toBe('none')
  })

  it('keeps runtime memo state isolated between markdown-it instances', () => {
    const firstRuntime = getParserRuntime(new MarkdownItEngine())
    const secondRuntime = getParserRuntime(new MarkdownItEngine())
    const first = firstRuntime.getSourceRelation('document', 'a', 'ab')
    const second = secondRuntime.getSourceRelation('document', 'a', 'ab')

    expect(second).not.toBe(first)
  })

  it('does not let nested fragment parsing alter the root source relation', () => {
    const md = getMarkdown('parser-runtime-source-relation-fragment')
    const runtime = getParserRuntime(md)
    const root = '<details><summary>x</summary>child</details>\n\n'
    const nextRoot = `${root}tail\n\n`

    parseMarkdownToStructure(root, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })
    const relationBefore = runtime.getSourceRelation('document', root, nextRoot)
    parseMarkdownToStructure(nextRoot, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })

    expect(runtime.getSourceRelation('document', root, nextRoot)).toBe(relationBefore)
  })

  it('accepts the explicit semantics shape used by the runtime', () => {
    const runtime = getParserRuntime(new MarkdownItEngine())
    runtime.beginRootParse('a', semantics())
    expect(runtime.getSourceRelation('document', undefined, 'a').kind).toBe('none')
  })
})
