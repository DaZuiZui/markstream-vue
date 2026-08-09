import type { HighlightNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseHighlightToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: HighlightNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: markText, innerTokens, nextIndex } = collectDelimitedInlineTokens(tokens, startIndex, 'mark_close')

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const node: HighlightNode = {
    type: 'highlight',
    children,
    raw: `==${markText}==`,
  }

  return { node, nextIndex }
}
