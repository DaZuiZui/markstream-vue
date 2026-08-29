import { describe, expect, it } from 'vitest'
import { getSourceAppendRelation } from '../src/parser/runtime'

describe('source append relation', () => {
  it.each([
    [undefined, '', 'none'],
    ['', '', 'same'],
    ['', 'x', 'append'],
    ['a', 'ab', 'append'],
    ['a', '', 'replace'],
    ['abc', 'ab', 'replace'],
    ['abc', 'abX', 'replace'],
    ['a\n', 'a\r\n', 'replace'],
    ['a😀', 'a😀tail', 'append'],
    ['a', 'a\uD83D', 'append'],
  ] as const)('classifies %j -> %j', (previous, current, kind) => {
    expect(getSourceAppendRelation(previous, current)).toBe(kind)
  })
})
