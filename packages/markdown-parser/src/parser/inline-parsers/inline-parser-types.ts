import type { MarkdownToken, ParsedNode, ParseOptions } from '../../types'

export type ParseInlineTokensFn = (
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: ParseOptions,
) => ParsedNode[]
