import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Verifies the stream-diffs-only loader contract shared by all framework
 * packages: `stream-diffs/markstream` is the sole enhanced-code-block runtime, and a
 * null result lets callers degrade to <pre> rendering.
 */

interface LoaderModule {
  createCodeBlockRuntime?: (options?: unknown) => unknown
  preloadStreamDiffs?: () => Promise<unknown>
  default?: LoaderModule
}

const LOADERS = [
  ['react', '../../packages/markstream-react/src/components/CodeBlockNode/streamDiffs.ts', 'getStreamDiffsRuntime'],
  ['svelte', '../../packages/markstream-svelte/src/optional/streamDiffs.ts', 'getStreamDiffsRuntime'],
  ['angular', '../../packages/markstream-angular/src/optional/streamDiffs.ts', 'getStreamDiffsRuntime'],
  ['vue2', '../../packages/markstream-vue2/src/components/CodeBlockNode/streamDiffs.ts', 'getStreamDiffsRuntime'],
] as const

function runtimeModule(runtimeHelpers: Record<string, string>) {
  const runtime = {
    createCodeBlockRuntime: () => runtimeHelpers,
    detectLanguage: () => 'plaintext',
    preloadStreamDiffs: async () => {},
  }
  // Loaders normalize through `mod.default ?? mod`, so expose both shapes.
  return {
    ...runtime,
    default: runtime,
  }
}

async function getLoader(loaderPath: string, exportName: string) {
  vi.resetModules()
  const mod = await import(loaderPath) as Record<string, () => Promise<LoaderModule | null>>
  const loader = mod[exportName]
  expect(typeof loader).toBe('function')
  return loader
}

afterEach(() => {
  vi.resetModules()
})

describe('stream-diffs-only code block loader', () => {
  it.each(LOADERS)('%s loader loads stream-diffs when available', async (_name, loaderPath, exportName) => {
    vi.doMock('stream-diffs/markstream', () => runtimeModule({ runtime: 'stream-diffs' }))

    const loader = await getLoader(loaderPath, exportName)
    const modules = await Promise.all([loader(), loader()])
    expect(modules.every(Boolean)).toBe(true)
    expect(modules[0]?.createCodeBlockRuntime?.()).toEqual({ runtime: 'stream-diffs' })
  })

  it.each(LOADERS)('%s loader returns null when stream-diffs is absent', async (_name, loaderPath, exportName) => {
    vi.doMock('stream-diffs/markstream', () => {
      throw new Error('stream-diffs not installed')
    })

    const loader = await getLoader(loaderPath, exportName)
    const mod = await loader()
    expect(mod).toBeNull()
  })

  it('keeps concurrent React callers behind the runtime preload', async () => {
    let releasePreload: (() => void) | undefined
    const preload = vi.fn(() => new Promise<void>((resolve) => {
      releasePreload = resolve
    }))
    const runtime = {
      createCodeBlockRuntime: () => ({ runtime: 'stream-diffs' }),
      detectLanguage: () => 'plaintext',
      preloadStreamDiffs: preload,
    }
    vi.doMock('stream-diffs/markstream', () => runtime)

    const loader = await getLoader('../../packages/markstream-react/src/components/CodeBlockNode/streamDiffs.ts', 'getStreamDiffsRuntime')
    const first = loader()
    await vi.waitFor(() => expect(preload).toHaveBeenCalledTimes(1))

    let secondSettled = false
    const second = loader().then((module) => {
      secondSettled = true
      return module
    })
    await Promise.resolve()
    expect(secondSettled).toBe(false)

    releasePreload?.()
    const modules = await Promise.all([first, second])
    expect(modules.every(Boolean)).toBe(true)
  })

  it('does not cache the React runtime when preload fails', async () => {
    vi.doMock('stream-diffs/markstream', () => ({
      createCodeBlockRuntime: () => ({ runtime: 'stream-diffs' }),
      detectLanguage: () => 'plaintext',
      preloadStreamDiffs: vi.fn(async () => {
        throw new Error('runtime preload failed')
      }),
    }))

    const loader = await getLoader('../../packages/markstream-react/src/components/CodeBlockNode/streamDiffs.ts', 'getStreamDiffsRuntime')
    await expect(loader()).resolves.toBeNull()
    await expect(loader()).resolves.toBeNull()
  })
})
