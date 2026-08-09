import type { MarkdownIt, Token } from '../markdown-it-types'
import type { HtmlBlockNode, InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions } from '../types'
import { normalizeCustomHtmlTags } from '../customHtmlTags'
import { NON_STRUCTURING_HTML_TAGS, VOID_HTML_TAGS } from '../htmlTags'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes, parseTagAttrs } from '../htmlTagUtils'
import { parseInlineTokens } from './inline-parsers'
import { createLinkifyDemotionContextTracker } from './linkifyHeuristics'
import { parseCommonBlockToken } from './node-parsers/block-token-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { containerTokenHandlers } from './node-parsers/container-token-handlers'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
import { parseHtmlBlock } from './node-parsers/html-block-parser'
import { parseList } from './node-parsers/list-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'
import { applyNodeSourceMap, createSourceMapFromOffsets } from './node-source-map'
import { processTopLevelTokensWithReuse } from './reuse/structured-node-reuse'
import { createSourceLineMapper } from './source-line-mapper'
import { clearSafeMarkdownCache, getSafeMarkdown } from './streaming/safe-markdown'
import {
  parseTopLevelTokens,
  resetTopLevelTokenizerForFinalAutoParse,
  shouldUseTopLevelStreamParse,
} from './streaming/tokenizer'

type ParsedNodeWithFields = ParsedNode & {
  children?: ParsedNode[]
  content?: unknown
  tag?: unknown
}

const internalNodeSourceRanges = new WeakMap<object, { start: number, end: number }>()
const sourceLineOffsetsCache = new WeakMap<object, number[]>()
const siblingHtmlChildrenCache = new WeakMap<object, {
  blocks: string[]
  children: ParsedNode[][]
  customHtmlTags: string
  final: boolean
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}>()

function recordInternalNodeSourceRange(node: ParsedNode, token: MarkdownToken | undefined, options?: ParseOptions) {
  const map = token?.map
  const internalOptions = options as InternalParseOptions | undefined
  const source = internalOptions?.__sourceMarkdown
  if (!Array.isArray(map) || map.length < 2 || typeof source !== 'string' || !options)
    return

  const startLine = Number(map[0])
  const endLine = Number(map[1])
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine))
    return

  let offsets = sourceLineOffsetsCache.get(options)
  if (!offsets) {
    offsets = [0]
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n')
        offsets.push(i + 1)
    }
    sourceLineOffsetsCache.set(options, offsets)
  }

  internalNodeSourceRanges.set(node, {
    start: offsets[Math.max(0, Math.trunc(startLine))] ?? source.length,
    end: offsets[Math.max(0, Math.trunc(endLine))] ?? source.length,
  })
}

interface ParseTimingMetrics {
  tokenCloneMs?: number
  processTokensInputTokens?: number
  processTokensReusedTopLevelNodes?: number
  processTokensMs?: number
  /** Wall time of the streaming-safe markdown pre-processing chain. */
  safeMarkdownMs?: number
  /** Wall time of markdown-it tokenization (stream or sync). */
  tokenizeMs?: number
  /** Wall time of the top-level html_block merge/combine/structure passes. */
  htmlBlockPassesMs?: number
  parseMarkdownToStructureTotalMs?: number
}

type TimedParseOptions = ParseOptions & {
  __timing?: ParseTimingMetrics
}

function getNodeFields(node: ParsedNode) {
  return node as ParsedNodeWithFields
}

function getParserNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function addTiming(metrics: ParseTimingMetrics | undefined, key: keyof ParseTimingMetrics, value: number) {
  if (!metrics)
    return

  metrics[key] = (metrics[key] ?? 0) + value
}

function getParseTiming(options: ParseOptions) {
  return (options as TimedParseOptions).__timing
}

function finishTimedParse<T extends ParsedNode[]>(result: T, timing: ParseTimingMetrics | undefined, startedAt: number) {
  if (timing)
    addTiming(timing, 'parseMarkdownToStructureTotalMs', getParserNow() - startedAt)

  return result
}

function applyPostTransformNodes<T extends ParsedNode[]>(nodes: T, options: ParseOptions): T | ParsedNode[] {
  const transform = options.postTransformNodes
  if (typeof transform !== 'function')
    return nodes

  const transformed = transform(nodes)
  return Array.isArray(transformed) ? transformed : nodes
}

function finishParsedNodes<T extends ParsedNode[]>(
  result: T,
  options: ParseOptions,
  timing: ParseTimingMetrics | undefined,
  startedAt: number,
) {
  return finishTimedParse(applyPostTransformNodes(result, options), timing, startedAt)
}

function processTokensWithTiming(tokens: MarkdownToken[], options: ParseOptions | undefined, timing: ParseTimingMetrics | undefined) {
  if (!timing)
    return processTokens(tokens, options)

  addTiming(timing, 'processTokensInputTokens', tokens.length)
  const startedAt = getParserNow()
  const result = processTokens(tokens, options)
  addTiming(timing, 'processTokensMs', getParserNow() - startedAt)
  return result
}

function getCustomHtmlTagSet(options?: ParseOptions) {
  const custom = options?.customHtmlTags
  if (!Array.isArray(custom) || custom.length === 0)
    return null

  const normalized = normalizeCustomHtmlTags(custom)
  return normalized.length ? new Set(normalized) : null
}

function stringifyInlineNodeRaw(node: ParsedNode) {
  const raw = node.raw
  if (typeof raw === 'string')
    return raw

  const content = getNodeFields(node).content
  if (typeof content === 'string')
    return content

  if (node.type === 'hardbreak')
    return '<br>'

  return ''
}

