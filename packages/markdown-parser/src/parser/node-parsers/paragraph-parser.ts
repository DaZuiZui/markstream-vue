import type { MarkdownToken, ParagraphNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from '../inline-parsers/inline-parser-types'

export function parseParagraph(
  tokens: MarkdownToken[],
  index: number,
  options: ParseOptions | undefined,
  parseInlineTokens: ParseInlineTokensFn,
): ParagraphNode {
  const paragraphContentToken = tokens[index + 1]
  const paragraphContent = String(paragraphContentToken.content ?? '')

  return {
    type: 'paragraph',
    children: parseInlineTokens(paragraphContentToken.children || [], paragraphContent, undefined, options),
    raw: paragraphContent,
  }
}
