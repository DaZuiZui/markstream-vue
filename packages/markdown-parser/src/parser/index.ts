import type { MarkdownIt } from '../markdown-it-types'
import type { InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions } from '../types'
import type { HtmlStructureContext } from './html/structure'
import { normalizeCustomHtmlTags } from '../customHtmlTags'
import { parseStandaloneHtmlDocument } from './html/source-scanner'
import {
  combineStructuredDetailsHtmlBlocks,
  hasTopLevelHtmlBlock,
  mergeSplitTopLevelHtmlBlocks,
  structureGenericHtmlBlockChildren,
} from './html/structure'
import { parseInlineTokens } from './inline-parsers'
import { createLinkifyDemotionContextTracker } from './linkifyHeuristics'
import { parseCommonBlockToken } from './node-parsers/block-token-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { containerTokenHandlers } from './node-parsers/container-token-handlers'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
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
    const htmlStructureContext: HtmlStructureContext = {
      getInternalNodeSourceRange: node => internalNodeSourceRanges.get(node),
      markdownIt: md,
      parseFragment: (fragment, fragmentOptions) => parseMarkdownToStructure(fragment, md, fragmentOptions),
    }
    result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown, htmlStructureContext, internalOptions)
    result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, htmlStructureContext, internalOptions, isFinal)[0]
    result = structureGenericHtmlBlockChildren(result, htmlStructureContext, internalOptions, isFinal)
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
