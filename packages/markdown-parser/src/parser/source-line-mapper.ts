export function createSourceLineMapper(source: string, parsedSource: string) {
  if (source === parsedSource)
    return undefined

  const sourceLines = source.split(/\r?\n/)
  const parsedLines = parsedSource.split(/\r?\n/)
  const mappedLines: Array<{ startLine: number, endLine: number }> = []
  let sourceCursor = 0

  for (let parsedLine = 0; parsedLine < parsedLines.length; parsedLine++) {
    const line = parsedLines[parsedLine] ?? ''

    if (sourceLines[sourceCursor] === line) {
      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: sourceCursor + 1,
      }
      sourceCursor++
      continue
    }

    const sourceLine = sourceLines[sourceCursor] ?? ''
    if (line !== '' && sourceLine !== line && sourceLine.startsWith(line)) {
      let joinedLine = line
      let splitEnd = -1
      for (let nextParsedLine = parsedLine + 1; nextParsedLine < parsedLines.length; nextParsedLine++) {
        joinedLine += parsedLines[nextParsedLine] ?? ''
        if (joinedLine === sourceLine) {
          splitEnd = nextParsedLine
          break
        }
        if (!sourceLine.startsWith(joinedLine))
          break
      }

      if (splitEnd !== -1) {
        for (let mappedLine = parsedLine; mappedLine <= splitEnd; mappedLine++) {
          mappedLines[mappedLine] = {
            startLine: sourceCursor,
            endLine: sourceCursor + 1,
          }
        }
        sourceCursor++
        parsedLine = splitEnd
        continue
      }

      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: sourceCursor + 1,
      }
      continue
    }

    let collapsedLine = sourceLines[sourceCursor] ?? ''
    let collapsedEnd = -1
    for (let sourceLine = sourceCursor + 1; sourceLine < sourceLines.length; sourceLine++) {
      collapsedLine += `\\n${sourceLines[sourceLine] ?? ''}`
      if (collapsedLine === line) {
        collapsedEnd = sourceLine + 1
        break
      }
      if (!line.startsWith(collapsedLine))
        break
    }

    if (collapsedEnd !== -1) {
      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: collapsedEnd,
      }
      sourceCursor = collapsedEnd
      continue
    }

    let found = -1
    if (line !== '') {
      const searchEnd = Math.min(sourceLines.length, sourceCursor + 80)
      for (let sourceLine = sourceCursor; sourceLine < searchEnd; sourceLine++) {
        if (sourceLines[sourceLine] === line) {
          found = sourceLine
          break
        }
      }
    }

    if (found !== -1) {
      mappedLines[parsedLine] = {
        startLine: found,
        endLine: found + 1,
      }
      sourceCursor = found + 1
      continue
    }

    const fallbackLine = Math.min(
      Math.max(0, sourceLines.length - 1),
      Math.max(0, sourceCursor - 1),
    )
    mappedLines[parsedLine] = {
      startLine: fallbackLine,
      endLine: fallbackLine + 1,
    }
  }

  return (line: number) => {
    const index = Number.isFinite(line) ? Math.max(0, Math.trunc(line)) : 0
    if (index < mappedLines.length)
      return mappedLines[index] ?? { startLine: 0, endLine: 0 }

    const lastMapped = mappedLines[mappedLines.length - 1] ?? {
      startLine: Math.max(0, sourceLines.length - 1),
      endLine: sourceLines.length,
    }
    const startLine = Math.min(sourceLines.length, lastMapped.endLine + index - mappedLines.length)
    return {
      startLine,
      endLine: Math.min(sourceLines.length, startLine + 1),
    }
  }
}
