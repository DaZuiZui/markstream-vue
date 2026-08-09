import type { InsertNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseInsertToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: InsertNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: insText, innerTokens, nextIndex } = collectDelimitedInlineTokens(tokens, startIndex, 'ins_close')

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const node: InsertNode = {
    type: 'insert',
    children,
    raw: `++${String(insText)}++`,
  }

  return { node, nextIndex }
}