function buildParagraphFromInlineChildren(children: ParsedNode[]): ParsedNode {
  return {
    type: 'paragraph',
    children,
    raw: children.map(stringifyInlineNodeRaw).join(''),
  } as ParsedNode
}

function inheritSourceMap(nodes: ParsedNode[], sourceNode: ParsedNode) {
  if (!sourceNode.sourceMap)
    return

  for (const node of nodes) {
    if (!node.sourceMap)
      node.sourceMap = sourceNode.sourceMap
  }
}

function maybePromoteCustomNodeFromParagraph(node: ParsedNode, options?: ParseOptions) {
  if (node.type !== 'paragraph')
    return null

  const nodeChildren = getNodeFields(node).children
  const children: ParsedNode[] = Array.isArray(nodeChildren) ? nodeChildren : []
  if (children.length === 0)
    return null

  const customTagSet = getCustomHtmlTagSet(options)
  if (!customTagSet?.size)
    return null

  let customIndex = -1
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!customTagSet.has(String(child?.type ?? '').toLowerCase()))
      continue

    const prefixChildren = children.slice(0, i)
    const childContent = String(getNodeFields(child).content ?? '')
    if (!childContent.trim())
      continue
    const prefixHasHardbreak = prefixChildren.some(prefixChild => prefixChild?.type === 'hardbreak')
    if (!prefixHasHardbreak) {
      continue
    }

    customIndex = i
    break
  }
  if (customIndex === -1)
    return null

  const prefixChildren = children.slice(0, customIndex)
  const promoted = children[customIndex]
  if (!promoted)
    return null

  const result: ParsedNode[] = []
  if (prefixChildren.length)
    result.push(buildParagraphFromInlineChildren(prefixChildren))

  result.push(promoted)

  const suffixChildren = children.slice(customIndex + 1)
  if (suffixChildren.length)
    result.push(buildParagraphFromInlineChildren(suffixChildren))

  return result
}

function parseStandaloneHtmlDocument(markdown: string): ParsedNode[] | null {
  const trimmed = markdown.trim()
  if (!trimmed)
    return null

  const startsLikeHtmlDocument = /^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s[^>]*)?>/i.test(trimmed)
  const endsWithHtmlClose = /<\/html>\s*$/i.test(trimmed)
  if (!startsLikeHtmlDocument || !endsWithHtmlClose)
    return null

  return [
    {
      type: 'html_block',
      tag: 'html',
      raw: markdown,
      content: markdown,
      loading: false,
    } as ParsedNode,
  ]
}

function getMergeableNodeRaw(node: ParsedNode) {
  const raw = node.raw
  if (typeof raw === 'string')
    return raw

  const content = getNodeFields(node).content
  if (typeof content === 'string')
    return content

  return ''
}

