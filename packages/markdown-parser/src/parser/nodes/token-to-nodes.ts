import type { MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from '../inline-parsers/inline-parser-types'
import type { ParseContext } from '../parse-context'
import type { ParserRuntime } from '../runtime'
import { normalizeCustomHtmlTags } from '../../customHtmlTags'
import { createLinkifyDemotionContextTracker } from '../linkifyHeuristics'
import { parseCommonBlockToken } from '../node-parsers/block-token-parser'
import { parseBlockquote } from '../node-parsers/blockquote-parser'
import { containerTokenHandlers } from '../node-parsers/container-token-handlers'
import { parseHardBreak } from '../node-parsers/hardbreak-parser'
import { parseList } from '../node-parsers/list-parser'
import { parseParagraph } from '../node-parsers/paragraph-parser'
import { applyNodeSourceMap } from '../node-source-map'

type ParsedNodeWithFields = ParsedNode & {
  children?: ParsedNode[]
  content?: unknown
  tag?: unknown
}

function recordInternalNodeSourceRange(node: ParsedNode, token: MarkdownToken | undefined, options: ParseContext) {
  const map = token?.map
  const source = options.sourceMarkdown
  const runtime = options.runtime
  if (!Array.isArray(map) || map.length < 2 || typeof source !== 'string' || !runtime)
    return

  const startLine = Number(map[0])
  const endLine = Number(map[1])
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine))
    return

  let offsets = options.sourceLineOffsets
  if (!offsets) {
    offsets = [0]
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n')
        offsets.push(i + 1)
    }
    options.sourceLineOffsets = offsets
  }

  runtime.nodeSourceRanges.set(node, {
    start: offsets[Math.max(0, Math.trunc(startLine))] ?? source.length,
    end: offsets[Math.max(0, Math.trunc(endLine))] ?? source.length,
  })
}

export function getInternalNodeSourceRange(node: ParsedNode, runtime: ParserRuntime) {
  return runtime.nodeSourceRanges.get(node)
}

function getNodeFields(node: ParsedNode) {
  return node as ParsedNodeWithFields
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

// Process markdown-it tokens into our structured format
export function processTokensWithContext(
  tokens: MarkdownToken[],
  options: ParseContext,
  parseInlineTokens: ParseInlineTokensFn,
): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options)
  const seedRaws = options.linkifyDemotionSeed
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
