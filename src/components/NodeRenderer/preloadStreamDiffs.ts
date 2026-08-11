let isPreloaded = false
let preloadPromise: Promise<void> | null = null

export async function preload(m: {
  preloadStreamDiffs?: () => Promise<unknown> | unknown
}) {
  if (isPreloaded)
    return
  if (preloadPromise)
    return preloadPromise

  const pending = (async () => {
    const preloadRuntime = m?.preloadStreamDiffs
    if (typeof preloadRuntime !== 'function') {
      isPreloaded = true
      return
    }

    await preloadRuntime()
    isPreloaded = true
  })()

  preloadPromise = pending.finally(() => {
    preloadPromise = null
  })

  return preloadPromise
}
