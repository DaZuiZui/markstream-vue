import type { MarkdownIt, Token } from '../../markdown-it-types'
import type { InternalParseOptions, ParseOptions } from '../../types'
import {
  hasMarkstreamMathPlugin,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../../plugins/math'
import { cloneMarkdownTokens } from '../token-clone'
import {
  clearTolerantMathBoundaryStreamCache,
  shouldUseSyncParseForPendingTolerantMathBoundary,
  syncTolerantMathBoundaryStreamCache,
} from './boundary-state'

const streamParseEnvCache = new WeakMap<object, Map<string, Record<string, unknown>>>()
const topLevelStreamParseMode = new WeakMap<object, string>()

interface TokenizerTimingCallbacks {
  recordTokenCloneMs?: (durationMs: number) => void
}

function getParserNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function getStableStreamEnv(md: MarkdownIt, env: Record<string, unknown>) {
  const mdKey = md as unknown as object
  let byMode = streamParseEnvCache.get(mdKey)
  if (!byMode) {
    byMode = new Map()
    streamParseEnvCache.set(mdKey, byMode)
  }

  const modeKey = env.__markstreamFinal === true ? 'final' : 'streaming'
  let stableEnv = byMode.get(modeKey)
  if (!stableEnv) {
    stableEnv = {}
    byMode.set(modeKey, stableEnv)
  }

  for (const key of Object.keys(stableEnv)) {
    if (!Object.prototype.hasOwnProperty.call(env, key))
      delete stableEnv[key]
  }
  Object.assign(stableEnv, env)
  return stableEnv
}

export function shouldUseTopLevelStreamParse(md: MarkdownIt, options: ParseOptions) {
  const internalOptions = options as InternalParseOptions
  const stream = md.stream
  const streamParse = options.streamParse ?? 'auto'
  return internalOptions.__disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions !== true
    && (streamParse === true || (streamParse === 'auto' && options.final !== true))
    && stream?.enabled === true
    && typeof stream.parse === 'function'
}

function shouldResetTopLevelStreamCacheForFinalAutoParse(md: MarkdownIt, options: ParseOptions) {
  const internalOptions = options as InternalParseOptions
  const streamParse = options.streamParse ?? 'auto'
  const stream = md.stream

  return options.final === true
    && streamParse === 'auto'
    && internalOptions.__disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions !== true
    && stream?.enabled === true
    && typeof stream.reset === 'function'
}

export function resetTopLevelTokenizerForFinalAutoParse(md: MarkdownIt, options: ParseOptions) {
  if (!shouldResetTopLevelStreamCacheForFinalAutoParse(md, options))
    return false

  md.stream!.reset!()
  clearTolerantMathBoundaryStreamCache(md)
  return true
}

function shouldCloneTopLevelStreamTokens(options: ParseOptions) {
  return typeof options.preTransformTokens === 'function'
    || typeof options.postTransformTokens === 'function'
}

function sameTokenizerTokenMap(left: Token | undefined, right: Token | undefined) {
  const leftMap = left?.map
  const rightMap = right?.map

  if (leftMap === rightMap)
    return true

  if (!Array.isArray(leftMap) || !Array.isArray(rightMap))
    return false

  return leftMap.length === rightMap.length
    && leftMap.every((value, index) => value === rightMap[index])
}

function isSameTokenShape(left: Token | undefined, right: Token | undefined) {
  return !!left
    && !!right
    && left.type === right.type
    && left.tag === right.tag
    && left.nesting === right.nesting
    && left.markup === right.markup
    && left.content === right.content
    && sameTokenizerTokenMap(left, right)
}

function isParagraphTokenTriplet(tokens: Token[], index: number) {
  return tokens[index]?.type === 'paragraph_open'
    && tokens[index + 1]?.type === 'inline'
    && tokens[index + 2]?.type === 'paragraph_close'
}

function hasAdjacentDuplicateParagraphTokenTriplet(tokens: Token[]) {
  for (let index = 0; index + 5 < tokens.length; index++) {
    if (
      isParagraphTokenTriplet(tokens, index)
      && isParagraphTokenTriplet(tokens, index + 3)
      && isSameTokenShape(tokens[index], tokens[index + 3])
      && isSameTokenShape(tokens[index + 1], tokens[index + 4])
      && isSameTokenShape(tokens[index + 2], tokens[index + 5])
    ) {
      return true
    }
  }

  return false
}

function shouldFallbackDuplicateTolerantMathStreamTokens(
  md: MarkdownIt,
  source: string,
  tokens: Token[],
) {
  return hasMarkstreamMathPlugin(md)
    && mayContainTolerantMathBlockBoundaryOpener(source)
    && hasAdjacentDuplicateParagraphTokenTriplet(tokens)
}

export function getTopLevelStreamParseMode(md: MarkdownIt) {
  return topLevelStreamParseMode.get(md as unknown as object)
}

export function parseTopLevelTokens(
  md: MarkdownIt,
  source: string,
  env: Record<string, unknown>,
  options: ParseOptions,
  timingCallbacks?: TokenizerTimingCallbacks,
) {
  const owner = md as unknown as object
  if (options.customHtmlTags?.length)
    env.__markstreamCustomHtmlTags = options.customHtmlTags

  if (!shouldUseTopLevelStreamParse(md, options)) {
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  syncTolerantMathBoundaryStreamCache(md, source)
  if (shouldUseSyncParseForPendingTolerantMathBoundary(md)) {
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  const tokens = md.stream!.parse!(source, getStableStreamEnv(md, env))
  if (shouldFallbackDuplicateTolerantMathStreamTokens(md, source, tokens)) {
    md.stream?.reset?.()
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  const stats = md.stream?.stats?.() as { lastMode?: string } | undefined
  topLevelStreamParseMode.set(owner, stats?.lastMode ?? 'stream')

  if (!shouldCloneTopLevelStreamTokens(options))
    return tokens

  if (!timingCallbacks?.recordTokenCloneMs)
    return cloneMarkdownTokens(tokens, true)

  const startedAt = getParserNow()
  const cloned = cloneMarkdownTokens(tokens, true)
  timingCallbacks.recordTokenCloneMs(getParserNow() - startedAt)
  return cloned
}
