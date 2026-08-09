import type { MarkdownToken, ParsedNode, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'
import type { ParseInlineTokensFn } from './inline-parser-types'

export interface InlineParseState {
  currentTextNode: TextNode | null
  index: number
  readonly options: ParseContext
  readonly parseInlineTokens: ParseInlineTokensFn
  readonly pPreToken?: MarkdownToken
  readonly raw?: string
  readonly requireClosingStrong?: boolean
  readonly result: ParsedNode[]
  tokens: MarkdownToken[]
  readonly dispatchToken: (token: MarkdownToken) => void
  readonly ensureWorkingTokens: () => MarkdownToken[]
  readonly pushParsed: (node: ParsedNode) => void
  readonly pushText: (content: string, raw?: string) => void
  readonly pushToken: (token: MarkdownToken) => void
  readonly resetCurrentTextNode: () => void
}
