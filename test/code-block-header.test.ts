import { describe, expect, it } from 'vitest'
import { resolveDiffInlineLayout } from '../src/components/CodeBlockNode/codeBlockHeader'

describe('code block lazy header layout', () => {
  it('uses only the public diffStyle option and defaults to split', () => {
    expect(resolveDiffInlineLayout({})).toBe(false)
    expect(resolveDiffInlineLayout({ diffStyle: 'unified' })).toBe(true)
    expect(resolveDiffInlineLayout({
      renderSideBySide: false,
      useInlineViewWhenSpaceIsLimited: true,
      renderSideBySideInlineBreakpoint: 1200,
    })).toBe(false)
  })
})
