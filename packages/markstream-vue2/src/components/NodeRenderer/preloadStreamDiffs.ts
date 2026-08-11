let isPreload = false

export async function preload(m: any) {
  if (isPreload)
    return
  isPreload = true
  return m.preloadStreamDiffs?.()
}
