import type { Component, ComponentPublicInstance } from 'vue'
import type {
  CodeBlockNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
} from '../../types/component-props'
import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { isDiffCodeBlock } from '../CodeBlockNode/codeBlockHeader'
import { getKatex } from '../MathInlineNode/katex'
import PreCodeNode from '../PreCodeNode'
import { preCodeThemeLooksDark, resolvePreCodeThemeName } from '../PreCodeNode/preCodeThemeName'
import { resolvePreCodeVisualOptions } from '../PreCodeNode/preCodeVisual'
import TextNode from '../TextNode'

interface ProcessLike {
  env?: {
    NODE_ENV?: string
  }
}

type CodeBlockFallbackProps = CodeBlockNodeProps & Record<string, unknown>
type MathInlineFallbackProps = MathInlineNodeProps & Record<string, unknown>
type MathBlockFallbackProps = MathBlockNodeProps & Record<string, unknown>

function getProcessEnv() {
  const processValue = Reflect.get(globalThis, 'process') as ProcessLike | undefined
  return processValue?.env
}

export function withViewportDeferredLoading(name: string, component: Component, loadingComponent: Component) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      const registerViewport = useViewportPriority()
      const viewportPriorityOptions = useViewportPriorityOptions()
      const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
      const hydratedFromServer = typeof window !== 'undefined' && getCurrentInstance()?.vnode.el?.nodeType === 1
      const viewportReady = ref(
        typeof window === 'undefined'
        || hydratedFromServer
        || !offscreenHeavyNodeDeferral.value,
      )
      const target = shallowRef<HTMLElement | null>(null)
      let viewportHandle: ReturnType<typeof registerViewport> | null = null

      function setTarget(value: Element | ComponentPublicInstance | null) {
        const element = value && '$el' in value ? value.$el : value
        target.value = element instanceof HTMLElement ? element : null
      }

      if (typeof window !== 'undefined') {
        watch(
          [target, offscreenHeavyNodeDeferral],
          ([element, shouldDefer], _previous, onCleanup) => {
            viewportHandle?.destroy()
            viewportHandle = null

            if (!shouldDefer || viewportReady.value) {
              viewportReady.value = true
              return
            }
            if (!element)
              return

            let active = true
            const handle = registerViewport(element, {
              rootMargin: viewportPriorityOptions?.value.heavyBlockMargin,
              allowIdle: false,
            })
            viewportHandle = handle
            viewportReady.value = handle.isVisible.value
            handle.whenVisible.then(() => {
              if (active && viewportHandle === handle)
                viewportReady.value = true
            })

            onCleanup(() => {
              active = false
              handle.destroy()
              if (viewportHandle === handle)
                viewportHandle = null
            })
          },
          { immediate: true },
        )
      }

      onBeforeUnmount(() => {
        viewportHandle?.destroy()
        viewportHandle = null
      })

      return () => h(
        viewportReady.value ? component : loadingComponent,
        { ...attrs, ref: setTarget },
        slots,
      )
    },
  })
}

