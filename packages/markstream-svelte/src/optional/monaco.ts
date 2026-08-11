let streamDiffsModule: any = null
let importAttempted = false
let pendingImport: Promise<StreamDiffsRuntimeModule | null> | null = null
let runtimePreloaded = false
let codeBlockRuntimeReady = false

export interface StreamDiffsRuntimeHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language?: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language?: string) => Promise<unknown> | unknown
  cleanupEditor?: () => unknown
  safeClean?: () => unknown
  setTheme?: (theme?: string | Record<string, unknown>) => Promise<unknown> | unknown
  getEditorView?: () => unknown
  getDiffEditorView?: () => unknown
  refreshDiffPresentation?: () => unknown
}

export interface StreamDiffsRuntimeModule {
  useMonaco: (options?: Record<string, unknown>) => StreamDiffsRuntimeHelpers
  preloadStreamDiffs?: () => Promise<unknown> | unknown
}

export function isCodeBlockRuntimeReady() {
  return codeBlockRuntimeReady
}

export function resetCodeBlockRuntimeReadyForTest() {
  codeBlockRuntimeReady = false
}

export async function preloadCodeBlockRuntime() {
  const runtime = await getStreamDiffsRuntime()
  return !!runtime
}

async function preloadRuntime(mod: any) {
  if (runtimePreloaded)
    return
  runtimePreloaded = true
  if (typeof mod?.preloadStreamDiffs === 'function')
    await mod.preloadStreamDiffs()
}

export async function getStreamDiffsRuntime(): Promise<StreamDiffsRuntimeModule | null> {
  if (streamDiffsModule)
    return streamDiffsModule
  if (pendingImport)
    return await pendingImport
  if (importAttempted)
    return null

  pendingImport = (async () => {
    // `stream-diffs` is the only supported code-block runtime in 2.0. The
    // heavy `stream-monaco` / `monaco-editor` fallback has been removed.
    try {
      const candidate = await import('stream-diffs/markstream')
      if (typeof (candidate as any)?.useMonaco !== 'function')
        return null
      streamDiffsModule = candidate
      await preloadRuntime(streamDiffsModule)
      codeBlockRuntimeReady = true
      return streamDiffsModule
    }
    catch {
      importAttempted = true
      return null
    }
  })()

  try {
    return await pendingImport
  }
  finally {
    pendingImport = null
  }
}
