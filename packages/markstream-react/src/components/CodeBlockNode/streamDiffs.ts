import { preloadStreamDiffs } from '../NodeRenderer/preloadStreamDiffs'

let mod: any = null
let importAttempted = false
let pendingImport: Promise<any | null> | null = null

function normalizeStreamDiffsModule(value: any) {
  const source = typeof value?.createCodeBlockRuntime === 'function' || typeof value?.useMonaco === 'function'
    ? value
    : value?.default
  const factory = source?.createCodeBlockRuntime ?? source?.useMonaco
  if (typeof factory !== 'function')
    return null
  return {
    createCodeBlockRuntime: (options?: Record<string, unknown>) => factory.call(source, options),
    detectLanguage: source?.detectLanguage?.bind(source),
    preloadStreamDiffs: source?.preloadStreamDiffs?.bind(source),
  }
}

/** Resolve the optional stream-diffs code-block runtime. */
export async function getStreamDiffsRuntime() {
  if (pendingImport)
    return pendingImport
  if (mod)
    return mod
  if (importAttempted)
    return null

  pendingImport = (async () => {
    try {
      const diffs = normalizeStreamDiffsModule(await import('stream-diffs/markstream'))
      if (diffs) {
        await preloadStreamDiffs(diffs)
        mod = diffs
        return mod
      }
    }
    catch {
      // stream-diffs is not installed; the component falls back to the <pre>.
    }

    importAttempted = true
    return null
  })()

  try {
    return await pendingImport
  }
  finally {
    pendingImport = null
  }
}
