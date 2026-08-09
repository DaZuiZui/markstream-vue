export function isEscapedDelimiterAt(source: string, index: number) {
  let cursor = index - 1
  let backslashes = 0
  while (cursor >= 0 && source[cursor] === '\\') {
    backslashes++
    cursor--
  }
  return backslashes % 2 === 1
}

export function isIndentWhitespace(ch: string) {
  return ch === ' ' || ch === '\t'
}

export function advanceMarkdownIndentColumn(column: number, ch: string) {
  return ch === ' ' ? column + 1 : column + 4 - (column % 4)
}

export function getMarkdownIndent(line: string) {
  let index = 0
  let column = 0

  while (index < line.length && isIndentWhitespace(line[index])) {
    column = advanceMarkdownIndentColumn(column, line[index])
    index++
  }

  return { index, column }
}

export function consumeMarkdownIndent(line: string) {
  const indent = getMarkdownIndent(line)
  return indent.column > 3 ? null : indent
}

export function parseMarkdownFenceMarker(line: string) {
  const indent = consumeMarkdownIndent(line)
  if (!indent)
    return null

  const index = indent.index
  const markerChar = line[index]
  if (markerChar !== '`' && markerChar !== '~')
    return null

  let markerEnd = index
  while (markerEnd < line.length && line[markerEnd] === markerChar)
    markerEnd++

  const markerLen = markerEnd - index
  if (markerLen < 3)
    return null

  const rest = line.slice(markerEnd)
  if (markerChar === '`' && rest.includes('`'))
    return null

  return { markerChar: markerChar as '`' | '~', markerLen, rest }
}

export function stripMarkdownListPrefix(line: string) {
  const indent = consumeMarkdownIndent(line)
  if (!indent)
    return null

  const rest = line.slice(indent.index)
  const marker = /^(?:[-+*]|\d{1,9}[.)])(?=[\t ]|$)/.exec(rest)?.[0]
  if (!marker)
    return null

  let index = indent.index + marker.length
  let column = indent.column + marker.length
  if (!isIndentWhitespace(line[index]))
    return null

  while (index < line.length && isIndentWhitespace(line[index])) {
    column = advanceMarkdownIndentColumn(column, line[index])
    index++
  }

  return {
    content: line.slice(index),
    contentIndent: column,
  }
}

export function stripMarkdownBlockquotePrefix(line: string) {
  let rest = line
  let saw = false

  while (true) {
    const indent = consumeMarkdownIndent(rest)
    if (!indent)
      return saw ? rest : null

    let index = indent.index
    if (rest[index] !== '>')
      return saw ? rest : null

    saw = true
    index++
    if (rest[index] === ' ' || rest[index] === '\t')
      index++
    rest = rest.slice(index)
  }
}

export function matchMarkdownFenceMarker(line: string) {
  const direct = parseMarkdownFenceMarker(line)
  if (direct)
    return { ...direct, inBlockquote: false, inList: false, listIndent: 0 }

  const quoted = stripMarkdownBlockquotePrefix(line)
  const quotedMarker = quoted == null ? null : parseMarkdownFenceMarker(quoted)
  if (quotedMarker)
    return { ...quotedMarker, inBlockquote: true, inList: false, listIndent: 0 }

  const listed = stripMarkdownListPrefix(line)
  if (!listed)
    return null

  const listedMarker = parseMarkdownFenceMarker(listed.content)
  return listedMarker == null
    ? null
    : { ...listedMarker, inBlockquote: false, inList: true, listIndent: listed.contentIndent }
}

export function countRepeatedChar(source: string, index: number, ch: string) {
  let end = index
  while (end < source.length && source[end] === ch)
    end++
  return end - index
}

export function findCodeSpanCloseIndex(line: string, start: number, markerLen: number) {
  let index = start

  while (index < line.length) {
    const next = line.indexOf('`', index)
    if (next === -1)
      return -1

    const runLen = countRepeatedChar(line, next, '`')
    if (runLen === markerLen)
      return next

    index = next + runLen
  }

  return -1
}