function isCloseOnlyHtmlBlockForTag(node: ParsedNode, tag: string) {
  if (node.type !== 'html_block' || !tag)
    return false

  const raw = String(node.raw ?? node.content ?? '')
  return new RegExp(String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>\s*$`, 'i').test(raw)
}

const RAW_TEXT_HTML_TAGS = new Set(['iframe', 'script', 'style', 'textarea', 'title'])

function findNextHtmlBlockFromSource(source: string, tag: string, startIndex: number) {
  if (!source || !tag)
    return null

  const lowerTag = tag.toLowerCase()
  const readMarkup = (start: number) => {
    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4)
      return {
        closing: false,
        end: commentEnd === -1 ? source.length : commentEnd + 3,
        selfClosing: false,
        tag: '',
      }
    }

    if (source.startsWith('<![CDATA[', start)) {
      const cdataEnd = source.indexOf(']]>', start + 9)
      return {
        closing: false,
        end: cdataEnd === -1 ? source.length : cdataEnd + 3,
        selfClosing: false,
        tag: '',
      }
    }

    const endRel = findTagCloseIndexOutsideQuotes(source.slice(start))
    if (endRel === -1)
      return null

    const end = start + endRel + 1
    const raw = source.slice(start, end)
    if (/^<\s*[!?]/.test(raw)) {
      return {
        closing: false,
        end,
        selfClosing: false,
        tag: '',
      }
    }

    let body = raw.slice(1).trimStart()
    const closing = body.startsWith('/')
    if (closing)
      body = body.slice(1).trimStart()
    const tagMatch = body.match(/^([A-Z][\w:-]*)/i)
    if (!tagMatch?.[1]) {
      return {
        closing: false,
        end: start + 1,
        selfClosing: false,
        tag: '',
      }
    }

    return {
      closing,
      end,
      selfClosing: /\/\s*>$/.test(raw),
      tag: tagMatch[1].toLowerCase(),
    }
  }

  const findRawTextClose = (rawTextTag: string, from: number) => {
    const closeRe = new RegExp(String.raw`<\s*\/\s*${escapeTagForRegExp(rawTextTag)}(?=\s|>)`, 'gi')
    closeRe.lastIndex = from
    const match = closeRe.exec(source)
    if (!match || match.index == null)
      return null
    const markup = readMarkup(match.index)
    return markup ? { start: match.index, end: markup.end } : null
  }

  let start = -1
  let openEnd = -1
  let searchIndex = Math.max(0, startIndex)
  while (searchIndex < source.length) {
    const lt = source.indexOf('<', searchIndex)
    if (lt === -1)
      return null
    const markup = readMarkup(lt)
    if (!markup)
      return null
    if (!markup.closing && markup.tag === lowerTag) {
      start = lt
      openEnd = markup.end - 1
      break
    }
    if (!markup.closing && RAW_TEXT_HTML_TAGS.has(markup.tag)) {
      const close = findRawTextClose(markup.tag, markup.end)
      searchIndex = close?.end ?? source.length
      continue
    }
    searchIndex = markup.end
  }

  if (start === -1 || openEnd === -1)
    return null

  const openTag = source.slice(start, openEnd + 1)
  if (VOID_HTML_TAGS.has(lowerTag) || /\/\s*>$/.test(openTag)) {
    return {
      raw: openTag,
      start,
      end: openEnd + 1,
      closed: true,
    }
  }

  if (RAW_TEXT_HTML_TAGS.has(lowerTag)) {
    const close = findRawTextClose(lowerTag, openEnd + 1)
    if (!close) {
      return {
        raw: source.slice(start),
        start,
        end: source.length,
        closed: false,
      }
    }
    return {
      raw: source.slice(start, close.end),
      start,
      end: close.end,
      closeStart: close.start,
      closed: true,
    }
  }

  let depth = 1
  let index = openEnd + 1

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt === -1) {
      return {
        raw: source.slice(start),
        start,
        end: source.length,
        closed: false,
      }
    }

    const markup = readMarkup(lt)
    if (!markup)
      return null

    if (markup.closing && markup.tag === lowerTag) {
      depth--
      const end = markup.end
      if (depth === 0) {
        return {
          raw: source.slice(start, end),
          start,
          end,
          closeStart: lt,
          closed: true,
        }
      }
      index = end
      continue
    }

    if (!markup.closing && markup.tag === lowerTag) {
      if (!markup.selfClosing && !VOID_HTML_TAGS.has(markup.tag))
        depth++
      index = markup.end
      continue
    }

    if (!markup.closing && RAW_TEXT_HTML_TAGS.has(markup.tag)) {
      const close = findRawTextClose(markup.tag, markup.end)
      index = close?.end ?? source.length
      continue
    }

    index = markup.end
  }

  return {
    raw: source.slice(start),
    start,
    end: source.length,
    closed: false,
  }
}

function findApproximateConsumedPrefixEnd(exact: string, approximate: string) {
  if (!approximate)
    return 0

  let i = 0
  let j = 0
  while (i < exact.length && j < approximate.length) {
    if (exact[i] === approximate[j]) {
      i++
      j++
      continue
    }

    if (exact[i] === '\r' || exact[i] === '\n') {
      i++
      continue
    }

    return -1
  }

  return j === approximate.length ? i : -1
}

function buildHtmlBlockContent(raw: string, tag: string, closed: boolean) {
  if (closed)
    return raw
  return `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
}

function normalizeIndentedSourceForLookup(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/(^|\n)[ \t]{1,4}/g, '$1')
}

function canFindNodeRawAfterSourceIndex(source: string, startIndex: number, nodeRaw: string) {
  if (!nodeRaw)
    return false

  if (source.includes(nodeRaw, startIndex))
    return true

  const tail = source.slice(Math.max(0, startIndex))
  return normalizeIndentedSourceForLookup(tail).includes(normalizeIndentedSourceForLookup(nodeRaw))
}

function extendHtmlBlockCloseToLineEnding(source: string, startIndex: number) {
  let end = Math.max(0, startIndex)

  while (end < source.length && (source[end] === ' ' || source[end] === '\t'))
    end++

  if (source[end] === '\r') {
    end++
    if (source[end] === '\n')
      end++
    return end
  }

  if (source[end] === '\n')
    return end + 1

  return startIndex
}

function isDetailsOpenHtmlBlock(node: ParsedNode): node is HtmlBlockNode {
  if (node.type !== 'html_block')
    return false
  if (String(node.tag ?? '').toLowerCase() !== 'details')
    return false
  const raw = String(node.raw ?? node.content ?? '')
  return /^\s*<details\b/i.test(raw)
}

function isDetailsCloseHtmlBlock(node: ParsedNode): node is HtmlBlockNode {
  if (node.type !== 'html_block')
    return false
  const raw = String(node.raw ?? node.content ?? '')
  return /^\s*<\/details\b/i.test(raw)
}

function findLastClosingTagStart(raw: string, tag: string) {
  const closeRe = new RegExp(String.raw`<\s*\/\s*${escapeTagForRegExp(tag)}(?=\s|>)`, 'gi')
  let last = -1
  let match: RegExpExecArray | null

  while ((match = closeRe.exec(raw)) !== null)
    last = match.index

  return last
}

function buildDetailsChildParseOptions(options: ParseOptions, final: boolean): InternalParseOptions {
  return {
    final,
    __disableStreamParse: true,
    requireClosingStrong: options.requireClosingStrong,
    customHtmlTags: options.customHtmlTags,
    validateLink: options.validateLink,
  }
}

const STRUCTURED_HTML_WRAPPER_BLOCK_TYPES = new Set([
  'admonition',
  'blockquote',
  'code_block',
  'definition_list',
  'footnote',
  'heading',
  'list',
  'math_block',
  'table',
  'thematic_break',
])

