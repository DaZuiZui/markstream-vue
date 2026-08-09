import type {
  MarkdownToken,
  ParsedNode,
  ParseOptions,
  StrikethroughNode,
} from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseStrikethroughToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: StrikethroughNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: sText, innerTokens, nextIndex } = collectDelimitedInlineTokens(tokens, startIndex, 's_close')

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const node: StrikethroughNode = {
    type: 'strikethrough',
    children,
    raw: `~~${sText}~~`,
  }

  return { node, nextIndex }
}
