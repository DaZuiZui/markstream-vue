import type { MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'
import type { InlineParseState } from './inline-parser-state'
import { inferLinkifyDemotionContext } from '../linkifyHeuristics'
import { ensureParseContext } from '../parse-context'
import { cloneTokenWithMutableChildren } from '../token-copy'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import {
  countUnescapedAsterisks,
  findLiteralIntrawordAsteriskRunPairEnd,
  findNextStrongClose,
  findNextUnescapedAsterisk,
  findNextUnescapedEmphasisClose,
  findTripleAsteriskClose,
  getAsteriskRunInfo,
  isEmphasisOpenDelimiter,
  isStrongOpenDelimiter,
  isTripleAsteriskInnerText,
  isWordChar,
  isWordOnly,
} from './delimiter-helpers'
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
  handleInlineImageContent,
  handleInlineLinkContent,
  handleLinkOpen,
  isMarkdownLinkBeforeLinkifiedUrl,
  recoverOuterImageLinkFromRawText,
  recoverOuterImageLinkMidStateFromText,
} from './link-image-recovery'
import {
  decodeVisibleTextFromRaw,
  ESCAPED_PUNCTUATION_RE,
  getInlineTextMarkerFlags,
  hasEscapedMarkup,
  INLINE_CANDIDATE_MARKERS,
  INLINE_TEXT_MARKER_BACKSLASH,
  INLINE_TEXT_MARKER_BACKTICK,
  INLINE_TEXT_MARKER_BANG,
  INLINE_TEXT_MARKER_CLOSE_BRACKET,
  INLINE_TEXT_MARKER_DOLLAR,
  INLINE_TEXT_MARKER_OPEN_BRACKET,
  INLINE_TEXT_MARKER_OPEN_PAREN,
  stripTrailingMidStateMarker,
} from './literal-text-helpers'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { parseTextToken } from './text-parser'

