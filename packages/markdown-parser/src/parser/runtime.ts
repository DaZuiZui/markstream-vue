import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'

export interface ExplicitBracketMathContext {
  fenceChar: '`' | '~' | ''
  fenceInBlockquote: boolean
  fenceInList: boolean
  fenceLen: number
  fenceListIndent: number
  inDollarMath: boolean
  inFence: boolean
  inMath: boolean
  listContentIndent: number | null
  dollarMathOpenOffset: number | null
  mathOpenOffset: number | null
}

export interface ExplicitBracketMathStreamState {
  committedContext: ExplicitBracketMathContext
  context: ExplicitBracketMathContext
  lineBuffer: string
}

export interface SafeMarkdownRuntimeState {
  source: string
  safeMarkdown: string
  mode: string
}

export interface TolerantMathBoundaryRuntimeState {
  explicitBracketMath: ExplicitBracketMathStreamState
  source: string
  key: string | null
  pendingCandidate: boolean
}

export interface PendingExplicitMathTailRuntimeState {
  source: string
  state: ExplicitBracketMathStreamState
}

export interface StructuredStreamGroupBoundary {
  firstToken: MarkdownToken
  lastToken: MarkdownToken
  tokenCount: number
}

export interface StructuredStreamRuntimeState {
  groupBoundaries: StructuredStreamGroupBoundary[]
  /** Absolute token indices where each reusable group starts. */
  groupStarts: number[]
  /** Number of top-level tokens when this cache was written. */
  tokenCount: number
  /** Reference to the token array from the parse that produced this cache. */
  tokens: MarkdownToken[]
  /** Whether any top-level group is a single-token (non-paired) reusable type. */
  mixed: boolean
  source: string
  nodes: ParsedNode[]
  /** Cached prefix node raws for incremental linkify demotion seeding. */
  seed: string[]
  /**
   * Absolute pre-pass indices of `<details>` opener html_block nodes. The html
   * passes re-run from the earliest such index because tokenizer-committed
   * details fragments span "stable" group boundaries and are only stitched by
   * combineStructuredDetailsHtmlBlocks.
   */
  detailsOpenIndices: number[]
  stableGroupCount: number
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}

export interface SiblingHtmlChildrenRuntimeState {
  blocks: string[]
  children: ParsedNode[][]
  customHtmlTags: string
  final: boolean
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}

export interface ParserRuntimeSemantics {
  customHtmlTags: string
  hasCustomParserExtensions: boolean
  includeSourceMap: boolean
  postTransformNodes: ParseOptions['postTransformNodes']
  postTransformTokens: ParseOptions['postTransformTokens']
  preTransformTokens: ParseOptions['preTransformTokens']
  requireClosingStrong: boolean | undefined
  reuseStableTopLevelNodes: boolean
  streamParse: ParseOptions['streamParse']
  validateLink: ParseOptions['validateLink']
}

const parserRuntimes = new WeakMap<object, ParserRuntime>()
const wrappedMarkdownItInstances = new WeakSet<object>()
const wrappedStreamInstances = new WeakSet<object>()

function sameSemantics(left: ParserRuntimeSemantics, right: ParserRuntimeSemantics) {
  return left.customHtmlTags === right.customHtmlTags
    && left.hasCustomParserExtensions === right.hasCustomParserExtensions
    && left.includeSourceMap === right.includeSourceMap
    && left.postTransformNodes === right.postTransformNodes
    && left.postTransformTokens === right.postTransformTokens
    && left.preTransformTokens === right.preTransformTokens
    && left.requireClosingStrong === right.requireClosingStrong
    && left.reuseStableTopLevelNodes === right.reuseStableTopLevelNodes
    && left.streamParse === right.streamParse
    && left.validateLink === right.validateLink
}

export class ParserRuntime {
  readonly markdownIt: MarkdownIt
  safeMarkdown?: SafeMarkdownRuntimeState
  tolerantMathBoundary?: TolerantMathBoundaryRuntimeState
  pendingExplicitMathTail?: PendingExplicitMathTailRuntimeState
  readonly streamParseEnvs = new Map<string, Record<string, unknown>>()
  topLevelStreamParseMode?: string
  structuredStream?: StructuredStreamRuntimeState
  /**
   * Number of reused (stable) prefix nodes when the last
   * processTopLevelTokensWithReuse call actually reused nodes; undefined when
   * it re-processed the whole document. Lets downstream passes tail-window.
   */
  structuredReuseTailStart?: number
  siblingHtmlChildren?: SiblingHtmlChildrenRuntimeState
  nodeSourceRanges = new WeakMap<object, { start: number, end: number }>()
  private documentSource?: string
  private semantics?: ParserRuntimeSemantics
  private finalized = false
  private resettingStream = false
  private streamStateActive = false
  private streamResetInCurrentRootParse = false

