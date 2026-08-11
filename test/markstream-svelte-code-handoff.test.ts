import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const codeBlockSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-svelte/src/components/CodeBlockNode.svelte'),
  'utf8',
)
const nodeOutletSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-svelte/src/components/NodeOutlet.svelte'),
  'utf8',
)
const nodeRendererSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-svelte/src/components/NodeRenderer.svelte'),
  'utf8',
)
const playgroundSource = readFileSync(
  resolve(process.cwd(), 'playground-svelte/src/App.svelte'),
  'utf8',
)

describe('markstream-svelte code block handoff geometry', () => {
  it('uses the same default font family for the fallback and highlighted surface', () => {
    expect(codeBlockSource).toContain(
      'const defaultPreFallbackFontFamily = \'"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace\'',
    )
    expect(codeBlockSource).toContain('const fontFamily = getCodeFontFamily()')
    expect(codeBlockSource).toContain('fontFamily: getCodeFontFamily()')
  })

  it('reserves the fallback two-character line-number column in stream-diffs', () => {
    const gutterRule = '--diffs-min-number-column-width-default: 2ch !important'
    expect(codeBlockSource).toContain(gutterRule)
    expect(codeBlockSource.indexOf(gutterRule)).toBeLessThan(
      codeBlockSource.lastIndexOf('configuredUnsafeCSS'),
    )
  })

  it('does not add a pixel to the single-editor height', () => {
    const heightFunctionStart = codeBlockSource.indexOf('function computeEditorContentHeight()')
    const singleEditorBranchStart = codeBlockSource.indexOf('const editor = helpers?.getEditorView?.()', heightFunctionStart)
    const singleEditorHeightBranch = codeBlockSource.slice(
      singleEditorBranchStart,
      codeBlockSource.indexOf('catch {}', singleEditorBranchStart),
    )

    expect(singleEditorHeightBranch).toContain('return Math.ceil(height)')
    expect(singleEditorHeightBranch).not.toContain('return Math.ceil(height + 1)')
  })

  it('keeps fallback line numbers aligned with neutral options and explicit props', () => {
    expect(nodeOutletSource).toContain('typeof context?.codeBlockProps?.showLineNumbers === \'boolean\'')
    expect(nodeOutletSource).toContain('typeof context?.codeBlockOptions?.disableLineNumbers === \'boolean\'')
    expect(nodeOutletSource).toContain('? !context.codeBlockOptions.disableLineNumbers')
    expect(nodeOutletSource).toContain(': false,')
    expect(nodeOutletSource).toContain('<PreCodeNode {node} showLineNumbers={preShowLineNumbers} style={preStyle} />')
  })

  it('keeps direct pre overflow aligned with enhanced fallbacks', () => {
    expect(codeBlockSource).toContain('resolvedCodeBlockOptions?.overflow === \'scroll\' ? \'pre\' : \'pre-wrap\'')
    expect(nodeOutletSource).toContain('let preStyle = $derived(context?.codeBlockOptions?.overflow')
    expect(nodeOutletSource).toContain('context.codeBlockOptions.overflow === \'scroll\' ? \'pre\' : \'pre-wrap\'')
    expect(nodeOutletSource).toContain(': undefined)')
  })

  it('reinstalls stream-diffs when neutral options or line-number precedence changes', () => {
    expect(codeBlockSource).toContain('let runtimeInstallationConfig = $derived.by(() => {')
    expect(codeBlockSource).toContain('options: { ...(resolvedCodeBlockOptions ?? {}) }')
    expect(codeBlockSource).toContain('showLineNumbers: effectiveShowLineNumbers')
    expect(codeBlockSource).toContain('lastRuntimeInstallationConfig !== runtimeInstallationConfig')
  })

  it('invalidates pending editor work before installing replacement runtime options', () => {
    expect(codeBlockSource).toContain('lifecycleId += 1')
    expect(codeBlockSource).toContain('createEditorPromise = null')
    expect(codeBlockSource).toContain('if (createEditorPromise === tracked)')
    expect(codeBlockSource).toContain('lifecycleId === creationId && helpers === activeHelpers')
    expect(codeBlockSource).toContain('if (!mounted || lifecycleId !== runtimeId || useFallback || !helpers)')
    expect(codeBlockSource).toContain('if (mounted && lifecycleId === runtimeId)\n        markEditorFallback(error)')
  })

  it('does not retain a stale static-enhancement handle after a newer render pass', () => {
    expect(nodeRendererSource).toContain('const handle = await enhanceRenderedHtml(rootEl, {')
    expect(nodeRendererSource).toContain(`if (token !== enhancementToken) {
      handle.dispose()
      return
    }
    enhancementHandle = handle`)
  })

  it('disables node enter fades on both handoff comparison renderers', () => {
    const handoffTemplate = playgroundSource.slice(
      playgroundSource.indexOf('{#if currentPath === LINE_NUMBER_HANDOFF_PATH}'),
      playgroundSource.indexOf('{:else}', playgroundSource.indexOf('{#if currentPath === LINE_NUMBER_HANDOFF_PATH}')),
    )

    expect(handoffTemplate.match(/fade=\{false\}/g)).toHaveLength(2)
  })
})
