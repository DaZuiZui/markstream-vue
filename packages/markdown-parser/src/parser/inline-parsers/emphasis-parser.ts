import type { EmphasisNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseEmphasisToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: EmphasisNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: emText, innerTokens, nextIndex } = collectDelimitedInlineTokens(
    tokens,
    startIndex,
    'em_close',
    undefined,
    true,
  )

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const node: EmphasisNode = {
    type: 'emphasis',
    children,
    raw: `*${emText}*`,
  }

  return { node, nextIndex }
}