const STRUCTURED_HTML_WRAPPER_MARKER_RE = /(?:^|\n)\s{0,3}(?:#{1,6}\s+\S|[-+*]\s+\S|\d+[.)]\s+\S|>\s*\S|`{3,}|~{3,}|(?:\*{3,}|-{3,}|_{3,})(?:\s|$)|\|.*\|)/m

function hasStructuredHtmlWrapperMarkers(fragment: string) {
  return /\n\s*\n/.test(fragment) || STRUCTURED_HTML_WRAPPER_MARKER_RE.test(fragment)
}

function shouldStructureGenericHtmlBlockChildren(
  innerRaw: string,
  children: ParsedNode[],
) {
  if (!innerRaw.trim() || children.length === 0)
    return false

  if (children.some(child => STRUCTURED_HTML_WRAPPER_BLOCK_TYPES.has(String(child?.type ?? '').toLowerCase())))
    return true

  if (children.some((child) => {
    if (child?.type !== 'html_block')
      return false
    const childFields = getNodeFields(child)
    return Array.isArray(childFields.children) && childFields.children.length > 0
  })) {
    return true
  }

  if (!hasStructuredHtmlWrapperMarkers(innerRaw))
    return false

  if (children.length > 1)
    return true

  const [first] = children
  return Boolean(first && first.type === 'paragraph')
}

function splitSiblingHtmlBlockFragments(fragment: string) {
  const blocks: string[] = []
  let cursor = 0

  while (cursor < fragment.length) {
    while (/\s/.test(fragment[cursor] ?? ''))
      cursor++
    if (cursor >= fragment.length)
      break

    const tagMatch = fragment.slice(cursor).match(/^<([A-Z][\w:-]*)/i)
    if (!tagMatch?.[1])
      return null

    const exact = findNextHtmlBlockFromSource(fragment, tagMatch[1], cursor)
    if (!exact || exact.start !== cursor)
      return null

    blocks.push(exact.raw)
    cursor = exact.end
  }

  return blocks.length > 1 ? blocks : null
}

function parseSiblingHtmlBlockChildren(
  blocks: string[],
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
) {
  const customHtmlTags = options.customHtmlTags?.join('\0') ?? ''
  const cacheOwner = md as unknown as object
  const previous = siblingHtmlChildrenCache.get(cacheOwner)
  const canReuse = previous
    && previous.final === final
    && previous.customHtmlTags === customHtmlTags
    && previous.requireClosingStrong === options.requireClosingStrong
    && previous.validateLink === options.validateLink

  const children = blocks.map((block, index) => {
    if (canReuse && previous.blocks[index] === block)
      return previous.children[index]
    return parseDetailsFragmentChildren(block, md, options)
  })

  siblingHtmlChildrenCache.set(cacheOwner, {
    blocks,
    children,
    customHtmlTags,
    final,
    requireClosingStrong: options.requireClosingStrong,
    validateLink: options.validateLink,
  })

  return children.flat()
}

function structureGenericHtmlBlockChildren(
  nodes: ParsedNode[],
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
): ParsedNode[] {
  return nodes.map((node) => {
    if (node?.type !== 'html_block')
      return node

    const fields = getNodeFields(node)
    const tag = String(fields.tag ?? '').toLowerCase()
    if (!tag || tag === 'details' || NON_STRUCTURING_HTML_TAGS.has(tag) || Array.isArray(fields.children))
      return node

    const raw = String(node.raw ?? fields.content ?? '')
    if (!raw)
      return node

    const openEnd = findTagCloseIndexOutsideQuotes(raw)
    if (openEnd === -1)
      return node

    const exact = findNextHtmlBlockFromSource(raw, tag, 0)
    const closeStart = exact?.closeStart ?? -1
    const hasClose = exact?.closed === true && closeStart >= openEnd + 1
    const innerRaw = hasClose
      ? raw.slice(openEnd + 1, closeStart)
      : raw.slice(openEnd + 1)

    if (!innerRaw.trim())
      return node

    const childOptions = buildDetailsChildParseOptions(options, final)
    const siblingHtmlBlocks = hasClose ? null : splitSiblingHtmlBlockFragments(innerRaw)
    const children = siblingHtmlBlocks
      ? parseSiblingHtmlBlockChildren(siblingHtmlBlocks, md, childOptions, final)
      : parseDetailsFragmentChildren(innerRaw, md, childOptions)
    if (!shouldStructureGenericHtmlBlockChildren(innerRaw, children))
      return node

    return {
      ...node,
      children,
    } as ParsedNode
  })
}

function hasTopLevelHtmlBlock(nodes: ParsedNode[]) {
  for (const node of nodes) {
    if (node?.type === 'html_block')
      return true
  }
  return false
}

function parseDetailsFragmentChildren(
  fragment: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  if (!fragment.trim())
    return []

  const internalOptions: InternalParseOptions = {
    ...(options as InternalParseOptions),
    __disableStreamParse: true,
    __disableStructuredReuse: true,
  }

  return parseMarkdownToStructure(fragment, md, internalOptions)
}

function parseSummaryChildren(
  fragment: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const children = parseDetailsFragmentChildren(fragment, md, options)
  const onlyChild = children[0] as ParsedNode & { children?: ParsedNode[] } | undefined
  if (children.length === 1 && onlyChild?.type === 'paragraph' && Array.isArray(onlyChild.children))
    return onlyChild.children
  return children
}

function buildStructuredSummaryNode(
  summaryRaw: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const summaryNode = parseHtmlBlock({ content: summaryRaw } as MarkdownToken) as ParsedNode & Record<string, unknown>
  const openEnd = findTagCloseIndexOutsideQuotes(summaryRaw)
  const closeStart = findLastClosingTagStart(summaryRaw, 'summary')

  if (openEnd !== -1 && closeStart !== -1 && closeStart >= openEnd + 1) {
    const summaryInner = summaryRaw.slice(openEnd + 1, closeStart)
    const children = parseSummaryChildren(summaryInner, md, options)
    if (children.length > 0)
      summaryNode.children = children
  }

  summaryNode.raw = summaryRaw
  return summaryNode as ParsedNode
}

function buildDetailsPrefixChildren(
  openRaw: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const openEnd = findTagCloseIndexOutsideQuotes(openRaw)
  if (openEnd === -1)
    return []

  const innerPrefix = openRaw.slice(openEnd + 1)
  if (!innerPrefix.trim())
    return []

  const summaryBlock = findNextHtmlBlockFromSource(innerPrefix, 'summary', 0)
  if (!summaryBlock)
    return parseDetailsFragmentChildren(innerPrefix, md, options)

  const beforeSummary = innerPrefix.slice(0, summaryBlock.start)
  const afterSummary = innerPrefix.slice(summaryBlock.end)

  return [
    ...parseDetailsFragmentChildren(beforeSummary, md, options),
    buildStructuredSummaryNode(summaryBlock.raw, md, options),
    ...parseDetailsFragmentChildren(afterSummary, md, options),
  ]
}

function combineStructuredDetailsHtmlBlocks(
  nodes: ParsedNode[],
  source: string,
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
  sourceCursor = 0,
): [ParsedNode[], number] {
  const merged: ParsedNode[] = []
  let cursor = sourceCursor

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const nodeRaw = getMergeableNodeRaw(node)
    let nodePos = -1
    if (nodeRaw) {
      nodePos = source.indexOf(nodeRaw, cursor)
      if (nodePos !== -1)
        cursor = nodePos + nodeRaw.length
    }

    if (!isDetailsOpenHtmlBlock(node)) {
      merged.push(node)
      continue
    }

    const openRaw = String(node.raw ?? getMergeableNodeRaw(node) ?? '')
    const openStart = nodePos !== -1 ? nodePos : source.indexOf(openRaw, Math.max(0, cursor - openRaw.length))
    if (openStart === -1) {
      merged.push(node)
      continue
    }

    let depth = 1
    let closeIndex = -1
    for (let j = i + 1; j < nodes.length; j++) {
      const current = nodes[j]
      if (isDetailsOpenHtmlBlock(current)) {
        depth++
        continue
      }
      if (!isDetailsCloseHtmlBlock(current))
        continue
      depth--
      if (depth === 0) {
        closeIndex = j
        break
      }
    }

    const exact = findNextHtmlBlockFromSource(source, 'details', openStart)
    const selfContained = closeIndex === -1 && exact?.closed === true

    const effectiveOpenRaw = selfContained
      ? (() => {
          const ct = findLastClosingTagStart(openRaw, 'details')
          return ct !== -1 ? openRaw.slice(0, ct) : openRaw
        })()
      : openRaw

    const middleNodes = selfContained
      ? []
      : closeIndex === -1 ? nodes.slice(i + 1) : nodes.slice(i + 1, closeIndex)
    const [children] = combineStructuredDetailsHtmlBlocks(
      middleNodes,
      source,
      md,
      options,
      final,
      openStart + openRaw.length,
    )
    const prefixChildren = buildDetailsPrefixChildren(
      effectiveOpenRaw,
      md,
      buildDetailsChildParseOptions(options, final),
    )

    const closeRaw = closeIndex === -1
      ? '</details>'
      : String(nodes[closeIndex].raw ?? getMergeableNodeRaw(nodes[closeIndex]) ?? '</details>')
    const explicitClose = selfContained || (closeIndex !== -1 && exact?.closed === true)
    const trimmedCloseRaw = closeRaw.replace(/[\t\r\n ]+$/, '')
    const closeStart = explicitClose
      ? (() => {
          const closeOffset = (exact?.raw ?? '').lastIndexOf(trimmedCloseRaw)
          return closeOffset === -1 ? source.length : openStart + closeOffset
        })()
      : source.length
    const openTagEndIndex = findTagCloseIndexOutsideQuotes(openRaw)
    const middleSourceStart = selfContained && openTagEndIndex !== -1
      ? openStart + openTagEndIndex + 1
      : openStart + openRaw.length
    const middleSource = source.slice(middleSourceStart, closeStart === -1 ? source.length : closeStart)
    const middleTokens = md.parse(middleSource, { __markstreamFinal: final }) as unknown as MarkdownToken[]
    const renderedMiddle = md.renderer.render(
      middleTokens as unknown as Token[],
      md.options,
      { __markstreamFinal: final },
    )
    const closeMarkupEnd = closeStart + trimmedCloseRaw.length
    const closeSliceEnd = explicitClose
      ? Math.max(closeStart + closeRaw.length, extendHtmlBlockCloseToLineEnding(source, closeMarkupEnd))
      : source.length
    const renderedCloseRaw = explicitClose
      ? source.slice(closeStart, closeSliceEnd)
      : closeRaw
    const mergedRaw = explicitClose
      ? source.slice(openStart, closeSliceEnd)
      : source.slice(openStart)

    const contentPrefix = selfContained && openTagEndIndex !== -1
      ? openRaw.slice(0, openTagEndIndex + 1)
      : openRaw

    const detailsNode = {
      ...node,
      tag: 'details',
      attrs: parseTagAttrs(openRaw.slice(0, openTagEndIndex + 1)),
      raw: mergedRaw,
      content: `${contentPrefix}${renderedMiddle}${renderedCloseRaw}`,
      children: [...prefixChildren, ...children],
      loading: !final && !explicitClose,
    } as ParsedNode

    if (options.includeSourceMap)
      detailsNode.sourceMap = createSourceMapFromOffsets(source, openStart, explicitClose ? closeSliceEnd : source.length, options)

    merged.push(detailsNode)

    cursor = explicitClose ? closeSliceEnd : source.length
    if (closeIndex === -1 && !selfContained)
      break
    if (closeIndex !== -1)
      i = closeIndex
  }

  return [merged, cursor]
}

