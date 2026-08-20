import type { StreamDiffsWorkerPoolLike } from '../src/components/CodeBlockNode/streamDiffsWorker'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import {
  clearStreamDiffsWorkerPool,
  getStreamDiffsWorkerPool,
  setStreamDiffsWorkerPool,
  syncStreamDiffsWorkerTheme,
  terminateStreamDiffsWorkerPool,
} from '../src/components/CodeBlockNode/streamDiffsWorker'

function getStreamDiffsHelpers() {
  return (globalThis as any).__streamDiffsHelpers
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const helpers = getStreamDiffsHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 18,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })
  helpers.createCodeBlockRuntime.mockReset().mockImplementation(() => helpers)
  helpers.createEditor.mockReset().mockImplementation(async () => {})
  helpers.createDiffEditor.mockReset().mockImplementation(async () => {})
  helpers.updateCode.mockReset()
  helpers.updateDiff.mockReset()
  helpers.getEditor.mockReset().mockImplementation(() => null)
  helpers.getEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.cleanupEditor.mockReset().mockImplementation(() => {})
  helpers.safeClean.mockReset().mockImplementation(() => {})
  helpers.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  helpers.setTheme.mockReset().mockImplementation(async () => {})
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

function createFakePool() {
  const pool: StreamDiffsWorkerPoolLike & {
    isWorkingPool: ReturnType<typeof vi.fn>
    initialize: ReturnType<typeof vi.fn>
    setRenderOptions: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  } = {
    isWorkingPool: vi.fn(() => true),
    initialize: vi.fn(async () => {}),
    setRenderOptions: vi.fn(async () => {}),
    terminate: vi.fn(),
  }
  return pool
}

describe('stream-diffs worker pool injection', () => {
  beforeEach(() => {
    resetHelpers()
    clearStreamDiffsWorkerPool()
  })

  afterEach(() => {
    clearStreamDiffsWorkerPool()
    vi.restoreAllMocks()
  })

  it('round-trips an injected pool through set/get', () => {
    const pool = createFakePool()
    expect(getStreamDiffsWorkerPool()).toBeNull()
    setStreamDiffsWorkerPool(pool)
    expect(getStreamDiffsWorkerPool()).toBe(pool)
    setStreamDiffsWorkerPool(null)
    expect(getStreamDiffsWorkerPool()).toBeNull()
  })

  it('clearStreamDiffsWorkerPool removes the pool without terminating it', () => {
    const pool = createFakePool()
    setStreamDiffsWorkerPool(pool)
    clearStreamDiffsWorkerPool()
    expect(getStreamDiffsWorkerPool()).toBeNull()
    expect(pool.terminate).not.toHaveBeenCalled()
  })

  it('terminateStreamDiffsWorkerPool terminates and clears the pool', () => {
    const pool = createFakePool()
    setStreamDiffsWorkerPool(pool)
    terminateStreamDiffsWorkerPool()
    expect(pool.terminate).toHaveBeenCalledTimes(1)
    expect(getStreamDiffsWorkerPool()).toBeNull()
  })

  it('syncStreamDiffsWorkerTheme forwards the theme to the pool', async () => {
    const pool = createFakePool()
    setStreamDiffsWorkerPool(pool)
    await syncStreamDiffsWorkerTheme({ dark: 'github-dark', light: 'github-light' })
    expect(pool.setRenderOptions).toHaveBeenCalledWith({ theme: { dark: 'github-dark', light: 'github-light' } })
  })

  it('syncStreamDiffsWorkerTheme is a no-op without a pool', async () => {
    await expect(syncStreamDiffsWorkerTheme('vitesse-dark')).resolves.toBeUndefined()
  })

  it('syncStreamDiffsWorkerTheme swallows pool failures', async () => {
    const pool = createFakePool()
    pool.setRenderOptions.mockRejectedValueOnce(new Error('worker gone'))
    setStreamDiffsWorkerPool(pool)
    await expect(syncStreamDiffsWorkerTheme('vitesse-dark')).resolves.toBeUndefined()
  })

  it('forwards the injected pool as workerManager to the runtime options', async () => {
    const pool = createFakePool()
    setStreamDiffsWorkerPool(pool)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
        loading: false,
        stream: false,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const helpers = getStreamDiffsHelpers()
    expect(helpers.createCodeBlockRuntime).toHaveBeenCalled()
    const options = helpers.createCodeBlockRuntime.mock.calls.at(-1)?.[0] ?? {}
    expect(options.workerManager).toBe(pool)

    wrapper.unmount()
  })

  it('omits workerManager when no pool is injected', async () => {
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
        loading: false,
        stream: false,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const helpers = getStreamDiffsHelpers()
    expect(helpers.createCodeBlockRuntime).toHaveBeenCalled()
    const options = helpers.createCodeBlockRuntime.mock.calls.at(-1)?.[0] ?? {}
    expect(options.workerManager).toBeUndefined()

    wrapper.unmount()
  })

  it('syncs the resolved theme to the injected pool on mount', async () => {
    const pool = createFakePool()
    setStreamDiffsWorkerPool(pool)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
        loading: false,
        stream: false,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    expect(pool.setRenderOptions).toHaveBeenCalled()
    const [call] = pool.setRenderOptions.mock.calls.at(-1) ?? []
    // Default light theme resolves to the vitesse-light fallback name.
    expect(call.theme).toBe('vitesse-light')

    wrapper.unmount()
  })
})
