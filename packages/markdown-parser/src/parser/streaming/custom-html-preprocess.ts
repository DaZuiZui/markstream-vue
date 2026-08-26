import { normalizeCustomHtmlTags } from '../../customHtmlTags'
import { isInsideOpenMarkdownFenceBeforeOffset } from './boundary-state'

function stripDanglingHtmlLikeTail(markdown: string) {
  const isWs = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

  const isLikelyHtmlTagPrefix = (tail: string) => {
    // Deterministic scanner (avoids ReDoS/backtracking regexes).
    // Accepts prefixes like "<think", "</think", "<div class", "<a href=\"x"
    // and treats them as "HTML-ish" tails that can be stripped in streaming mode.
    if (!tail || tail[0] !== '<')
      return false
    if (tail.includes('>'))
      return false

    let i = 1
    // "< " is likely comparison ("x < y"), not a tag
    if (i < tail.length && isWs(tail[i]))
      return false

    if (tail.startsWith('<!--') || tail.startsWith('<?') || tail.startsWith('<!'))
      return false

    if (tail[i] === '/') {
      i++
      // "</ " isn't a tag start
      if (i < tail.length && isWs(tail[i]))
        return false
    }

    const isAlpha = (ch: string) => {
      const c = ch.charCodeAt(0)
      return (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
    }
    const isDigit = (ch: string) => {
      const c = ch.charCodeAt(0)
      return c >= 48 && c <= 57
    }
    const isNameStart = (ch: string) => ch === '!' || isAlpha(ch)
    const isNameChar = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === ':' || ch === '-'
    const isAttrStart = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === '_' || ch === '.' || ch === ':' || ch === '-'
    const isAttrChar = isAttrStart

    if (i >= tail.length || !isNameStart(tail[i]))
      return false

    // tag name
    i++
    while (i < tail.length && isNameChar(tail[i]))
      i++

    while (i < tail.length) {
      // trailing whitespace ok
      while (i < tail.length && isWs(tail[i]))
        i++
      if (i >= tail.length)
        return true

      // allow self-closing slash at end (e.g. "<br/")
      if (tail[i] === '/') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        return i >= tail.length
      }

      // attribute name
      if (!isAttrStart(tail[i]))
        return false
      i++
      while (i < tail.length && isAttrChar(tail[i]))
        i++

      while (i < tail.length && isWs(tail[i]))
        i++

      if (i < tail.length && tail[i] === '=') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        if (i >= tail.length)
          return true // incomplete value

        const quote = tail[i]
        if (quote === '"' || quote === '\'') {
          i++
          while (i < tail.length && tail[i] !== quote)
            i++
          // If we don't see the closing quote (tail ends), it's still a tag prefix
          if (i >= tail.length)
            return true
          i++ // consume closing quote
        }
        else {
          // unquoted value: scan until whitespace or forbidden delimiters
          while (i < tail.length) {
            const ch = tail[i]
            if (isWs(ch) || ch === '<' || ch === '>' || ch === '"' || ch === '\'' || ch === '`')
              break
            i++
          }
          if (i >= tail.length)
            return true // incomplete unquoted value
        }
      }
      // else: boolean attr, continue
    }

    return true
  }

  // In streaming mode it's common to have an incomplete HTML-ish fragment at
  // the very end of the current buffer (e.g. '<fo' or '</think'). Letting it
  // reach markdown-it can produce visible mid-state text nodes. We only strip
  // the *tail* when there is no closing '>' anywhere after the last '<'.
  const s = String(markdown ?? '')
  const lastLt = s.lastIndexOf('<')
  if (lastLt === -1)
    return s

  // Run the cheap rejection checks BEFORE the O(region) fence scan: the fence
  // scan only affects the strip decision, so in the common cases where the
  // tail is plainly not a strip candidate (comparison, closed tag, plain
  // whitespace) it is never needed. This removes a full line-by-line fence
  // walk on every non-final commit that merely contains a '<'.
  if (lastLt > 0) {
    const prev = s[lastLt - 1]
    const prevIsWs = prev === ' ' || prev === '\t' || prev === '\n' || prev === '\r'
    // Some stream transports escape newlines as "\\n" / "\\r\\n". Treat those
    // sequences as line boundaries too.
    const prev2 = s[lastLt - 2]
    const prevLooksLikeEscapedNewline = (prev === 'n' || prev === 'r') && prev2 === '\\'
    if (!prevIsWs && !prevLooksLikeEscapedNewline)
      return s
  }

  const tail = s.slice(lastLt)
  if (tail.includes('>'))
    return s
  // If the char after '<' is whitespace, it's more likely a comparison ("x < y")
  // than a tag start ("<div").
  if (tail.length > 1 && (tail[1] === ' ' || tail[1] === '\t' || tail[1] === '\n' || tail[1] === '\r'))
    return s

  if (!isLikelyHtmlTagPrefix(tail))
    return s

  // Delegate to the full fence scanner used elsewhere: the previous local
  // scanner only recognized direct and blockquote-prefixed fences, so a
  // fence nested inside a list item (`- ```html` / `  <div`) was invisible
  // and the incomplete `<div` tail got truncated from the code content on
  // every non-final commit. `isInsideOpenMarkdownFenceBeforeOffset` also
  // handles list/blockquote fence exit conditions (de-dent ends the fence).
  if (isInsideOpenMarkdownFenceBeforeOffset(s, lastLt))
    return s
  return s.slice(0, lastLt)
}

function ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()).filter(Boolean))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }

  const isIndentedCodeLine = (line: string) => {
    if (!line)
      return false
    if (line[0] === '\t')
      return true
    let spaces = 0
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        spaces++
        if (spaces >= 4)
          return true
        continue
      }
      if (ch === '\t')
        return true
      break
    }
    return false
  }

  const findTagCloseIndexOutsideQuotes = (input: string) => {
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
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

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const findInlineCustomBlockSplitIndex = (line: string, lineStart: number) => {
    if (isIndentedCodeLine(line))
      return -1

    const trimmed = line.replace(/^[ \t]+/, '')
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('|') || /^(?:[*+-]|\d+[.)])[\t ]+/.test(trimmed))
      return -1

    let hasRenderablePrefix = false
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      if (ch !== '<') {
        if (!isIndentWs(ch))
          hasRenderablePrefix = true
        i++
        continue
      }

      const closeIdxRel = findTagCloseIndexOutsideQuotes(line.slice(i))
      if (closeIdxRel === -1) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const tagSlice = line.slice(i, i + closeIdxRel + 1)
      let cursor = 1
      while (cursor < tagSlice.length && isIndentWs(tagSlice[cursor])) cursor++
      if (cursor >= tagSlice.length) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const marker = tagSlice[cursor]
      if (marker === '!' || marker === '?') {
        hasRenderablePrefix = true
        i += closeIdxRel + 1
        continue
      }

      const isClosing = marker === '/'
      if (isClosing) {
        hasRenderablePrefix = true
        i += closeIdxRel + 1
        continue
      }

      const nameStart = cursor
      while (cursor < tagSlice.length && isNameChar(tagSlice[cursor])) cursor++
      if (cursor === nameStart) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const tagName = tagSlice.slice(nameStart, cursor).toLowerCase()
      const boundary = tagSlice[cursor]
      if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/') {
        hasRenderablePrefix = true
        i++
        continue
      }

      const sameLineCloseRe = new RegExp(String.raw`<\s*\/\s*${tagName}\s*>`, 'i')
      const selfClosing = /\/\s*>$/.test(tagSlice)
      const closesOnSameLine = sameLineCloseRe.test(line.slice(i + closeIdxRel + 1))
      const closesLater = sameLineCloseRe.test(markdown.slice(lineStart + i + closeIdxRel + 1))
      const continuesOnLaterLine = /[\r\n]/.test(markdown.slice(lineStart + i + closeIdxRel + 1))

      if (hasRenderablePrefix && tagSet.has(tagName) && !selfClosing && !closesOnSameLine && (closesLater || continuesOnLaterLine))
        return i

      hasRenderablePrefix = true
      i += closeIdxRel + 1
    }

    return -1
  }

  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0
  let out = ''
  let idx = 0

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const line = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const fenceMatch = parseFenceMarker(line)
    let nextLine = line
    if (!inFence && !fenceMatch) {
      const splitAt = findInlineCustomBlockSplitIndex(line, idx)
      if (splitAt !== -1) {
        const separator = newline || '\n'
        const before = line.slice(0, splitAt).replace(/[ \t]+$/, '')
        const after = line.slice(splitAt).replace(/^[ \t]+/, '')
        nextLine = `${before}${separator}${separator}${after}`
      }
    }

    out += nextLine
    out += newline

    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

