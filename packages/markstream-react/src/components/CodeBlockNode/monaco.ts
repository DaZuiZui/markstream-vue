import { preloadStreamDiffs } from '../NodeRenderer/preloadStreamDiffs'

let mod: any = null
let importAttempted = false
let pendingImport: Promise<any | null> | null = null

/**
 * Resolve the stream-diffs runtime. markstream-react 2.0 no longer supports the
 * heavy `stream-monaco` runtime — only the lightweight `stream-diffs` runtime is
 * used to render diff/single code blocks.
 */
export async function getStreamDiffsRuntime() {
  if (pendingImport)
    return pendingImport
  if (mod)
    return mod
  if (importAttempted)
    return null

  pendingImport = (async () => {
    try {
      const diffs = await import('stream-diffs/markstream')
      if (diffs?.useMonaco) {
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
