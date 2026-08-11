import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const angularCompilerEntry = require.resolve('@angular/compiler', {
  paths: [
    resolve(process.cwd(), 'packages/markstream-angular'),
    resolve(process.cwd(), 'node_modules/.pnpm/node_modules'),
  ],
})
await import(angularCompilerEntry)
const { CodeBlockNodeComponent } = await import('../packages/markstream-angular/src/components/CodeBlockNode/CodeBlockNode.component')

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createHelpers(createEditor: () => Promise<void>) {
  return {
    cleanupEditor: vi.fn(),
    createEditor: vi.fn(createEditor),
    getEditorView: vi.fn(() => null),
    safeClean: vi.fn(),
    setTheme: vi.fn(async () => {}),
    updateCode: vi.fn(async () => {}),
  }
}

describe('code block runtime generations', () => {
  it('ignores a stale Angular editor rejection while a replacement generation is pending', async () => {
    const first = deferred()
    const second = deferred()
    const firstHelpers = createHelpers(() => first.promise)
    const secondHelpers = createHelpers(() => second.promise)
    const host = document.createElement('div')
    const component = Object.create(CodeBlockNodeComponent.prototype) as any

    Object.assign(component, {
      cdr: { markForCheck: vi.fn() },
      codeBlockOptions: { overflow: 'scroll' },
      context: undefined,
      destroyed: false,
      editorHost: { nativeElement: host },
      helpers: firstHelpers,
      lifecycleId: 0,
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const value = 1',
        raw: '```ts\nconst value = 1\n```',
        loading: false,
      },
      props: { loading: false, showHeader: false },
      syncPromise: null,
      useFallback: false,
      viewReady: true,
    })
    component.applyEditorFontSize = vi.fn()
    component.prepareEditorHandoff = vi.fn(async () => true)
    component.scheduleDeferredHeightSync = vi.fn()
    component.syncEditorGeometryVars = vi.fn()

    const firstSync = component.syncEditorState()
    await vi.waitFor(() => expect(firstHelpers.createEditor).toHaveBeenCalledTimes(1))

    component.disposeRuntimeHelpers()
    component.codeBlockOptions = { overflow: 'wrap' }
    component.helpers = secondHelpers
    const secondSync = component.syncEditorState()
    await vi.waitFor(() => expect(secondHelpers.createEditor).toHaveBeenCalledTimes(1))
    const trackedSecondSync = component.syncPromise
    expect(trackedSecondSync).not.toBeNull()

    first.reject(new Error('cancelled stale editor'))
    await firstSync
    expect(component.syncPromise).toBe(trackedSecondSync)
    expect(component.useFallback).toBe(false)

    const surface = document.createElement('diffs-container')
    host.replaceChildren(surface)
    second.resolve()
    await secondSync

    expect(component.editorReady).toBe(true)
    expect(component.useFallback).toBe(false)
  })

  it('uses the same derived Angular line height for fallback and runtime options', () => {
    const component = Object.create(CodeBlockNodeComponent.prototype) as any
    Object.assign(component, {
      codeBlockOptions: { fontSize: 16 },
      context: undefined,
      fontSize: 16,
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const value = 1',
        raw: '```ts\nconst value = 1\n```',
      },
      props: {},
    })

    expect(component.preFallbackStyle['line-height']).toBe('24px')
    expect(component.buildRuntimeOptions()).toMatchObject({ fontSize: 16, lineHeight: 24 })
  })
})
