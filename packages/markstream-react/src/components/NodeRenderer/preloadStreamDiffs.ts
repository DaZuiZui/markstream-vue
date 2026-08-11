let isPreloaded = false

export async function preloadStreamDiffs(mod: any) {
  if (isPreloaded)
    return
  isPreloaded = true
  if (mod?.preloadStreamDiffs)
    await mod.preloadStreamDiffs()
}
