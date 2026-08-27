import type { ParsedNode } from '../../types'
import { VOID_HTML_TAGS } from '../../htmlTags'
import { escapeTagForRegExp } from '../../htmlTagUtils'
import { getCachedRegex } from '../regex-cache'

const NOT_WHITESPACE = /\S/
const STARTS_LIKE_HTML_DOCUMENT_RE = /^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s[^>]*)?>/i
const ENDS_WITH_HTML_CLOSE_RE = /<\/html>\s*$/i
// Markup shapes whose "tag" is not an element name (comments, CDATA, doctypes,
// processing instructions).
const NON_ELEMENT_MARKUP_START_RE = /^<\s*[!?]/
const MARKUP_TAG_NAME_RE = /^([A-Z][\w:-]*)/i
const SELF_CLOSING_END_RE = /\/\s*>$/

/**
 * Quote-state scan equivalent to `findTagCloseIndexOutsideQuotes(source.slice(start))`
 * but walking the original string with an index cursor, so a long tail after
 * each `<` never materializes as a fresh O(rest-of-document) substring.
 *
 * The quote-state machine mirrors htmlTagUtils.findTagCloseIndexOutsideQuotes
 * exactly: backslash escapes skip the next character, single/double quotes are
 * tracked independently, and the first unquoted `>` wins. Returns an absolute
 * source index (or -1).
 */
function findTagCloseIndexOutsideQuotesFrom(source: string, start: number): number {
  let inSingle = false
  let inDouble = false

  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && ch === '>')
      return i
  }

  return -1
}

export function parseStandaloneHtmlDocument(markdown: string): ParsedNode[] | null {
  // Fast path: streaming markdown almost never starts like an HTML document.
  // Skip the O(doc) `trim()` allocation unless the first non-whitespace
  // character is `<`, which is a strict superset of the `trim` + regex check
  // below (any document matching `startsLikeHtmlDocument` must start with `<`).
  const firstNonWhitespace = markdown.search(NOT_WHITESPACE)
  if (firstNonWhitespace === -1 || markdown.charCodeAt(firstNonWhitespace) !== 0x3C /* < */)
    return null

  const trimmed = markdown.trim()
  if (!trimmed)
    return null

  const startsLikeHtmlDocument = STARTS_LIKE_HTML_DOCUMENT_RE.test(trimmed)
  const endsWithHtmlClose = ENDS_WITH_HTML_CLOSE_RE.test(trimmed)
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

export function getMergeableNodeRaw(node: ParsedNode) {
  const raw = node.raw
  if (typeof raw === 'string')
    return raw

  const content = (node as ParsedNode & { content?: unknown }).content
  if (typeof content === 'string')
    return content

  return ''
}

export function isCloseOnlyHtmlBlockForTag(node: ParsedNode, tag: string) {
  if (node.type !== 'html_block' || !tag)
    return false

  const raw = String(node.raw ?? node.content ?? '')
  return getCachedRegex(
    String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>\s*$`,
    'i',
  ).test(raw)
}

const RAW_TEXT_HTML_TAGS = new Set(['iframe', 'script', 'style', 'textarea', 'title'])

export function findNextHtmlBlockFromSource(source: string, tag: string, startIndex: number) {
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

    const closeIndex = findTagCloseIndexOutsideQuotesFrom(source, start)
    if (closeIndex === -1)
      return null

    const end = closeIndex + 1
    const raw = source.slice(start, end)
    if (NON_ELEMENT_MARKUP_START_RE.test(raw)) {
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
    const tagMatch = body.match(MARKUP_TAG_NAME_RE)
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
      selfClosing: SELF_CLOSING_END_RE.test(raw),
      tag: tagMatch[1].toLowerCase(),
    }
  }

  const findRawTextClose = (rawTextTag: string, from: number) => {
    const closeRe = getCachedRegex(
      String.raw`<\s*\/\s*${escapeTagForRegExp(rawTextTag)}(?=\s|>)`,
      'gi',
    )
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
  if (VOID_HTML_TAGS.has(lowerTag) || SELF_CLOSING_END_RE.test(openTag)) {
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

export function findApproximateConsumedPrefixEnd(exact: string, approximate: string) {
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

export function buildHtmlBlockContent(raw: string, tag: string, closed: boolean) {
  if (closed)
    return raw
  return `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
}

function normalizeIndentedSourceForLookup(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/(^|\n)[ \t]{1,4}/g, '$1')
}

export function canFindNodeRawAfterSourceIndex(source: string, startIndex: number, nodeRaw: string) {
  if (!nodeRaw)
    return false

  if (source.includes(nodeRaw, startIndex))
    return true

  const tail = source.slice(Math.max(0, startIndex))
  return normalizeIndentedSourceForLookup(tail).includes(normalizeIndentedSourceForLookup(nodeRaw))
}

export function extendHtmlBlockCloseToLineEnding(source: string, startIndex: number) {
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

export function findLastClosingTagStart(raw: string, tag: string) {
  const closeRe = getCachedRegex(
    String.raw`<\s*\/\s*${escapeTagForRegExp(tag)}(?=\s|>)`,
    'gi',
  )
  let last = -1
  let match: RegExpExecArray | null

  while ((match = closeRe.exec(raw)) !== null)
    last = match.index

  return last
}