function normalizeCustomHtmlOpeningTagSameLine(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
    )
  }

  const trimStartIndentWs = (s: string) => {
    let i = 0
    while (i < s.length && isIndentWs(s[i])) i++
    return s.slice(i)
  }

  const findTagCloseIndexOutsideQuotes = (input: string) => {
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
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

  const hasClosingTagOnLine = (line: string, from: number, tag: string) => {
    const lowerTag = tag.toLowerCase()
    let pos = line.indexOf('<', from)
    while (pos !== -1) {
      let i = pos + 1
      while (i < line.length && isIndentWs(line[i])) i++
      if (i >= line.length || line[i] !== '/') {
        pos = line.indexOf('<', pos + 1)
        continue
      }
      i++
      while (i < line.length && isIndentWs(line[i])) i++
      if (i + lowerTag.length > line.length) {
        pos = line.indexOf('<', pos + 1)
        continue
      }

      // Case-insensitive match for the closing tag name.
      let matched = true
      for (let j = 0; j < lowerTag.length; j++) {
        const ch = line[i + j]
        const lc = ch >= 'A' && ch <= 'Z' ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch
        if (lc !== lowerTag[j]) {
          matched = false
          break
        }
      }
      if (!matched) {
        pos = line.indexOf('<', pos + 1)
        continue
      }

      let k = i + lowerTag.length
      // Ensure exact tag name (no extra name characters).
      if (k < line.length && isNameChar(line[k])) {
        pos = line.indexOf('<', pos + 1)
        continue
      }
      while (k < line.length && isIndentWs(line[k])) k++
      if (k < line.length && line[k] === '>')
        return true

      pos = line.indexOf('<', pos + 1)
    }
    return false
  }

  const normalizeLine = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    if (i >= line.length || line[i] !== '<')
      return line

    i++
    while (i < line.length && isIndentWs(line[i])) i++
    if (i >= line.length || line[i] === '/')
      return line

    const nameStart = i
    while (i < line.length && isNameChar(line[i])) i++
    if (i === nameStart)
      return line

    const tagName = line.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(tagName))
      return line

    const gtRel = findTagCloseIndexOutsideQuotes(line.slice(i))
    if (gtRel === -1)
      return line
    const gt = i + gtRel

    if (hasClosingTagOnLine(line, gt + 1, tagName))
      return line

    const rest = trimStartIndentWs(line.slice(gt + 1))
    if (!rest)
      return line

    return `${line.slice(0, gt + 1)}\n${rest}`
  }

  let out = ''
  let idx = 0
  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    if (nl === -1) {
      out += normalizeLine(markdown.slice(idx))
      break
    }

    const isCrlf = nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = isCrlf ? nl - 1 : nl
    const line = markdown.slice(idx, lineEnd)
    out += normalizeLine(line)
    out += isCrlf ? '\r\n' : '\n'
    idx = nl + 1
  }

  return out
}

function ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'

  const parseBlockquotePrefix = (rawLine: string) => {
    let i = 0
    let saw = false
    let prefixEnd = 0

    while (i < rawLine.length) {
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      if (i >= rawLine.length || rawLine[i] !== '>')
        break
      saw = true
      i++
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      prefixEnd = i
    }

    if (!saw)
      return null

    const prefix = rawLine.slice(0, prefixEnd)
    return { prefix, content: rawLine.slice(prefixEnd) }
  }

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const closeTagRes = Array.from(tagSet).map((tag) => {
    // Insert a blank line after the close tag when the remaining same-line
    // content begins with a block-level marker (e.g. "## ", "- ", "> ", "```", "|", "$$", ":::").
    //
    // Note: this is intentionally conservative and only targets constructs that
    // require line-start to be recognized by markdown-it.
    const blockMarkerLookahead = '(?=[\\t ]*(?:#{1,6}[\\t ]+|>|(?:[*+-]|\\d+[.)])[\\t ]+|(?:`{3,}|~{3,})|\\||\\$\\$|:{3,}|\\[\\^[^\\]]+\\]:|(?:-{3,}|\\*{3,}|_{3,})))'
    return new RegExp(String.raw`(<\s*\/\s*${tag}\s*>)${blockMarkerLookahead}`, 'gi')
  })

  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0

  let out = ''
  let idx = 0

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const rawLine = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const bq = parseBlockquotePrefix(rawLine)
    const prefix = bq?.prefix ?? ''
    const contentLine = bq?.content ?? rawLine

    // Track fenced code blocks (including those nested in blockquotes) so we
    // don't mutate their contents.
    const fenceMatch = parseFenceMarker(contentLine)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    let nextContent = contentLine
    if (!inFence && nextContent.includes('</')) {
      for (const re of closeTagRes) {
        nextContent = nextContent.replace(re, (match, closeTag: string, offset: number, src: string) => {
          // Inside table rows like:
          //   | A | <my_component></my_component>## heading-like |
          // do not inject blank lines after the closing tag, otherwise the row
          // gets split and table parsing breaks after this custom cell.
          const lineTrimmed = src.replace(/^[\t ]+/, '')
          if (lineTrimmed.startsWith('|'))
            return match

          const before = src.slice(0, offset).replace(/^[\t ]+/, '')
          // Keep same-line boundary splitting conservative:
          // only split when the line starts with the custom tag block itself,
          // or when the close tag is at line start (e.g. "</tag>## heading").
          // This avoids breaking list/blockquote/paragraph inline contexts like:
          // "- text <my_component></my_component>## h"
          // "> text <my_component></my_component>- item"
          // "text <my_component></my_component>## h"
          if (before.length > 0) {
            const closeTagName = closeTag.match(/^<\s*\/\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? ''
            const openTagName = before.match(/^<\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? ''
            if (!closeTagName || !openTagName || closeTagName !== openTagName)
              return match
          }

          return `${closeTag}\n\n`
        })
      }
    }

    if (prefix) {
      const withPrefix = prefix + nextContent.split('\n').join(`\n${prefix}`)
      out += withPrefix
    }
    else {
      out += nextContent
    }

    out += newline
    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

function ensureBlankLineBeforeCustomHtmlBlocks(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isIndentedCodeLine = (line: string) => {
    if (!line)
      return false
    if (line[0] === '\t')
      return true
    let spaces = 0
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        spaces++
        if (spaces >= 4)
          return true
        continue
      }
      if (ch === '\t')
        return true
      break
    }
    return false
  }
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }

  const trimStartIndentWs = (s: string) => {
    let i = 0
    while (i < s.length && isIndentWs(s[i])) i++
    return s.slice(i)
  }

  const parseBlockquotePrefix = (rawLine: string) => {
    let i = 0
    let saw = false
    let prefixEnd = 0

    while (i < rawLine.length) {
      // allow indentation before every marker
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      if (i >= rawLine.length || rawLine[i] !== '>')
        break
      saw = true
      i++ // consume '>'
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      prefixEnd = i
    }

    if (!saw)
      return null

    const prefix = rawLine.slice(0, prefixEnd)
    const key = prefix.replace(/[ \t]+$/, '')
    return {
      prefix,
      key,
      content: rawLine.slice(prefixEnd),
    }
  }

  // Keep behavior conservative: only insert a blank line before a custom tag
  // when it follows a non-blank, non-HTML-ish line. This fixes the common case:
  //
  //   paragraph text
  //   <CustomTag>...</CustomTag>
  //
  // Without the blank line, CommonMark HTML block type 7 cannot interrupt a
  // paragraph, so markdown-it tokenizes the tag as inline HTML inside the
  // paragraph.
  const previousLineLooksHtmlish = (line: string) => {
    const trimmed = trimStartIndentWs(line)
    return trimmed.startsWith('<')
  }

  const lineIsBlank = (line: string) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch !== ' ' && ch !== '\t')
        return false
    }
    return true
  }

  const parseOpeningCustomTagName = (line: string) => {
    if (isIndentedCodeLine(line))
      return ''
    const trimmed = trimStartIndentWs(line)
    if (!trimmed.startsWith('<'))
      return ''

    let i = 1
    while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    if (i >= trimmed.length)
      return ''
    if (trimmed[i] === '/' || trimmed[i] === '!' || trimmed[i] === '?')
      return ''

    const nameStart = i
    while (i < trimmed.length && isNameChar(trimmed[i])) i++
    if (i === nameStart)
      return ''

    const name = trimmed.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(name))
      return ''

    // Require a boundary after tag name to avoid matching prefixes.
    const next = trimmed[i]
    if (next && next !== ' ' && next !== '\t' && next !== '>' && next !== '/')
      return ''

    return name
  }

  const parseLineStartCustomTag = (line: string) => {
    if (isIndentedCodeLine(line))
      return null
    const trimmed = trimStartIndentWs(line)
    if (!trimmed.startsWith('<'))
      return null

    let i = 1
    while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    if (i >= trimmed.length)
      return null

    const isClose = trimmed[i] === '/'
    if (isClose) {
      i++
      while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    }
    // Ignore non-element markup (comments/doctypes/pi)
    const next = trimmed[i]
    if (!next || next === '!' || next === '?')
      return null

    const nameStart = i
    while (i < trimmed.length && isNameChar(trimmed[i])) i++
    if (i === nameStart)
      return null

    const name = trimmed.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(name))
      return null

    // Require boundary after name so we don't match prefixes
    const boundary = trimmed[i]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    if (isClose)
      return { type: 'close' as const, name }

    // opening tag: treat "<tag .../>" as complete on one line
    if (/\/\s*>\s*$/.test(trimmed))
      return { type: 'open' as const, name, complete: true as const }

    const gt = trimmed.indexOf('>', i)
    if (gt !== -1) {
      const after = trimmed.slice(gt + 1)
      const closeRe = new RegExp(`<\\s*\\/\\s*${name}\\s*>`, 'i')
      if (closeRe.test(after))
        return { type: 'open' as const, name, complete: true as const }
    }

    return { type: 'open' as const, name, complete: false as const }
  }

  const parseStandaloneCompleteHtmlTagLine = (line: string) => {
    if (isIndentedCodeLine(line))
      return null

    const trimmed = trimStartIndentWs(line).replace(/[ \t]+$/, '')
    if (!trimmed.startsWith('<'))
      return null
    if (/^<\s*(?:!--|!doctype\b|\?)/i.test(trimmed))
      return null

    const selfClosingMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*\/\s*>\s*$/i)
    if (selfClosingMatch?.[1])
      return selfClosingMatch[1].toLowerCase()

    const fullMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*>[\s\S]*<\s*\/\s*([A-Z][\w:-]*)\s*>\s*$/i)
    if (!fullMatch?.[1] || !fullMatch[2])
      return null

    const openTag = fullMatch[1].toLowerCase()
    const closeTag = fullMatch[2].toLowerCase()
    return openTag === closeTag ? openTag : null
  }

  // Track fenced code blocks so we don't touch their contents.
  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const fenceMatchLine = (rawLine: string) => parseFenceMarker(rawLine)

  const lineStartsWithBlockMarker = (line: string) => {
    const trimmed = trimStartIndentWs(line)
    if (!trimmed)
      return false
    if (isIndentedCodeLine(line))
      return true
    return /^(?:#{1,6}[ \t]+|>|[*+-][ \t]+|\d+[.)][ \t]+|`{3,}|~{3,}|\||\$\$|:{3,}|\[\^[^\]]+\]:|-{3,}|\*{3,}|_{3,})/.test(trimmed)
  }

  const currentCustomBlockNeedsBoundary = (lineStart: number, currentQuoteKey: string, tagName: string) => {
    let scanIdx = lineStart
    let depth = 0

    while (scanIdx < markdown.length) {
      const nl = markdown.indexOf('\n', scanIdx)
      const hasNl = nl !== -1
      const isCrlf = hasNl && nl > scanIdx && markdown[nl - 1] === '\r'
      const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
      const rawLine = markdown.slice(scanIdx, lineEnd)

      const blockquote = parseBlockquotePrefix(rawLine)
      const quoteKey = blockquote?.key ?? ''
      if (depth > 0 && currentQuoteKey && quoteKey !== currentQuoteKey)
        break

      const contentLine = blockquote?.content ?? rawLine
      const lineTag = parseLineStartCustomTag(contentLine)

      if (lineTag?.name === tagName) {
        if (lineTag.type === 'open') {
          if (!lineTag.complete)
            depth++
        }
        else if (depth > 0) {
          depth--
          if (depth === 0)
            return false
        }
      }
      else if (depth > 0) {
        if (lineIsBlank(contentLine) || lineStartsWithBlockMarker(contentLine))
          return true
      }

      if (hasNl)
        scanIdx = nl + 1
      else
        break
    }

    return false
  }

  let out = ''
  let idx = 0
  let prevLineBlank = true
  let prevLineHtmlish = false
  let prevLineStandaloneCompleteHtmlTag = false
  // Use the last seen newline sequence to insert a blank line that matches the file.
  let lastNewline = '\n'
  const customBlockStack: string[] = []
  let prevQuoteKey = ''

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const line = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const blockquote = parseBlockquotePrefix(line)
    const quoteKey = blockquote?.key ?? ''
    const contentLine = blockquote?.content ?? line

    // Maintain fence state based on the original line.
    const fenceMatch = fenceMatchLine(contentLine)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    const insideCustomBlock = customBlockStack.length > 0
    if (!inFence && !insideCustomBlock) {
      const opening = parseOpeningCustomTagName(contentLine)
      const needsBoundaryAfterStandaloneHtml
        = !!opening
          && !prevLineBlank
          && prevLineHtmlish
          && prevLineStandaloneCompleteHtmlTag
          && currentCustomBlockNeedsBoundary(idx, quoteKey, opening)
      if (opening && !prevLineBlank && (!prevLineHtmlish || needsBoundaryAfterStandaloneHtml)) {
        // Insert a blank line boundary between the previous paragraph line and the custom block.
        // In blockquotes, the blank line must also carry the `>` markers, otherwise the
        // blockquote would end and the tag would escape the quote.
        if (quoteKey && prevQuoteKey && quoteKey === prevQuoteKey) {
          out += `${quoteKey}${lastNewline}`
        }
        else if (!quoteKey) {
          out += lastNewline
        }
      }
    }

    out += line
    out += newline

    if (newline)
      lastNewline = newline

    // Maintain custom-tag "block stack" only when not inside fenced code.
    // This avoids accidentally inserting blank lines inside <CustomTag> blocks
    // which would mutate their captured inner content.
    if (!inFence) {
      const tag = parseLineStartCustomTag(contentLine)
      if (tag) {
        if (tag.type === 'open') {
          if (!tag.complete)
            customBlockStack.push(tag.name)
        }
        else {
          // Close: pop matching tag (or unwind to it if nesting is malformed)
          for (let j = customBlockStack.length - 1; j >= 0; j--) {
            if (customBlockStack[j] === tag.name) {
              customBlockStack.length = j
              break
            }
          }
        }
      }
    }

    // Update "previous line" info for the next iteration (based on the original line).
    const blank = lineIsBlank(contentLine)
    prevLineBlank = blank
    prevLineHtmlish = !blank && previousLineLooksHtmlish(contentLine)
    prevLineStandaloneCompleteHtmlTag = !blank && !!parseStandaloneCompleteHtmlTagLine(contentLine)
    prevQuoteKey = quoteKey

    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

export function normalizeStreamingCustomHtmlSource(
  markdown: string,
  customHtmlTags: readonly string[] | undefined,
  isFinal: boolean,
) {
  let safeMarkdown = markdown

  if (customHtmlTags?.length && safeMarkdown.includes('<')) {
    const tags = normalizeCustomHtmlTags(customHtmlTags)

    if (tags.length) {
      safeMarkdown = ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(safeMarkdown, tags)
      safeMarkdown = normalizeCustomHtmlOpeningTagSameLine(safeMarkdown, tags)
      safeMarkdown = ensureBlankLineBeforeCustomHtmlBlocks(safeMarkdown, tags)
      safeMarkdown = ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(safeMarkdown, tags)

      if (safeMarkdown.includes('</')) {
        for (const tag of tags) {
          const re = new RegExp(
            String.raw`(^[\t ]*<\s*\/\s*${tag}\s*>[\t ]*)(\r?\n)(?![\t ]*\r?\n|$)`,
            'gim',
          )
          safeMarkdown = safeMarkdown.replace(re, '$1$2$2')
        }
      }
    }
  }

  if (!isFinal)
    safeMarkdown = stripDanglingHtmlLikeTail(safeMarkdown)

  return safeMarkdown
}
