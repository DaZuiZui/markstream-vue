import type { MarkdownToken, ParsedNode, ParseOptions, SuperscriptNode } from '../../types'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { collectDelimitedInlineTokens } from './token-range'

export function parseSuperscriptToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  options?: ParseOptions,
): {
  node: SuperscriptNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: supText, innerTokens, nextIndex } = collectDelimitedInlineTokens(tokens, startIndex, 'sup_close')

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, options))

  const node: SuperscriptNode = {
    type: 'superscript',
    children:
      children.length > 0
        ? children
        : [
            {
              type: 'text',
              // Fallback to the collected inner text (e.g., "2" in x^2^)
              content: supText || String(tokens[startIndex].content ?? ''),
              raw: supText || String(tokens[startIndex].content ?? ''),
            },
          ],
    raw: `^${supText || String(tokens[startIndex].content ?? '')}^`,
  }

  return { node, nextIndex }
}
