import type { MarkdownIt, Token } from '../../markdown-it-types'
import type { HtmlBlockNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseContext } from '../parse-context'
import { NON_STRUCTURING_HTML_TAGS } from '../../htmlTags'
import { findTagCloseIndexOutsideQuotes, parseTagAttrs } from '../../htmlTagUtils'
import { isCacheStableLinkValidator } from '../../plugins/linkTokenMetadata'
import { parseHtmlBlock } from '../node-parsers/html-block-parser'
import { createSourceMapFromOffsets } from '../node-source-map'
import { createChildParseContext } from '../parse-context'
import {
  buildHtmlBlockContent,
  canFindNodeRawAfterSourceIndex,
  extendHtmlBlockCloseToLineEnding,
  findApproximateConsumedPrefixEnd,
  findLastClosingTagStart,
  findNextHtmlBlockFromSource,
  getMergeableNodeRaw,
  isCloseOnlyHtmlBlockForTag,
} from './source-scanner'

type ParsedNodeWithFields = ParsedNode & {
  children?: ParsedNode[]
  content?: unknown
  tag?: unknown
}

export interface HtmlStructureContext {
  getInternalNodeSourceRange: (node: ParsedNode) => { start: number, end: number } | undefined
  markdownIt: MarkdownIt
  parseFragment: (fragment: string, options: ParseContext) => ParsedNode[]
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

function buildDetailsChildParseOptions(options: ParseContext, final: boolean): ParseContext {
  const childOptions: ParseOptions = {
    final,
    requireClosingStrong: options.requireClosingStrong,
    customHtmlTags: options.customHtmlTags,
    validateLink: options.validateLink,
  }
  return createChildParseContext(options, childOptions, {
    disableStreamParse: true,
    disableStructuredReuse: true,
    isFragment: true,
  })
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
    const childFields = child as ParsedNodeWithFields
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

function parseDetailsFragmentChildren(
  fragment: string,
  context: HtmlStructureContext,
  options: ParseContext,
) {
  if (!fragment.trim())
    return []

  return context.parseFragment(fragment, options)
}

function parseSiblingHtmlBlockChildren(
  blocks: string[],
  context: HtmlStructureContext,
  options: ParseContext,
  final: boolean,
  useCache: boolean,
) {
  const customHtmlTags = options.customHtmlTags?.join('\0') ?? ''
  const runtime = options.runtime
  const previous = useCache ? runtime?.siblingHtmlChildren : undefined
  const canReuse = previous
    && previous.final === final
    && previous.customHtmlTags === customHtmlTags
    && previous.requireClosingStrong === options.requireClosingStrong
    && previous.validateLink === options.validateLink

  const children = blocks.map((block, index) => {
    if (canReuse && previous.blocks[index] === block)
      return previous.children[index]
    return parseDetailsFragmentChildren(block, context, options)
  })

  if (useCache && runtime) {
    runtime.siblingHtmlChildren = {
      blocks,
      children,
      customHtmlTags,
      final,
      requireClosingStrong: options.requireClosingStrong,
      validateLink: options.validateLink,
    }
  }

  return children.flat()
}

export function structureGenericHtmlBlockChildren(
  nodes: ParsedNode[],
  context: HtmlStructureContext,
  options: ParseContext,
  final: boolean,
  tailStart = 0,
): ParsedNode[] {
  const processNode = (node: ParsedNode): ParsedNode => {
    if (node?.type !== 'html_block')
      return node

    const fields = node as ParsedNodeWithFields
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
    const useSiblingCache = !options.isFragment
      && typeof options.preTransformTokens !== 'function'
      && typeof options.postTransformTokens !== 'function'
      && typeof options.postTransformNodes !== 'function'
      && (context.markdownIt as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions === false
      && isCacheStableLinkValidator(options.validateLink)
    const children = siblingHtmlBlocks
      ? parseSiblingHtmlBlockChildren(siblingHtmlBlocks, context, childOptions, final, useSiblingCache)
      : parseDetailsFragmentChildren(innerRaw, context, childOptions)
    if (!shouldStructureGenericHtmlBlockChildren(innerRaw, children))
      return node

    return {
      ...node,
      children,
    } as ParsedNode
  }

  if (tailStart <= 0)
    return nodes.map(processNode)
  return nodes.slice(0, tailStart).concat(nodes.slice(tailStart).map(processNode))
}

export function hasTopLevelHtmlBlock(nodes: ParsedNode[], start = 0) {
  for (let i = start; i < nodes.length; i++) {
    if (nodes[i]?.type === 'html_block')
      return true
  }
  return false
}

function parseSummaryChildren(
  fragment: string,
  context: HtmlStructureContext,
  options: ParseContext,
) {
  const children = parseDetailsFragmentChildren(fragment, context, options)
  const onlyChild = children[0] as ParsedNode & { children?: ParsedNode[] } | undefined
  if (children.length === 1 && onlyChild?.type === 'paragraph' && Array.isArray(onlyChild.children))
    return onlyChild.children
  return children
}

function buildStructuredSummaryNode(
  summaryRaw: string,
  context: HtmlStructureContext,
  options: ParseContext,
) {
  const summaryNode = parseHtmlBlock({ content: summaryRaw } as MarkdownToken) as ParsedNode & Record<string, unknown>
  const openEnd = findTagCloseIndexOutsideQuotes(summaryRaw)
  const closeStart = findLastClosingTagStart(summaryRaw, 'summary')

  if (openEnd !== -1 && closeStart !== -1 && closeStart >= openEnd + 1) {
    const summaryInner = summaryRaw.slice(openEnd + 1, closeStart)
    const children = parseSummaryChildren(summaryInner, context, options)
    if (children.length > 0)
      summaryNode.children = children
  }

  summaryNode.raw = summaryRaw
  return summaryNode as ParsedNode
}

function buildDetailsPrefixChildren(
  openRaw: string,
  context: HtmlStructureContext,
  options: ParseContext,
) {
  const openEnd = findTagCloseIndexOutsideQuotes(openRaw)
  if (openEnd === -1)
    return []

  const innerPrefix = openRaw.slice(openEnd + 1)
  if (!innerPrefix.trim())
    return []

  const summaryBlock = findNextHtmlBlockFromSource(innerPrefix, 'summary', 0)
  if (!summaryBlock)
    return parseDetailsFragmentChildren(innerPrefix, context, options)

  const beforeSummary = innerPrefix.slice(0, summaryBlock.start)
  const afterSummary = innerPrefix.slice(summaryBlock.end)

  return [
    ...parseDetailsFragmentChildren(beforeSummary, context, options),
    buildStructuredSummaryNode(summaryBlock.raw, context, options),
    ...parseDetailsFragmentChildren(afterSummary, context, options),
  ]
}

export function combineStructuredDetailsHtmlBlocks(
  nodes: ParsedNode[],
  source: string,
  context: HtmlStructureContext,
  options: ParseContext,
  final: boolean,
  sourceCursor = 0,
  tailStart = 0,
): [ParsedNode[], number] {
  const merged: ParsedNode[] = []
  for (let k = 0; k < tailStart; k++)
    merged.push(nodes[k])
  let cursor = sourceCursor

  for (let i = tailStart; i < nodes.length; i++) {
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
      context,
      options,
      final,
      openStart + openRaw.length,
    )
    const prefixChildren = buildDetailsPrefixChildren(
      effectiveOpenRaw,
      context,
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
    const middleTokens = context.markdownIt.parse(middleSource, { __markstreamFinal: final }) as unknown as MarkdownToken[]
    const renderedMiddle = context.markdownIt.renderer.render(
      middleTokens as unknown as Token[],
      context.markdownIt.options,
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

export function mergeSplitTopLevelHtmlBlocks(
  nodes: ParsedNode[],
  final: boolean,
  source: string,
  context: HtmlStructureContext,
  options?: ParseContext,
  tailStart = 0,
  sourceCursorStart = 0,
) {
  if (!source)
    return nodes

  const merged = nodes.slice()
  let sourceHtmlCursor = sourceCursorStart

  for (let i = tailStart; i < merged.length; i++) {
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
        const range = context.getInternalNodeSourceRange(merged[j])
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
