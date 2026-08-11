import { preloadStreamDiffs } from '../NodeRenderer/preloadStreamDiffs'

let mod: any = null
let importAttempted = false

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

// stream-diffs is the only enhanced code-block runtime in 2.0.
export async function getStreamDiffsRuntime() {
  if (mod)
    return mod
  if (importAttempted)
    return null
  try {
    mod = normalizeStreamDiffsModule(await import('stream-diffs/markstream'))
    if (!mod)
      throw new Error('Invalid stream-diffs runtime')
    await preloadStreamDiffs(mod)
    return mod
  }
  catch {
    importAttempted = true
    return null
  }
}
