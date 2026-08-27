export function escapeTagForRegExp(tag: string) {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findTagCloseIndexOutsideQuotes(input: string, start = 0) {
  let inSingle = false
  let inDouble = false

  for (let i = start; i < input.length; i++) {
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

export function parseTagAttrs(openTag: string): [string, string][] {
  const attrs: [string, string][] = []
  const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match

  while ((match = attrRegex.exec(openTag)) !== null) {
    const attrName = match[1]
    if (!attrName)
      continue
    const attrValue = match[2] || match[3] || match[4] || ''
    attrs.push([attrName, attrValue])
  }

  return attrs
}
