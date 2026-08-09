import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const parserRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src/parser')
const indexEntryPoints = new Set([
  join(parserRoot, 'index.ts'),
  join(parserRoot, 'inline-parsers/index.ts'),
])
const relativeImportPattern = /\bfrom\s+['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s+['"](\.[^'"]+)['"]/gm

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return collectSourceFiles(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

function resolveImport(fromFile: string, specifier: string) {
  const target = resolve(dirname(fromFile), specifier)
  if (existsSync(`${target}.ts`))
    return `${target}.ts`
  const indexTarget = join(target, 'index.ts')
  return existsSync(indexTarget) ? indexTarget : undefined
}

describe('parser import graph', () => {
  it('keeps child modules off parser index entry points', () => {
    const forbiddenEdges: string[] = []

    for (const file of collectSourceFiles(parserRoot)) {
      if (indexEntryPoints.has(file))
        continue

      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(relativeImportPattern)) {
        const target = resolveImport(file, match[1] ?? match[2] ?? match[3])
        if (target && indexEntryPoints.has(target))
          forbiddenEdges.push(`${relative(parserRoot, file)} -> ${relative(parserRoot, target)}`)
      }
    }

    expect(forbiddenEdges.sort()).toEqual([])
  })
})
