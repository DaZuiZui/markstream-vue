import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const reactSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode.tsx'),
  'utf8',
)
const svelteSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-svelte/src/components/CodeBlockNode.svelte'),
  'utf8',
)
const angularSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-angular/src/components/CodeBlockNode/CodeBlockNode.component.ts'),
  'utf8',
)
const vue3Source = readFileSync(
  resolve(process.cwd(), 'src/components/CodeBlockNode/CodeBlockNode.vue'),
  'utf8',
)
const vue2Source = readFileSync(
  resolve(process.cwd(), 'packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue'),
  'utf8',
)

describe('code block handoff guards', () => {
  it('forwards the neutral disableLineNumbers option to every stream-diffs adapter', () => {
    for (const source of [vue3Source, vue2Source, reactSource, svelteSource, angularSource])
      expect(source).toContain('disableLineNumbers')
  })

  it('time-boxes the visual-readiness handoff so a hidden container never strands the block in fallback', () => {
    expect(reactSource).toContain('window.setTimeout(() => resolve(true), 1500)')
    expect(svelteSource).toContain('const deadline = Date.now() + 1500')
    expect(angularSource).toContain('const deadline = Date.now() + 1500')
  })

  it('aligns the enhanced surface tab stops via --diffs-tab-size where the fallback defaults to 4', () => {
    for (const source of [vue3Source, vue2Source, reactSource, svelteSource, angularSource])
      expect(source).toContain('--diffs-tab-size')
  })

  it('applies configured padding to the enhanced surface via --diffs-gap-block', () => {
    // stream-diffs/pierre do not consume a `padding` option; the CSS variable
    // (which inherits across the pierre shadow boundary) is the alignment
    // channel for an explicitly configured vertical gap.
    for (const source of [vue3Source, vue2Source, reactSource, svelteSource, angularSource])
      expect(source).toContain('--diffs-gap-block')
  })

  it('overlays the shared Vue fallback across the PreCodeBlock component boundary', () => {
    expect(vue3Source).toContain('.code-editor-layer > :deep(pre.code-pre-fallback)')
    expect(vue3Source).toMatch(/\.code-editor-layer > :deep\(pre\.code-pre-fallback\) \{[\s\S]*?grid-area: 1 \/ 1;/)
  })
})
