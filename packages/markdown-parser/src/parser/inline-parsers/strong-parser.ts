import type { MarkdownToken, ParsedNode, ParseOptions, StrongNode } from '../../types'
import type { ParseContext } from '../parse-context'
import type { ParseInlineTokensFn } from './inline-parser-types'
import { ensureParseContext } from '../parse-context'
import { ESCAPED_PUNCTUATION_RE } from './literal-text-helpers'
import { collectDelimitedInlineTokens } from './token-range'

function resolveInnerRaw(raw: string | undefined, strongText: string) {
  if (!raw)
    return undefined

  const rawText = String(raw)
  if (!rawText)
    return undefined

  if (rawText === strongText)
    return rawText

  const decodedRawText = rawText.replace(ESCAPED_PUNCTUATION_RE, '$1')
  if (decodedRawText === strongText)
    return rawText

  return undefined
}

export function parseStrongToken(
  tokens: MarkdownToken[],
  startIndex: number,
  parseInlineTokens: ParseInlineTokensFn,
  raw?: string,
  options?: ParseOptions,
): {
  node: StrongNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  const { content: strongText, innerTokens, nextIndex } = collectDelimitedInlineTokens(
    tokens,
    startIndex,
    'strong_close',
    'strong_open',
  )

  // Parse inner tokens to handle nested elements
  const innerOptions: ParseContext = {
    ...ensureParseContext(options),
    insideStrong: true,
  }
  children.push(...parseInlineTokens(innerTokens, resolveInnerRaw(raw, strongText), undefined, innerOptions))

  const node: StrongNode = {
    type: 'strong',
    children,
    raw: `**${String(strongText)}**`,
  }

  return { node, nextIndex }
}
