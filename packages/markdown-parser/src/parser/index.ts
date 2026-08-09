import type { MarkdownIt } from '../markdown-it-types'
import type { InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions } from '../types'
import type { HtmlStructureContext } from './html/structure'
import { parseStandaloneHtmlDocument } from './html/source-scanner'
import {
  combineStructuredDetailsHtmlBlocks,
  hasTopLevelHtmlBlock,
  mergeSplitTopLevelHtmlBlocks,
  structureGenericHtmlBlockChildren,
} from './html/structure'
import { parseInlineTokens } from './inline-parsers'
import { createSourceMapFromOffsets } from './node-source-map'
import { applyPostTransformNodes, finalizeHtmlBlockLoading } from './nodes/finalize-nodes'
import { getInternalNodeSourceRange, processTokensWithContext } from './nodes/token-to-nodes'
import { processTopLevelTokensWithReuse } from './reuse/structured-node-reuse'
import { createSourceLineMapper } from './source-line-mapper'
import { clearSafeMarkdownCache, getSafeMarkdown } from './streaming/safe-markdown'
import {
  parseTopLevelTokens,
  resetTopLevelTokenizerForFinalAutoParse,
  shouldUseTopLevelStreamParse,
} from './streaming/tokenizer'

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

function finishParsedNodes<T extends ParsedNode[]>(
  result: T,
  options: ParseOptions,
  timing: ParseTimingMetrics | undefined,
  startedAt: number,
) {
  return finishTimedParse(applyPostTransformNodes(result, options), timing, startedAt)
}

export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  return processTokensWithContext(tokens, options, parseInlineTokens)
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
      getInternalNodeSourceRange,
      markdownIt: md,
      parseFragment: (fragment, fragmentOptions) => parseMarkdownToStructure(fragment, md, fragmentOptions),
    }
    result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown, htmlStructureContext, internalOptions)
    result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, htmlStructureContext, internalOptions, isFinal)[0]
    result = structureGenericHtmlBlockChildren(result, htmlStructureContext, internalOptions, isFinal)
    if (timing)
      addTiming(timing, 'htmlBlockPassesMs', getParserNow() - htmlPassesStartedAt)
  }

  if (isFinal)
    finalizeHtmlBlockLoading(result)

  result = applyPostTransformNodes(result, options) as ParsedNode[]

  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return finishTimedParse(result, timing, parseStartedAt)
}

export { buildAllowedHtmlTagSet } from './html-tag-sets'
export { parseInlineTokens }