function mergeSplitTopLevelHtmlBlocks(nodes: ParsedNode[], final: boolean, source: string, options?: ParseOptions) {
  if (!source)
    return nodes

  const merged = nodes.slice()
  let sourceHtmlCursor = 0

  for (let i = 0; i < merged.length; i++) {
    const node = merged[i]
    const nodeRaw = getMergeableNodeRaw(node)
    const nodePos = nodeRaw ? source.indexOf(nodeRaw, sourceHtmlCursor) : -1
    if (node?.type !== 'html_block') {
      if (nodePos !== -1)
        sourceHtmlCursor = nodePos + nodeRaw.length
      continue
    }

    const tag = String(node.tag ?? '').toLowerCase()
    if (!tag)
      continue
    if (tag === 'details') {
      if (nodePos !== -1)
        sourceHtmlCursor = nodePos + nodeRaw.length
      continue
    }

    const exact = findNextHtmlBlockFromSource(
      source,
      tag,
      nodePos !== -1 ? nodePos : sourceHtmlCursor,
    )
    if (!exact)
      continue
    sourceHtmlCursor = exact.end

    const currentContent = String(node.content ?? nodeRaw)
    const currentRaw = String(node.raw ?? currentContent)
    const currentRawEnd = nodePos + currentRaw.length
    if (
      nodePos !== -1
      && exact.end < currentRawEnd
      && source.slice(nodePos, currentRawEnd) === currentRaw
    ) {
      sourceHtmlCursor = currentRawEnd
      if (options?.includeSourceMap)
        node.sourceMap = createSourceMapFromOffsets(source, nodePos, currentRawEnd, options)
      continue
    }

    const nextContent = buildHtmlBlockContent(exact.raw, tag, exact.closed)
    const desiredLoading = !final && !exact.closed
    const needsExpansion = currentContent !== nextContent || currentRaw !== exact.raw || Boolean(node.loading) !== desiredLoading
    const exactOpenEnd = findTagCloseIndexOutsideQuotes(exact.raw)
    const exactOpenTag = exactOpenEnd === -1 ? '' : exact.raw.slice(0, exactOpenEnd + 1)
    const exactAttrs = exactOpenTag ? parseTagAttrs(exactOpenTag) : []

    node.content = nextContent
    node.raw = exact.raw
    node.loading = desiredLoading
    node.attrs = exactAttrs.length ? exactAttrs : undefined
    if (options?.includeSourceMap)
      node.sourceMap = createSourceMapFromOffsets(source, exact.start, exact.end, options)

    if (!needsExpansion)
      continue

    let tailCursor = findApproximateConsumedPrefixEnd(exact.raw, currentRaw)
    if (tailCursor === -1)
      tailCursor = 0

    const j = i + 1
    while (j < merged.length) {
      if (exact.closed && isCloseOnlyHtmlBlockForTag(merged[j], tag)) {
        merged.splice(j, 1)
        continue
      }
      const nextRaw = getMergeableNodeRaw(merged[j])
      if (!nextRaw)
        break
      const nextPos = exact.raw.indexOf(nextRaw, tailCursor)
      if (nextPos === -1) {
        if (canFindNodeRawAfterSourceIndex(source, exact.end, nextRaw))
          break
        const range = internalNodeSourceRanges.get(merged[j])
        if (!range)
          break
        if (range.start >= exact.start && range.end <= exact.end) {
          merged.splice(j, 1)
          continue
        }
        break
      }
      tailCursor = nextPos + nextRaw.length
      merged.splice(j, 1)
    }
  }

  return merged
}

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  const timing = getParseTiming(options)
  const tokenizerTiming = timing
    ? { recordTokenCloneMs: (durationMs: number) => addTiming(timing, 'tokenCloneMs', durationMs) }
    : undefined
  const parseStartedAt = timing ? getParserNow() : 0
  const isFinal = !!options.final
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $ $ 或者 \[ \] 内部的内容
  const sourceMarkdown = (markdown ?? '').toString()
  if (resetTopLevelTokenizerForFinalAutoParse(md, options)) {
    // The safe-markdown cache is owned by the top-level streaming session;
    // a final auto-parse ends that session, so drop the retained source +
    // transform (the next stream parse starts a fresh document).
    clearSafeMarkdownCache(md)
  }

  const safeMarkdown = getSafeMarkdown(md, sourceMarkdown, isFinal, options)

  if (timing)
    addTiming(timing, 'safeMarkdownMs', getParserNow() - parseStartedAt)

  const standaloneHtmlDocument = parseStandaloneHtmlDocument(safeMarkdown)
  if (standaloneHtmlDocument) {
    if (options.includeSourceMap) {
      const sourceMapOptions: InternalParseOptions = {
        ...options,
        __sourceLineMapper: createSourceLineMapper(sourceMarkdown, safeMarkdown),
      }
      standaloneHtmlDocument[0].sourceMap = createSourceMapFromOffsets(safeMarkdown, 0, safeMarkdown.length, sourceMapOptions)
    }

    // Keep pre/post hooks observable for callers that rely on them for
    // instrumentation, but preserve the full-document html_block shape.
    const preHook = options.preTransformTokens
    const postHook = options.postTransformTokens
    if (shouldUseTopLevelStreamParse(md, options) || typeof preHook === 'function' || typeof postHook === 'function') {
      const rawTokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options, tokenizerTiming) as unknown as MarkdownToken[]
      const hookedTokens = typeof preHook === 'function' ? (preHook(rawTokens) || rawTokens) : rawTokens
      if (typeof postHook === 'function')
        postHook(hookedTokens)
    }
    return finishParsedNodes(standaloneHtmlDocument, options, timing, parseStartedAt)
  }

  // Get tokens from markdown-it
  const tokenizeStartedAt = timing ? getParserNow() : 0
  const tokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options, tokenizerTiming)
  if (timing)
    addTiming(timing, 'tokenizeMs', getParserNow() - tokenizeStartedAt)
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return finishParsedNodes([], options, timing, parseStartedAt)
  // Allow consumers to transform tokens before processing
  const pre = options.preTransformTokens
  const post = options.postTransformTokens
  let transformedTokens = tokens as unknown as MarkdownToken[]
  if (pre && typeof pre === 'function') {
    transformedTokens = pre(transformedTokens) || transformedTokens
  }

  // Process the tokens into our structured format.
  // Note: markdown-it's `html_block` token.content can be normalized in ways
  // that drop some original lines. Keep the original source around so block
  // parsers can reconstruct raw slices using token.map when needed.
  // Respect link validation from the md instance so customMarkdownIt(md) with
  // md.set({ validateLink }) is applied when we emit link nodes (tokens may
  // bypass the tokenizer's link rule, e.g. synthetic links from fixLinkTokens).
  const mdAny = md as {
    options?: { validateLink?: (url: string) => boolean }
    validateLink?: (url: string) => boolean
    __markstreamOriginalValidateLink?: (url: string) => boolean
  }
  const directValidateLink = typeof mdAny.validateLink === 'function'
    && mdAny.__markstreamOriginalValidateLink
    && mdAny.validateLink !== mdAny.__markstreamOriginalValidateLink
    ? mdAny.validateLink
    : undefined
  const validateLink = options.validateLink
    ?? directValidateLink
    ?? mdAny.options?.validateLink
    ?? (typeof mdAny.validateLink === 'function' ? mdAny.validateLink : undefined)
  const internalOptions: InternalParseOptions = {
    ...options,
    validateLink,
    __markdownIt: md,
    __sourceLineMapper: options.includeSourceMap === true
      ? createSourceLineMapper(sourceMarkdown, safeMarkdown)
      : undefined,
    __sourceMarkdown: safeMarkdown,
    __customHtmlBlockCursor: 0,
  }
  let result = processTopLevelTokensWithReuse(md, safeMarkdown, transformedTokens, internalOptions, {
    processTokens: (nextTokens, nextOptions) => processTokensWithTiming(nextTokens, nextOptions, timing),
    recordReusedTopLevelNodes: count => addTiming(timing, 'processTokensReusedTopLevelNodes', count),
  })

  // Backwards compatible token-level post hook: if provided and returns
  // a modified token array, re-process tokens and override node-level result.
  if (post && typeof post === 'function') {
    const postResult = post(transformedTokens)
    if (Array.isArray(postResult)) {
      // Backwards compatibility: if the hook returns an array of tokens
      // (they have a `type` string property), re-process them into nodes.
      const first = (postResult as unknown[])[0] as unknown
      const firstType = (first as Record<string, unknown>)?.type
      if (first && typeof firstType === 'string') {
        const postProcessOptions: InternalParseOptions = {
          ...internalOptions,
          __customHtmlBlockCursor: 0,
        }
        result = processTokensWithTiming(postResult as unknown as MarkdownToken[], postProcessOptions, timing)
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }

  if (hasTopLevelHtmlBlock(result)) {
    const htmlPassesStartedAt = timing ? getParserNow() : 0
    result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown, internalOptions)
    result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, md, internalOptions, isFinal)[0]
    result = structureGenericHtmlBlockChildren(result, md, internalOptions, isFinal)
    if (timing)
      addTiming(timing, 'htmlBlockPassesMs', getParserNow() - htmlPassesStartedAt)
  }

  if (isFinal) {
    const seen = new WeakSet<object>()
    const finalizeHtmlBlockLoading = (value: unknown) => {
      if (!value || typeof value !== 'object')
        return
      if (seen.has(value as object))
        return
      seen.add(value as object)

      if (Array.isArray(value)) {
        for (const item of value)
          finalizeHtmlBlockLoading(item)
        return
      }

      const node = value as Record<string, unknown>
      if (node.type === 'html_block' && node.loading === true)
        node.loading = false

      for (const child of Object.values(node))
        finalizeHtmlBlockLoading(child)
    }

    finalizeHtmlBlockLoading(result)
  }

  result = applyPostTransformNodes(result, options) as ParsedNode[]

  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return finishTimedParse(result, timing, parseStartedAt)
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options)
  const seedRaws = (options as InternalParseOptions | undefined)?.__linkifyDemotionSeed
  if (Array.isArray(seedRaws) && seedRaws.length) {
    // Replay the reused prefix node raws into the demotion tracker. This is a
    // top-level-node granularity approximation: a full parse remembers raws at
    // nested granularity too (per-list-item paragraphs etc.). The demotion
    // heuristics absorb the difference (continuation inheritance + per-block
    // re-inference), and `test/linkify-seed-granularity.test.ts` pins the
    // streamed == cold behavior for mixed-feature prefixes.
    for (const raw of seedRaws)
      linkifyContext.remember(String(raw ?? ''))
  }
  const includeSourceMap = options?.includeSourceMap === true
  let i = 0
  // Note: table token normalization is applied during markdown-it parsing
  // via the `applyFixTableTokens` plugin (core.ruler.after('block')).
  // Link/strong/list-item fixes are applied during the inline stage by
  // their respective plugins. That keeps parsing-time fixes centralized
  // and avoids ad-hoc post-processing here.
  while (i < tokens.length) {
    const handled = parseCommonBlockToken(tokens, i, linkifyContext.options(), containerTokenHandlers, parseInlineTokens)
    if (handled) {
      recordInternalNodeSourceRange(handled[0], tokens[i], options)
      result.push(handled[0])
      linkifyContext.remember(handled[0].raw)
      i = handled[1]
      continue
    }

    const token = tokens[i]
    switch (token.type) {
      case 'paragraph_open':
      {
        const paragraphRaw = String(tokens[i + 1]?.content ?? '')
        const paragraphNode = parseParagraph(tokens, i, linkifyContext.options(paragraphRaw), parseInlineTokens) as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(paragraphNode, token, options)
        const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
        if (promoted) {
          if (includeSourceMap)
            inheritSourceMap(promoted, paragraphNode)
          for (const node of promoted)
            recordInternalNodeSourceRange(node, token, options)
          result.push(...promoted)
        }
        else {
          recordInternalNodeSourceRange(paragraphNode, token, options)
          result.push(paragraphNode)
        }
        linkifyContext.remember(paragraphNode.raw)
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, i, linkifyContext.options(), parseInlineTokens)
        if (includeSourceMap)
          applyNodeSourceMap(listNode, token, options)
        recordInternalNodeSourceRange(listNode, token, options)
        result.push(listNode)
        linkifyContext.remember(listNode.raw)
        i = newIndex
        break
      }

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, linkifyContext.options(), parseInlineTokens)
        if (includeSourceMap)
          applyNodeSourceMap(blockquoteNode, token, options)
        recordInternalNodeSourceRange(blockquoteNode, token, options)
        result.push(blockquoteNode)
        linkifyContext.remember(blockquoteNode.raw)
        i = newIndex
        break
      }

      case 'footnote_anchor':{
        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        const footnoteAnchorNode = {
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(footnoteAnchorNode, token, options)
        recordInternalNodeSourceRange(footnoteAnchorNode, token, options)
        result.push(footnoteAnchorNode)
        linkifyContext.remember(String(token.content ?? ''))

        i++
        break
      }

      case 'hardbreak':
        result.push(parseHardBreak())
        linkifyContext.reset()
        i++
        break

      case 'text': {
        const content = String(token.content ?? '')
        // In stream mode, markdown-it can occasionally emit a root-level `text`
        // token (e.g. immediately after an HTML/custom block closes). Treat it
        // as a normal paragraph so the content isn't dropped.
        const paragraphNode = {
          type: 'paragraph',
          raw: content,
          children: content
            ? [{ type: 'text', content, raw: content } as ParsedNode]
            : [],
        } as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(paragraphNode, token, options)
        recordInternalNodeSourceRange(paragraphNode, token, options)
        result.push(paragraphNode)
        linkifyContext.remember(content)
        i++
        break
      }

      case 'inline':
        // In stream mode and after token-fix plugins (e.g. custom HTML blocks),
        // markdown-it can occasionally emit a root-level `inline` token (not
        // wrapped in paragraph_open/close).
        //
        // - If it expands to inline siblings like "我是" + "**strong**", renderers
        //   that virtualize/wrap each top-level node in a block container will
        //   introduce unintended line breaks between those inline siblings.
        // - If it expands to one or more standalone `html_block` nodes, keep the
        //   historical behavior and emit them as top-level blocks (not wrapped in
        //   a paragraph), since they represent block-like HTML structures.
        {
          const raw = String(token.content ?? '')
          const parsed = parseInlineTokens(token.children || [], raw, undefined, linkifyContext.options(raw))
          if (parsed.length === 0) {
            // no-op (matches previous behavior)
          }
          else if (parsed.every(n => n.type === 'html_block')) {
            if (includeSourceMap) {
              for (const node of parsed)
                applyNodeSourceMap(node, token, options)
            }
            for (const node of parsed)
              recordInternalNodeSourceRange(node, token, options)
            result.push(...parsed)
          }
          else {
            const paragraphNode = {
              type: 'paragraph',
              raw,
              children: parsed,
            } as ParsedNode
            if (includeSourceMap)
              applyNodeSourceMap(paragraphNode, token, options)
            const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
            if (promoted) {
              if (includeSourceMap)
                inheritSourceMap(promoted, paragraphNode)
              for (const node of promoted)
                recordInternalNodeSourceRange(node, token, options)
              result.push(...promoted)
            }
            else {
              recordInternalNodeSourceRange(paragraphNode, token, options)
              result.push(paragraphNode)
            }
          }
          linkifyContext.remember(raw)
        }
        i += 1
        break
      default:
        // Handle other token types or skip them
        i += 1
        break
    }
  }

  return result
}

export { buildAllowedHtmlTagSet } from './html-tag-sets'
export { parseInlineTokens }
