import type { MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'
import type { InlineParseState } from './inline-parser-state'
import { inferLinkifyDemotionContext } from '../linkifyHeuristics'
import { ensureParseContext } from '../parse-context'
import { cloneTokenWithMutableChildren } from '../token-copy'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import { parseEmojiToken } from './emoji-parser'
import { parseEmphasisToken } from './emphasis-parser'
import { parseFenceToken } from './fence-parser'
import { parseFootnoteRefToken } from './footnote-ref-parser'
import { parseHardbreakToken } from './hardbreak-parser'
import { parseHighlightToken } from './highlight-parser'
import { parseHtmlInlineCodeToken } from './html-inline-code-parser'
import { parseInlineCodeToken } from './inline-code-parser'
import { parseInsertToken } from './insert-parser'
import {
  handleFallbackToken,
  handleImageToken,
  handleLinkOpen,
} from './link-image-recovery'
import { hasEscapedMarkup } from './literal-text-helpers'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { handleTextToken } from './text-token-handler'

export { isLikelyUrl } from './link-image-recovery'

// Process inline tokens (for text inside paragraphs, headings, etc.)
export function parseInlineTokens(
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: ParseOptions,
): ParsedNode[] {
  if (!tokens || tokens.length === 0)
    return []

  let parseContext = ensureParseContext(options)
  const inheritedContext = parseContext.linkifyDemotionContext
  const inferredContext = inferLinkifyDemotionContext(raw)
  const linkifyDemotionContext = {
    filename: inheritedContext?.filename || inferredContext.filename,
    explicitFilename: inheritedContext?.explicitFilename || inferredContext.explicitFilename,
    marketTicker: inheritedContext?.marketTicker || inferredContext.marketTicker,
  }
  if (linkifyDemotionContext.filename || linkifyDemotionContext.explicitFilename || linkifyDemotionContext.marketTicker) {
    parseContext = {
      ...parseContext,
      linkifyDemotionContext,
    } as ParseContext
  }

  options = parseContext
  // Default to strict matching for strong unless caller explicitly sets false
  const requireClosingStrong = options?.requireClosingStrong
  const originalTokens = tokens
  const state: InlineParseState = {
    currentTextNode: null,
    index: 0,
    options: parseContext,
    parseInlineTokens,
    pPreToken,
    raw,
    requireClosingStrong,
    result: [],
    tokens,
    dispatchToken: token => handleToken(token),
    ensureWorkingTokens,
    pushParsed,
    pushText,
    pushToken,
    resetCurrentTextNode,
  }

  function ensureWorkingTokens() {
    if (state.tokens === originalTokens)
      state.tokens = state.tokens.slice()
    return state.tokens
  }

  // Helpers to manage text node merging and pushing parsed nodes
  function resetCurrentTextNode() {
    state.currentTextNode = null
  }

  function pushParsed(node: ParsedNode) {
    // ensure the ongoing text node is closed when pushing non-text nodes
    resetCurrentTextNode()
    state.result.push(node)
  }

  function pushToken(token: MarkdownToken) {
    // push a raw token into result as a ParsedNode (best effort cast)
    resetCurrentTextNode()
    const node = cloneTokenWithMutableChildren(token) as unknown as ParsedNode
    state.result.push(node)
  }

  // backward-compatible alias used by existing call sites that pass parsed nodes
  function pushNode(node: ParsedNode) {
    pushParsed(node)
  }

  function pushText(content: string, raw?: string) {
    if (state.currentTextNode) {
      state.currentTextNode.content += content
      state.currentTextNode.raw += raw ?? content
    }
    else {
      state.currentTextNode = {
        type: 'text',
        content: String(content ?? ''),
        raw: String(raw ?? content ?? ''),
      } as TextNode
      state.result.push(state.currentTextNode)
    }
  }

  function stripTrailingLoadingParenMathOpener(token: MarkdownToken) {
    if (!state.currentTextNode || token.loading !== true || token.markup !== '\\(\\)')
      return

    const previousToken = state.tokens[state.index - 1]
    if (!previousToken || previousToken.type !== 'text' || !hasEscapedMarkup(previousToken, '\\('))
      return

    if (!state.currentTextNode.content.endsWith('('))
      return

    state.currentTextNode.content = state.currentTextNode.content.slice(0, -1)
    if (state.currentTextNode.raw.endsWith('('))
      state.currentTextNode.raw = state.currentTextNode.raw.slice(0, -1)

    if (!state.currentTextNode.content && state.result[state.result.length - 1] === state.currentTextNode) {
      state.result.pop()
      state.currentTextNode = null
    }
  }

  while (state.index < state.tokens.length) {
    const token = state.tokens[state.index] as MarkdownToken
    handleToken(token)
  }

  function handleToken(token: MarkdownToken) {
    switch (token.type) {
      case 'text': {
        handleTextToken(state, token)
        break
      }

      case 'softbreak':
        if (state.currentTextNode) {
          // Append newline to the current text node
          state.currentTextNode.content += '\n'
          state.currentTextNode.raw += '\n' // Assuming raw should also reflect the newline
        }
        else {
          state.currentTextNode = {
            type: 'text',
            content: '\n',
            raw: '\n',
          }
          state.result.push(state.currentTextNode)
        }
        // Don't create a node for softbreak itself, just modify text
        state.index++
        break

      case 'code_inline':
        pushNode(parseInlineCodeToken(token))
        state.index++
        break
      case 'html_inline': {
        const [node, index] = parseHtmlInlineCodeToken(
          token,
          state.tokens,
          state.index,
          parseInlineTokens,
          raw,
          pPreToken,
          options,
        )
        pushNode(node)
        state.index = index
        break
      }

      case 'link_open': {
        handleLinkOpen(state, token)
        break
      }

      case 'image':
        handleImageToken(state, token)
        break

      case 'strong_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrongToken(state.tokens, state.index, parseInlineTokens, token.content, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'em_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseEmphasisToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 's_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrikethroughToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'mark_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseHighlightToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'ins_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseInsertToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'sub_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSubscriptToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'sup_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSuperscriptToken(state.tokens, state.index, parseInlineTokens, options)
        pushNode(node)
        state.index = nextIndex
        break
      }

      case 'sub':
        resetCurrentTextNode()
        pushNode({
          type: 'subscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `~${String(token.content ?? '')}~`,
        })
        state.index++
        break

      case 'sup':
        resetCurrentTextNode()
        pushNode({
          type: 'superscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `^${String(token.content ?? '')}^`,
        })
        state.index++
        break

      case 'emoji': {
        resetCurrentTextNode()
        const preToken = state.tokens[state.index - 1]
        if (preToken?.type === 'text' && /\|:-+/.test(String(preToken.content ?? ''))) {
          // 处理表格中的 emoji，跳过
          pushText('', '')
        }
        else {
          pushNode(parseEmojiToken(token))
        }
        state.index++
        break
      }
      case 'checkbox':
        resetCurrentTextNode()
        pushNode(parseCheckboxToken(token))
        state.index++
        break
      case 'checkbox_input':
        resetCurrentTextNode()
        pushNode(parseCheckboxInputToken(token))
        state.index++
        break
      case 'footnote_ref':
        resetCurrentTextNode()
        pushNode(parseFootnoteRefToken(token))
        state.index++
        break

      case 'footnote_anchor':{
        // Emit a footnote_anchor node so NodeRenderer can render a backlink
        // element (e.g. a small "↩" that scrolls back to the reference).
        resetCurrentTextNode()

        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        pushParsed({
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode)

        state.index++
        break
      }

      case 'hardbreak':
        resetCurrentTextNode()
        pushNode(parseHardbreakToken())
        state.index++
        break

      case 'fence': {
        resetCurrentTextNode()
        // Handle fenced code blocks with language specifications
        pushNode(parseFenceToken(state.tokens[state.index]))
        state.index++
        break
      }

      case 'math_inline': {
        stripTrailingLoadingParenMathOpener(token)
        resetCurrentTextNode()
        // 可能遇到 math_inline text math_inline 的特殊情况，需要合并成一个
        if (!token.content && token.markup === '$' && state.tokens[state.index + 1]?.type === 'text' && state.tokens[state.index + 2]?.type === 'math_inline') {
          pushNode(parseMathInlineToken({
            ...token,
            content: state.tokens[state.index + 1].content,
          }))
          state.index += 2
        }
        else {
          pushNode(parseMathInlineToken(token))
        }
        state.index++
        break
      }

      case 'reference': {
        handleReference(token)
        break
      }

      case 'text_special':{
        // treat as plain text (merge into adjacent text nodes)
        pushText(String(token.content ?? ''), String(token.content ?? ''))
        state.index++
        break
      }

      default: {
        handleFallbackToken(state, token)
        break
      }
    }
  }

  function handleReference(token: MarkdownToken) {
    resetCurrentTextNode()
    pushNode(parseReferenceToken(token))
    state.index++
  }

  return state.result
}