// Precompiled regexes used frequently in inline parsing
const STRIKETHROUGH_RE = /[^~]*~{2,}[^~]+/
const HAS_STRONG_RE = /\*\*/
const INLINE_REPARSE_MARKER_RE = /[[_*^~]/

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

  function handleEmphasisAndStrikethrough(content: string, token: MarkdownToken): boolean {
    const rawSource = state.tokens.length === 1 ? raw : String(token.content ?? '')
    const markerCandidates: Array<{ type: 'strong' | 'emphasis' | 'strikethrough', index: number }> = []
    const literalIntrawordRunPairEnd = findLiteralIntrawordAsteriskRunPairEnd(content)
    if (literalIntrawordRunPairEnd !== -1) {
      pushText(content.slice(0, literalIntrawordRunPairEnd), content.slice(0, literalIntrawordRunPairEnd))
      const afterContent = content.slice(literalIntrawordRunPairEnd)
      if (afterContent) {
        handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        state.index--
      }
      state.index++
      return true
    }

    if (STRIKETHROUGH_RE.test(content)) {
      const idx = content.indexOf('~~')
      if (idx !== -1)
        markerCandidates.push({ type: 'strikethrough', index: idx })
    }

    if (HAS_STRONG_RE.test(content)) {
      const idx = content.indexOf('**')
      if (idx !== -1)
        markerCandidates.push({ type: 'strong', index: idx })
    }

    if (/[^*]*\*[^*]+/.test(content)) {
      const idx = rawSource
        ? findNextUnescapedAsterisk(rawSource, 0)
        : content.indexOf('*')
      if (rawSource && idx === -1)
        return false
      if (idx !== -1)
        markerCandidates.push({ type: 'emphasis', index: idx })
    }

    markerCandidates.sort((a, b) => {
      if (a.index !== b.index)
        return a.index - b.index

      if (a.type === b.type)
        return 0

      // Prefer `**` over `*` when both point at the same run.
      if (a.type === 'strong')
        return -1
      if (b.type === 'strong')
        return 1
      return 0
    })

    const nextMarker = markerCandidates[0]
    if (!nextMarker)
      return false

    // strikethrough (~~)
    if (nextMarker.type === 'strikethrough') {
      const idx = nextMarker.index
      const beforeText = idx > -1 ? content.slice(0, idx) : ''
      if (beforeText)
        pushText(beforeText, beforeText)

      if (idx === -1) {
        state.index++
        return true
      }

      const closeIdx = content.indexOf('~~', idx + 2)
      const inner = closeIdx === -1 ? content.slice(idx + 2) : content.slice(idx + 2, closeIdx)
      const after = closeIdx === -1 ? '' : content.slice(closeIdx + 2)

      const { node } = parseStrikethroughToken([
        { type: 's_open', tag: 's', content: '', markup: '~~', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 's_close', tag: 's', content: '', markup: '~~', info: '', meta: null },
      ], 0, parseInlineTokens, options)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        handleToken({
          type: 'text',
          content: after,
          raw: after,
        })
        state.index--
      }

      state.index++
      return true
    }

    // strong (**)
    // Note: markdown-it may sometimes leave `**...**` as a plain text token
    // (e.g. when wrapping inline HTML like `<font>...</font>`). In that case,
    // we still want to recognize and parse the first strong pair.
    if (nextMarker.type === 'strong') {
      const openIdx = nextMarker.index
      const beforeText = openIdx > -1 ? content.slice(0, openIdx) : ''
      if (beforeText) {
        pushText(beforeText, beforeText)
      }

      if (openIdx === -1) {
        state.index++
        return true
      }

      // Check if the leading ** are from escaped asterisks
      // by checking if the raw markdown has \* at the corresponding position
      if (raw && openIdx === 0) {
        // Find where this content would start in raw
        // We need to check if the position in raw has \*
        let rawHasEscapedAsteriskAtStart = false
        let asteriskCount = 0
        // Count how many asterisks are at the start of content
        while (asteriskCount < content.length && content[asteriskCount] === '*') {
          asteriskCount++
        }
        // Check if raw has \* at the beginning (accounting for escaped backslashes)
        if (raw.startsWith('\\*')) {
          rawHasEscapedAsteriskAtStart = true
        }

        // If raw starts with escaped asterisks, don't parse as strong
        if (rawHasEscapedAsteriskAtStart) {
          // Check if all asterisks in content prefix are escaped in raw
          let escapedCount = 0
          let j = 0
          while (j < raw.length && escapedCount < asteriskCount) {
            if (raw[j] === '\\' && j + 1 < raw.length && raw[j + 1] === '*') {
              escapedCount += 1
              j += 2
            }
            else if (raw[j] === '*') {
              // Found unescaped asterisk, stop checking
              break
            }
            else {
              j++
            }
          }
          // If all leading asterisks in content are escaped in raw, treat as text
          if (escapedCount >= 2) {
            pushText(content, content)
            state.index++
            return true
          }
        }
      }

      // Fallback check: count asterisks in content vs unescaped asterisks in raw
      // This handles cases like `需方：\*\*\*\*\*\*有限公司`
      if (raw) {
        const contentAsteriskCount = (content.match(/\*/g) || []).length
        const rawAsteriskCount = countUnescapedAsterisks(raw)
        if (contentAsteriskCount > rawAsteriskCount) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          state.index++
          return true
        }
      }

      const runInfo = getAsteriskRunInfo(content, openIdx)
      if (runInfo.len >= 3) {
        const closeIndex = findTripleAsteriskClose(content, openIdx + runInfo.len)
        if (closeIndex !== -1) {
          const inner = content.slice(openIdx + runInfo.len, closeIndex)
          if (isTripleAsteriskInnerText(inner)) {
            const { node } = parseStrongToken([
              { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
              { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
              { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
              { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
              { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
            ], 0, parseInlineTokens, raw, options)

            resetCurrentTextNode()
            pushNode(node)

            const afterContent = content.slice(closeIndex + 3)
            if (afterContent) {
              handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
              state.index--
            }

            state.index++
            return true
          }
        }
      }
      if (!isStrongOpenDelimiter(content, openIdx)) {
        const literalRun = content.slice(openIdx, openIdx + runInfo.len)
        pushText(literalRun, literalRun)
        const afterContent = content.slice(openIdx + runInfo.len)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          state.index--
        }
        state.index++
        return true
      }

      const close = findNextStrongClose(content, openIdx + 2)
      let inner = ''
      let after = ''
      if (close.index !== -1) {
        inner = content.slice(openIdx + 2, close.index)
        after = content.slice(close.index + 2)
        const closeIdx = close.index
        const closeRunInfo = getAsteriskRunInfo(content, closeIdx)
        if (
          runInfo.intraword
          && closeRunInfo.intraword
          && !isWordOnly(inner)
        ) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          state.index++
          return true
        }
        if (!inner && runInfo.len >= 4 && runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          state.index++
          return true
        }
      }
      else {
        // no closing pair found: decide behavior based on strict option
        if (requireClosingStrong || close.sawInvalidClose) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          state.index++
          return true
        }
        if (runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          state.index++
          return true
        }
        // 非严格模式（原行为）：mid-state, take rest as inner
        inner = content.slice(openIdx + 2)
        after = ''
      }

      // Special case: if the matched strong is empty (e.g., `****`) and the
      // remaining content is also just asterisks, treat the entire thing as text
      // to avoid creating empty strong nodes from escaped asterisks.
      if (!inner && /^\*+$/.test(after)) {
        // The entire content is just asterisks, treat as text
        pushText(content, content)
        state.index++
        return true
      }

      const { node } = parseStrongToken([
        { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
      ], 0, parseInlineTokens, raw, options)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        handleToken({
          type: 'text',
          content: after,
          raw: after,
        })
        state.index--
      }

      state.index++
      return true
    }

    // emphasis (*)
    if (nextMarker.type === 'emphasis') {
      let idx = nextMarker.index
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        pushText(_text, _text)
      }
      if (!isEmphasisOpenDelimiter(content, idx)) {
        pushText(content[idx], content[idx])
        const afterContent = content.slice(idx + 1)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          state.index--
        }
        state.index++
        return true
      }
      const runInfo = getAsteriskRunInfo(content, idx)
      const close = findNextUnescapedEmphasisClose(rawSource, content, idx + 1)
      const closeIndex = close.index
      const nextInlineToken = state.tokens[state.index + 1]
      if (
        options?.final
        && nextInlineToken?.type === 'em_open'
        && closeIndex !== -1
        && content.slice(idx + 1, closeIndex).trim() !== content.slice(idx + 1, closeIndex)
      ) {
        pushText(content.slice(idx), content.slice(idx))
        state.index++
        return true
      }
      if (closeIndex === -1 && (close.sawInvalidClose || options?.final || runInfo.intraword || !isWordChar(content[idx + 1]))) {
        pushText(content.slice(idx), content.slice(idx))
        state.index++
        return true
      }
      const emphasisContent = closeIndex > -1
        ? content.slice(idx + 1, closeIndex)
        : content.slice(idx + 1)
      const { node } = parseEmphasisToken([
        { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: emphasisContent, markup: '', info: '', meta: null },
        { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
      ], 0, parseInlineTokens, options)

      resetCurrentTextNode()
      pushNode(node)

      if (closeIndex !== -1 && closeIndex < content.length - 1) {
        const afterContent = content.slice(closeIndex + 1)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          state.index--
        }
      }
      state.index++
      return true
    }

    return false
  }

  function handleInlineCodeContent(content: string, _token: MarkdownToken): boolean {
    // Need at least one backtick to consider inline code
    if (!content.includes('`'))
      return false

    const findFirstUnescapedBacktick = (src: string) => {
      for (let idx = 0; idx < src.length; idx++) {
        if (src[idx] !== '`')
          continue
        let slashCount = 0
        for (let j = idx - 1; j >= 0 && src[j] === '\\'; j--)
          slashCount++
        if (slashCount % 2 === 0)
          return idx
      }
      return -1
    }

    const codeStart = findFirstUnescapedBacktick(content)
    if (codeStart === -1)
      return false
    // Determine the length of the opening backtick run (supports ``code``)
    let runLen = 1
    for (let k = codeStart + 1; k < content.length && content[k] === '`'; k++)
      runLen++

    // Find a matching closing run of the same length
    const closingSeq = '`'.repeat(runLen)
    const searchFrom = codeStart + runLen
    const codeEnd = content.indexOf(closingSeq, searchFrom)

    // If no matching closing run is found within this token stream, treat as mid-state.
    if (codeEnd === -1) {
      // Mid-state handling: for single backtick, emit an inline_code node so
      // editors can style it while typing; for multi-backtick runs, keep it as
      // plain text to avoid over-eager code spans.
      if (runLen === 1) {
        // beforeText 可能包含 strong/emphasis，需要递归处理
        const beforeText = content.slice(0, codeStart)
        const codeContent = content.slice(codeStart + 1)
        if (beforeText) {
          const handled = handleEmphasisAndStrikethrough(beforeText, _token)
          if (!handled)
            pushText(beforeText, beforeText)
          else
            state.index--
        }

        pushParsed({ type: 'inline_code', code: codeContent, raw: String(codeContent) } as ParsedNode)
        state.index++
        return true
      }

      // For `` or longer mid-states, treat as text fallback (non-recursive)
      let merged = content
      for (let j = state.index + 1; j < state.tokens.length; j++)
        merged += String((state.tokens[j].content ?? '') + (state.tokens[j].markup ?? ''))
      state.index = state.tokens.length - 1
      pushText(merged, merged)
      state.index++
      return true
    }

    // Close the current text node and handle the text before the code span
    resetCurrentTextNode()
    const beforeText = content.slice(0, codeStart)
    const codeContent = content.slice(codeStart + runLen, codeEnd)
    const after = content.slice(codeEnd + runLen)

    if (beforeText) {
      // Try to parse emphasis/strong inside the pre-code fragment, without
      // advancing the outer token cursor permanently.
      const handled = handleEmphasisAndStrikethrough(beforeText, _token)
      if (!handled)
        pushText(beforeText, beforeText)
      else
        state.index--
    }

    pushParsed({
      type: 'inline_code',
      code: codeContent,
      raw: String(codeContent ?? ''),
    } as ParsedNode)

    if (after) {
      handleToken({ type: 'text', content: after, raw: after } as unknown as MarkdownToken)
      state.index--
    }
    state.index++
    return true
  }

  function tryReparseCollapsedInlineText(rawContent: string): ParsedNode[] | null {
    const md = parseContext.markdownIt
    if (!md)
      return null
    if (state.tokens.length <= 1 || !state.tokens.some(token => token?.type === 'math_inline'))
      return null
    if (!INLINE_REPARSE_MARKER_RE.test(rawContent))
      return null

    const reparsed = md.parseInline(rawContent, { __markstreamFinal: !!options?.final }) as unknown as MarkdownToken[]
    if (!Array.isArray(reparsed) || reparsed.length === 0)
      return null

    const inlineToken = reparsed.find(token => token?.type === 'inline')
    const children = (inlineToken?.children ?? [])
      .filter(child => !(child?.type === 'text' && String(child.content ?? '') === ''))

    if (!children.length)
      return null
    if (!children.some(child => child?.type !== 'text'))
      return null
    if (children.length === 1 && children[0]?.type === 'text' && String(children[0].content ?? '') === rawContent)
      return null

    const reparsedNodes = parseInlineTokens(children, rawContent, pPreToken, options)
    return reparsedNodes.length ? reparsedNodes : null
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
        handleTextToken(token)
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

  function commitTextNode(
    content: string,
    token: MarkdownToken,
    preToken?: MarkdownToken,
    nextToken?: MarkdownToken,
    markerFlags = getInlineTextMarkerFlags(content),
  ) {
    const textNode = parseTextToken({ ...token, content })

    if (state.currentTextNode) {
      // Merge with the previous text node. The mid-state marker strip only
      // applies to streaming tails; final parses must keep real trailing
      // characters (`(`, `*`, `\`) intact.
      state.currentTextNode.content += options?.final
        ? textNode.content
        : stripTrailingMidStateMarker(textNode.content, token, markerFlags)
      state.currentTextNode.raw += textNode.raw
      return
    }

    const maybeMath = preToken?.tag === 'br' && state.tokens[state.index - 2]?.content === '['
    if (!nextToken) {
      textNode.content = options?.final
        ? textNode.content
        : stripTrailingMidStateMarker(textNode.content, token, markerFlags)
    }

    state.currentTextNode = textNode
    state.currentTextNode.center = maybeMath
    state.result.push(state.currentTextNode)
  }

  function handleTextToken(token: MarkdownToken) {
    // 合并连续的 text 节点
    const rawContent = String(token.content ?? '')
    const rawMarkerFlags = getInlineTextMarkerFlags(rawContent)
    const rawHasBackslash = (rawMarkerFlags & INLINE_TEXT_MARKER_BACKSLASH) !== 0
    const rawSource = state.tokens.length === 1 && rawHasBackslash && typeof raw === 'string'
      ? String(raw)
      : ''
    let content = rawSource
      ? decodeVisibleTextFromRaw(rawSource)
      : rawHasBackslash
        ? rawContent.replace(ESCAPED_PUNCTUATION_RE, '$1')
        : rawContent
    const markerFlags = content === rawContent
      ? rawMarkerFlags
      : getInlineTextMarkerFlags(content)

    if (token.content === '<' || (content === '1' && state.tokens[state.index - 1]?.tag === 'br')) {
      state.index++
      return
    }

    // math 公式 $ 只出现一个并且在末尾，优化掉
    const dollarIndex = (markerFlags & INLINE_TEXT_MARKER_DOLLAR) !== 0
      ? content.indexOf('$')
      : -1
    if (dollarIndex !== -1 && dollarIndex === content.lastIndexOf('$') && content.endsWith('$'))
      content = content.slice(0, -1)

    // 处理 undefined 结尾的问题
    if (content.endsWith('undefined') && !raw?.endsWith('undefined')) {
      content = content.slice(0, -9)
    }
    let trailingTextStart = state.result.length
    let trailingTextContent = ''
    for (let index = state.result.length - 1; index >= 0; index--) {
      const item = state.result[index]
      if (item.type !== 'text')
        break
      trailingTextStart = index
      trailingTextContent = String(item.content ?? '') + trailingTextContent
    }
    if (trailingTextStart < state.result.length) {
      // Some mid-state token streams resend the full trailing text chunk. Only
      // replace the existing text tail when the incoming token clearly starts
      // with that exact tail; otherwise keep the previous text nodes so later
      // inline parsing (for example an opening backtick) cannot accidentally
      // drop the already-rendered sibling text.
      if (content.startsWith(trailingTextContent)) {
        state.currentTextNode = null
        state.result.length = trailingTextStart
      }
      else {
        state.currentTextNode = state.result[state.result.length - 1] as TextNode
      }
    }

    const nextToken = state.tokens[state.index + 1]
    if (
      ((content === '`' || content === '|' || content === '$') && !hasEscapedMarkup(token, `\\${content}`))
      || (/^\*+$/.test(content) && !hasEscapedMarkup(token, '\\*'))
    ) {
      state.index++
      return
    }
    if (!nextToken && options?.final !== true && (markerFlags & INLINE_TEXT_MARKER_OPEN_PAREN) !== 0 && /[^\]]\s*\(\s*$/.test(content))
      content = content.replace(/\(\s*$/, '')
    if (!content) {
      state.index++
      return
    }

    if (
      (markerFlags & (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)) === (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)
      && recoverOuterImageLinkFromRawText(state, content)
    ) {
      return
    }

    if (
      (markerFlags & (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)) === (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)
      && recoverOuterImageLinkMidStateFromText(state, content)
    ) {
      return
    }

    const hasInlineCandidates = (markerFlags & INLINE_CANDIDATE_MARKERS) !== 0
    if (!hasInlineCandidates) {
      commitTextNode(content, token, state.tokens[state.index - 1], nextToken, markerFlags)
      state.index++
      return
    }

    if ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && handleCheckboxLike(content))
      return
    const preToken = state.tokens[state.index - 1]
    if (
      ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && content === '[' && !nextToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\['))
      || ((markerFlags & INLINE_TEXT_MARKER_CLOSE_BRACKET) !== 0 && content === ']' && !preToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\]'))
    ) {
      state.index++
      return
    }
    // Use raw token content for inline-code fallback parsing so backslashes
    // inside code spans are preserved (e.g. `\\(...\\)`).
    if ((markerFlags & INLINE_TEXT_MARKER_BACKTICK) !== 0 && handleInlineCodeContent(rawContent, token))
      return

    if (
      (markerFlags & (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)) === (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)
      && handleInlineImageContent(state, content)
    ) {
      return
    }

    // Avoid synthesizing links from raw text only when the next token is
    // already a structured link_open. This prevents duplicates while still
    // allowing fallback for later tricky links in the same inline run.
    if (
      (markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0
      && (state.tokens[state.index + 1]?.type !== 'link_open' || isMarkdownLinkBeforeLinkifiedUrl(state, content))
      && handleInlineLinkContent(state, content, token)
    ) {
      return
    }

    const reparsedNodes = tryReparseCollapsedInlineText(rawContent)
    if (reparsedNodes) {
      resetCurrentTextNode()
      for (const node of reparsedNodes)
        pushNode(node)
      state.index++
      return
    }

    if (handleEmphasisAndStrikethrough(content, token))
      return

    // Emit remaining text token
    commitTextNode(content, token, preToken, nextToken, markerFlags)
    state.index++
  }

  function handleReference(token: MarkdownToken) {
    resetCurrentTextNode()
    pushNode(parseReferenceToken(token))
    state.index++
  }

  function handleCheckboxLike(content: string): boolean {
    // Detect checkbox-like syntax at the start of a list item e.g. [x] or [ ]
    if (!(content?.startsWith('[') && pPreToken?.type === 'list_item_open'))
      return false

    const _content = content.slice(1)
    const w = _content.match(/[^\s\]]/)
    if (w === null) {
      state.index++
      return true
    }
    // If the first non-space/']' char is x/X treat as a checkbox input
    if (w && /x/i.test(w[0])) {
      const checked = w[0] === 'x' || w[0] === 'X'
      pushParsed({
        type: 'checkbox_input',
        checked,
        raw: checked ? '[x]' : '[ ]',
      } as ParsedNode)
      state.index++
      return true
    }

    return false
  }

  return state.result
}
