import { describe, expect, it } from 'vitest'
import { buildDiffPreviewPanes, createDiffMatchCache } from '../src/diff-preview'

function streamAppends(fullText: string, chunks: number, base: Record<string, unknown> = {}) {
  const cache = createDiffMatchCache()
  let previous = ''
  for (let index = 1; index <= chunks; index++) {
    const end = Math.round((fullText.length * index) / chunks)
    const frame = fullText.slice(0, end)
    const streaming = buildDiffPreviewPanes({
      ...base,
      originalCode: base.originalCode,
      updatedCode: frame,
      loading: true,
      matchCache: cache,
    })
    const full = buildDiffPreviewPanes({
      ...base,
      originalCode: base.originalCode,
      updatedCode: frame,
      loading: true,
    })
    expect(streaming).toEqual(full)
    previous = frame
  }
  expect(previous).toBe(fullText.slice(0, Math.round((fullText.length * chunks) / chunks)))
  const settled = buildDiffPreviewPanes({
    ...base,
    originalCode: base.originalCode,
    updatedCode: fullText,
    loading: false,
    matchCache: cache,
  })
  const fullSettled = buildDiffPreviewPanes({
    ...base,
    originalCode: base.originalCode,
    updatedCode: fullText,
    loading: false,
  })
  expect(settled).toEqual(fullSettled)
}

describe('diff preview streaming (incremental split)', () => {
  it('matches a one-shot computation across many append frames', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`)
    lines[30] = 'changed line'
    streamAppends(lines.join('\n'), 8, { originalCode: lines.join('\n').replace('changed line', 'line 31') })
  })

  it('matches a one-shot computation across many append frames (inline)', () => {
    const lines = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`)
    streamAppends(lines.join('\n'), 6, {
      originalCode: lines.join('\n'),
      inline: true,
    })
  })

  it('keeps the trailing partial line as it is continued by the next frame', () => {
    const cache = createDiffMatchCache()
    const partial = 'first\nsecond\nthi'
    const complete = 'first\nsecond\nthird'
    const streaming = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: partial,
      loading: true,
      matchCache: cache,
    })
    expect(streaming[1].lines.filter(line => line.kind !== 'metadata').at(-1)?.code).toBe('thi')

    const continued = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: complete,
      loading: true,
      matchCache: cache,
    })
    const fresh = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: complete,
      loading: true,
    })
    expect(continued).toEqual(fresh)
    expect(continued[1].lines.filter(line => line.kind !== 'metadata').map(line => line.code)).toEqual(['first', 'second', 'third'])
  })

  it('handles the loading true -> false flip with a trailing newline', () => {
    const cache = createDiffMatchCache()
    const fullText = 'alpha\nbeta\ngamma\n'
    const streaming = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: fullText,
      loading: true,
      matchCache: cache,
    })
    expect(streaming[1].lines.filter(line => line.kind !== 'metadata').map(line => line.code)).toEqual(['alpha', 'beta', 'gamma', ''])

    const settled = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: fullText,
      loading: false,
      matchCache: cache,
    })
    const fresh = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: fullText,
      loading: false,
    })
    // The trailing newline no longer produces an extra empty row once settled.
    expect(settled[1].lines.filter(line => line.kind !== 'metadata').map(line => line.code)).toEqual(['alpha', 'beta', 'gamma'])
    expect(settled).toEqual(fresh)
  })

  it('handles CRLF line endings while streaming', () => {
    const cache = createDiffMatchCache()
    const fullText = 'one\r\ntwo\r\nthree\r\nfour'
    for (let index = 1; index <= fullText.length; index++) {
      const frame = fullText.slice(0, index)
      const streaming = buildDiffPreviewPanes({
        originalCode: '',
        updatedCode: frame,
        loading: true,
        matchCache: cache,
      })
      const fresh = buildDiffPreviewPanes({
        originalCode: '',
        updatedCode: frame,
        loading: true,
      })
      expect(streaming).toEqual(fresh)
    }
  })

  it('resets the split cache when content is replaced instead of appended', () => {
    const cache = createDiffMatchCache()
    buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'keep\nold tail',
      loading: true,
      matchCache: cache,
    })

    const replaced = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'keep\nnew tail',
      loading: true,
      matchCache: cache,
    })
    const fresh = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'keep\nnew tail',
      loading: true,
    })
    expect(replaced).toEqual(fresh)
    expect(replaced[1].lines.filter(line => line.kind !== 'metadata').map(line => line.code)).toEqual(['keep', 'new tail'])
  })

  it('resets the split cache when the content shrinks', () => {
    const cache = createDiffMatchCache()
    buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'a\nb\nc\nd\ne',
      loading: true,
      matchCache: cache,
    })

    const shrunk = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'a\nb',
      loading: true,
      matchCache: cache,
    })
    const fresh = buildDiffPreviewPanes({
      originalCode: '',
      updatedCode: 'a\nb',
      loading: true,
    })
    expect(shrunk).toEqual(fresh)
    expect(shrunk[1].lines.filter(line => line.kind !== 'metadata').map(line => line.code)).toEqual(['a', 'b'])
  })

  it('matches a one-shot computation when the original side also grows', () => {
    const cache = createDiffMatchCache()
    const originalLines = Array.from({ length: 30 }, (_, index) => `orig ${index + 1}`)
    const updatedLines = originalLines.map(line => `${line}!`)
    for (let index = 1; index <= 6; index++) {
      const end = Math.round((originalLines.length * index) / 6)
      const originalFrame = originalLines.slice(0, end).join('\n')
      const updatedFrame = updatedLines.slice(0, end).join('\n')
      const streaming = buildDiffPreviewPanes({
        originalCode: originalFrame,
        updatedCode: updatedFrame,
        loading: true,
        matchCache: cache,
      })
      const fresh = buildDiffPreviewPanes({
        originalCode: originalFrame,
        updatedCode: updatedFrame,
        loading: true,
      })
      expect(streaming).toEqual(fresh)
    }
  })

  it('treats whitespace-only lines (including exotic blanks) as empty identically to trim', () => {
    // U+00a0, U+1680, U+2000-200a, U+2028, U+2029, U+202f, U+205f, U+3000, U+feff
    const whitespaceCharCodes = [
      0x09,
      0x0B,
      0x0C,
      0x20,
      0xA0,
      0x1680,
      0x2000,
      0x2001,
      0x2002,
      0x2003,
      0x2004,
      0x2005,
      0x2006,
      0x2007,
      0x2008,
      0x2009,
      0x200A,
      0x2028,
      0x2029,
      0x202F,
      0x205F,
      0x3000,
      0xFEFF,
    ]
    const whitespaceChars = whitespaceCharCodes.map(code => String.fromCodePoint(code))
    for (const char of whitespaceChars) {
      const panes = buildDiffPreviewPanes({
        originalCode: '',
        updatedCode: `a\n${char}\nb`,
        loading: false,
      })
      const line = panes[1].lines[1]
      expect(line.code, JSON.stringify(char)).toBe(char)
      expect(line.empty, JSON.stringify(char)).toBe(/^\s*$/.test(char))
      expect(/^\s*$/.test(char), JSON.stringify(char)).toBe(char.trim().length === 0)
    }
  })
})
