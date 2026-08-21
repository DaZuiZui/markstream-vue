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

describe('angular code block stability', () => {
  it('does not resync the editor for an equivalent code block node', () => {
    const component = Object.create(CodeBlockNodeComponent.prototype) as any
    Object.assign(component, {
      codeBlockOptions: undefined,
      context: undefined,
      hasEditorInput: false,
      lastCodeBlockOptions: undefined,
      lastEditorIsDiff: false,
      lastEditorLanguage: '',
      lastEditorOriginalCode: '',
      lastEditorResolvedCode: '',
      lastEditorShowLoadingPlaceholder: false,
      lastRuntimeHostKey: '',
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const value = 1',
        originalCode: 'const value = 0',
        diff: true,
        loading: false,
      },
      props: {},
      viewReady: true,
    })
    component.applyInitialFontSize = vi.fn()
    component.disposeRuntimeHelpers = vi.fn()
    component.syncEditorState = vi.fn()

    const stringify = vi.spyOn(JSON, 'stringify')

    component.ngOnChanges()
    component.node = { ...component.node }
    component.ngOnChanges()

    expect(component.syncEditorState).toHaveBeenCalledTimes(1)

    component.node = { ...component.node, code: 'const value = 2' }
    component.ngOnChanges()

    expect(component.syncEditorState).toHaveBeenCalledTimes(2)
    expect(stringify).not.toHaveBeenCalled()
  })
})
