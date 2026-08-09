import type { MarkdownToken, ParsedNode, ParseOptions, SubscriptNode } from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseSubscriptToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: SubscriptNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: subText, innerTokens, nextIndex } = collectDelimitedInlineTokens(tokens, startIndex, 'sub_close')

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const startContent = String(tokens[startIndex].content ?? '')
  const display = subText || startContent
  const node: SubscriptNode = {
    type: 'subscript',
    children: children.length > 0
      ? children
      : [
          {
            type: 'text',
            // Fallback to the collected inner text (e.g., "2" in H~2~O)
            content: display,
            raw: display,
          },
        ],
    raw: `~${display}~`,
  }

  return { node, nextIndex }
}