const CodeBlockNodeLoadingShell = defineComponent({
  name: 'CodeBlockNodeLoadingShell',
  inheritAttrs: false,
  props: [
    'node',
    'isDark',
    'loading',
    'stream',
    'codeBlockOptions',
    'showLineNumbers',
    'theme',
    'darkTheme',
    'lightTheme',
    'isShowPreview',
    'enableFontSizeControl',
    'minWidth',
    'maxWidth',
    'themes',
    'showHeader',
    'showCopyButton',
    'showExpandButton',
    'showPreviewButton',
    'showCollapseButton',
    'showFontSizeButtons',
    'showTooltips',
    'htmlPreviewAllowScripts',
    'htmlPreviewSandbox',
    'customId',
    'indexKey',
    'estimatedHeightPx',
    'estimatedContentHeightPx',
    'estimatedDiffInline',
    'diffInline',
    'diffHideUnchangedRegions',
    'reservedHeightPx',
  ],
  emits: ['click', 'mouseover', 'mouseout', 'copy', 'previewCode', 'handleArtifactClick'],
  setup(rawProps, { attrs }) {
    const props = rawProps as CodeBlockFallbackProps & {
      estimatedContentHeightPx?: number
      estimatedDiffInline?: boolean
    }
    return () => {
      const options = props.codeBlockOptions ?? {}
      const visual = resolvePreCodeVisualOptions(options)
      const themeName = resolvePreCodeThemeName(props)
      const dark = preCodeThemeLooksDark(themeName, props.isDark === true)
      const builtin = themeName === 'vitesse-dark' || themeName === 'vitesse-light'
      const palette = dark
        ? ['#121212', '#dbd7caee', '#dedcd550']
        : ['#ffffff', '#393a34', '#393a3450']
      if (!builtin) {
        palette[0] = `var(--markstream-code-theme-bg, ${palette[0]})`
        palette[1] = `var(--markstream-code-theme-fg, ${palette[1]})`
        palette[2] = `var(--markstream-code-theme-line-number, ${palette[2]})`
      }
      const isDiff = isDiffCodeBlock(props.node)
      const diffInline = isDiff && Boolean(props.diffInline ?? props.estimatedDiffInline ?? options.diffStyle === 'unified')
      const showLineNumbers = props.showLineNumbers ?? options.disableLineNumbers !== true
      const reservedHeight = Number(props.estimatedContentHeightPx ?? props.reservedHeightPx)
      const estimated = Number.isFinite(reservedHeight) && reservedHeight > 0
        ? Math.min(visual.maxHeight, Math.ceil(reservedHeight))
        : undefined
      const safeAttrs = Object.fromEntries(Object.entries(attrs).filter(([key]) => key === 'class' || key === 'style' || /^(?:data|aria)-/.test(key)))
      return h('div', {
        ...safeAttrs,
        'class': ['code-block-container', {
          'is-dark': dark,
        }, safeAttrs.class],
        'style': [{
          '--code-bg': palette[0],
          '--code-fg': palette[1],
          '--code-line-number': palette[2],
        }, safeAttrs.style],
        'data-markstream-code-block': '1',
        'data-markstream-enhanced': 'false',
        'data-markstream-code-block-state': props.loading ? 'streaming' : 'settled',
      }, [
        props.showHeader === false
          ? null
          : h('div', {
              class: 'code-block-header',
              style: { minHeight: '37px' },
            }),
        h(PreCodeNode, {
          'node': props.node,
          'loading': props.loading,
          'showLineNumbers': showLineNumbers,
          'diffInline': diffInline,
          'reservedHeightPx': estimated,
          'class': ['code-pre-fallback', {
            'is-wrap': visual.overflow === 'wrap',
          }],
          'style': {
            '--markstream-code-padding-x': `${visual.padding}px`,
            '--markstream-code-padding-y': `${visual.padding}px`,
            '--markstream-code-tab-size': visual.tabSize,
            '--markstream-pre-diff-line-height': `${visual.lineHeight}px`,
            'font': `${visual.fontSize}px/${visual.lineHeight}px ${visual.fontFamily}`,
            'maxHeight': `${estimated ?? visual.maxHeight}px`,
          },
          'data-markstream-code-loading': '1',
        }),
      ])
    }
  },
})

export const CodeBlockNodeLoading: Component = defineAsyncComponent({
  loader: () => import('./CodeBlockNodeLoading'),
  loadingComponent: CodeBlockNodeLoadingShell,
  errorComponent: CodeBlockNodeLoadingShell,
  delay: 0,
  suspensible: true,
})

export const PreCodeBlockAsync: Component = defineAsyncComponent({
  loader: () => import('../PreCodeNode/PreCodeBlock.vue'),
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: true,
})

const CodeBlockNodeInnerAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/CodeBlockNode/CodeBlockNode.vue')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Failed to load the enhanced CodeBlockNode chunk; falling back to preformatted code rendering. Enhanced code blocks require the optional "stream-diffs" peer.',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: false,
})

export const CodeBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredCodeBlockNode',
  CodeBlockNodeInnerAsync,
  CodeBlockNodeLoadingShell,
)

export const MathInlineNodeAsync = defineAsyncComponent(async () => {
  // In test environment prefer the simple text fallback to avoid
  // race conditions with workers/KaTeX rendering.
  const isTestEnv = getProcessEnv()?.NODE_ENV === 'test'
  if (isTestEnv && typeof window !== 'undefined') {
    return (props: MathInlineFallbackProps) => {
      // test fallback should be deterministic and minimal
      return h(TextNode, {
        ...props,
        node: {
          type: 'text',
          content: props.node.raw ?? `$${props.node.content ?? ''}$`,
          raw: props.node.raw ?? `$${props.node.content ?? ''}$`,
        },
      })
    }
  }

  try {
    await getKatex()
    const mod = await import('../../components/MathInlineNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathInlineNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props: MathInlineFallbackProps) => {
    return h(TextNode, {
      ...props,
      node: {
        type: 'text',
        content: props.node.raw ?? `$${props.node.content ?? ''}$`,
        raw: props.node.raw ?? `$${props.node.content ?? ''}$`,
      },
    })
  }
})

export const MathBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    await getKatex()
    const mod = await import('../../components/MathBlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathBlockNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props: MathBlockFallbackProps) => {
    return h(TextNode, {
      ...props,
      node: {
        type: 'text',
        content: props.node.raw ?? `$$${props.node.content ?? ''}$$`,
        raw: props.node.raw ?? `$$${props.node.content ?? ''}$$`,
      },
    })
  }
})