  constructor(markdownIt: MarkdownIt) {
    this.markdownIt = markdownIt
  }

  beginRootParse(source: string, semantics: ParserRuntimeSemantics) {
    this.streamResetInCurrentRootParse = false
    const sourceChangedNonAppend = this.documentSource !== undefined
      && source !== this.documentSource
      && !source.startsWith(this.documentSource)
    const semanticsChanged = this.semantics !== undefined && !sameSemantics(this.semantics, semantics)

    if (this.finalized || sourceChangedNonAppend || semanticsChanged)
      this.resetDocument(this.streamStateActive)

    this.finalized = false
    this.documentSource = source
    this.semantics = semantics
  }

  finishRootParse(final: boolean) {
    if (!final)
      return

    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = true
  }

  resetForFinalAutoParse() {
    if (!this.streamResetInCurrentRootParse)
      this.resetStreamOnly()
    this.clearDocumentCaches()
  }

  markStreamParseStarted() {
    this.streamStateActive = true
  }

  resetDocument(resetStream: boolean) {
    if (resetStream)
      this.resetStreamOnly()
    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = false
  }

  resetStreamOnly() {
    const stream = this.markdownIt.stream
    const reset = stream?.reset
    if (!stream || typeof reset !== 'function')
      return

    this.resettingStream = true
    try {
      reset.call(stream)
      this.streamStateActive = false
      this.streamResetInCurrentRootParse = true
    }
    finally {
      this.resettingStream = false
    }
  }

  isResettingStream() {
    return this.resettingStream
  }

  handleExternalStreamReset() {
    this.streamStateActive = false
    this.streamResetInCurrentRootParse = true
    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = false
  }

  invalidateConfiguration() {
    this.resetDocument(true)
  }

  dispose() {
    this.resetDocument(true)
    parserRuntimes.delete(this.markdownIt as unknown as object)
  }

  private clearDocumentCaches() {
    this.safeMarkdown = undefined
    this.tolerantMathBoundary = undefined
    this.pendingExplicitMathTail = undefined
    this.streamParseEnvs.clear()
    this.topLevelStreamParseMode = undefined
    this.structuredStream = undefined
    this.siblingHtmlChildren = undefined
    this.nodeSourceRanges = new WeakMap()
  }
}

function wrapMarkdownItBoundaries(md: MarkdownIt) {
  const owner = md as unknown as object
  const ownerState = md as unknown as Record<string, unknown>
  if (!wrappedMarkdownItInstances.has(owner)) {
    wrappedMarkdownItInstances.add(owner)

    const originalUse = md.use
    md.use = function (this: MarkdownIt, ...args: Parameters<MarkdownIt['use']>) {
      try {
        ownerState.__markstreamHasCustomParserExtensions = true
        return Reflect.apply(originalUse, this, args)
      }
      finally {
        parserRuntimes.get(owner)?.invalidateConfiguration()
      }
    } as MarkdownIt['use']

    const originalSet = md.set
    md.set = function (this: MarkdownIt, ...args: Parameters<MarkdownIt['set']>) {
      try {
        return Reflect.apply(originalSet, this, args)
      }
      finally {
        parserRuntimes.get(owner)?.invalidateConfiguration()
      }
    } as MarkdownIt['set']
  }

  const stream = md.stream
  if (!stream || typeof stream.reset !== 'function')
    return

  const streamOwner = stream as unknown as object
  if (wrappedStreamInstances.has(streamOwner))
    return
  wrappedStreamInstances.add(streamOwner)

  const originalReset = stream.reset
  stream.reset = function (this: NonNullable<MarkdownIt['stream']>, ...args: Parameters<NonNullable<typeof originalReset>>) {
    const runtime = parserRuntimes.get(owner)
    try {
      return Reflect.apply(originalReset, this, args)
    }
    finally {
      if (!runtime?.isResettingStream())
        runtime?.handleExternalStreamReset()
    }
  }
}

export function getParserRuntime(md: MarkdownIt) {
  const owner = md as unknown as object
  let runtime = parserRuntimes.get(owner)
  if (!runtime) {
    runtime = new ParserRuntime(md)
    parserRuntimes.set(owner, runtime)
  }
  wrapMarkdownItBoundaries(md)
  return runtime
}

export function disposeParserRuntime(md: MarkdownIt) {
  parserRuntimes.get(md as unknown as object)?.dispose()
}
