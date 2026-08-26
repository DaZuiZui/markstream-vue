import type { CodeBlockDiffHideUnchangedRegions, CodeBlockNodeProps } from '../../types/component-props'
import { defineComponent, h, inject } from 'vue'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier } from '../../utils/languageIcon'
import { MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY } from '../../utils/languageIconContext'
import { resolveLanguageIcon } from '../../utils/resolveLanguageIcon'
import {
  estimateDiffStats,
  isDiffCodeBlock,
  resolveCodeBlockHeader,
  resolveDiffHideUnchangedRegionsOption,
  resolveDiffInlineLayout,
} from '../CodeBlockNode/codeBlockHeader'
import CodeBlockShell from '../CodeBlockNode/CodeBlockShell.vue'
import PreCodeNode from '../PreCodeNode'
import { resolvePreCodeThemePalette } from '../PreCodeNode/preCodeTheme'
import { resolvePreCodeVisualOptions } from '../PreCodeNode/preCodeVisual'

type CodeBlockFallbackProps = CodeBlockNodeProps & Record<string, unknown>

export default defineComponent({
  name: 'CodeBlockNodeLoadingContent',
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
  setup(rawProps, { attrs, emit }) {
    const props = rawProps as CodeBlockFallbackProps & {
      diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
      diffInline?: boolean
      estimatedContentHeightPx?: number
      estimatedDiffInline?: boolean
      reservedHeightPx?: number
    }
    const appLanguageIconResolver = inject(MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY, undefined)

    return () => {
      const sourceLanguage = String(props.node?.language ?? '').trim().toLowerCase()
      const language = normalizeLanguageIdentifier(sourceLanguage)
      const displayLanguage = languageMap[sourceLanguage] || languageMap[language]
        || (language ? language.charAt(0).toUpperCase() + language.slice(1) : languageMap[''])
      const isDiff = isDiffCodeBlock(props.node)
      const diffStats = isDiff
        ? estimateDiffStats(
            String(props.node?.originalCode ?? ''),
            String(props.node?.updatedCode ?? ''),
          )
        : null
      const header = resolveCodeBlockHeader(
        String(props.node?.raw ?? ''),
        displayLanguage,
        isDiff,
      )
      const codeBlockOptions = props.codeBlockOptions ?? {}
      const diffInline = isDiff && (props.diffInline ?? props.estimatedDiffInline
        ?? resolveDiffInlineLayout(codeBlockOptions as unknown as Record<string, unknown>))
      const visualOptions = resolvePreCodeVisualOptions(codeBlockOptions)
      const themePalette = resolvePreCodeThemePalette({
        darkTheme: props.darkTheme,
        isDark: props.isDark,
        lightTheme: props.lightTheme,
        theme: props.theme,
        themes: props.themes,
      })
      const reservedHeight = props.estimatedContentHeightPx ?? props.reservedHeightPx
      const fallbackMaxHeight = !isDiff && typeof reservedHeight === 'number' && Number.isFinite(reservedHeight)
        ? Math.min(visualOptions.maxHeight, Math.ceil(reservedHeight))
        : visualOptions.maxHeight
      const showLineNumbers = props.showLineNumbers ?? (codeBlockOptions.disableLineNumbers !== true)
      void languageIconsRevision.value
      const languageIcon = resolveLanguageIcon(language, appLanguageIconResolver)
      const preStyle = {
        'fontSize': `${visualOptions.fontSize}px`,
        'lineHeight': `${visualOptions.lineHeight}px`,
        'tabSize': visualOptions.tabSize,
        'paddingTop': `${visualOptions.padding}px`,
        'paddingBottom': `${visualOptions.paddingBottom}px`,
        'maxHeight': `${fallbackMaxHeight}px`,
        'overflow': 'auto',
        'overflowX': visualOptions.overflow === 'wrap' ? 'hidden' : 'auto',
        'overflowY': 'auto',
        'whiteSpace': visualOptions.overflow === 'scroll' ? 'pre' : 'pre-wrap',
        'overflowWrap': visualOptions.overflow === 'wrap' ? 'anywhere' : 'normal',
        'wordBreak': 'normal',
        '--markstream-code-padding-x': `${visualOptions.padding}px`,
        '--markstream-code-padding-y': `${visualOptions.padding}px`,
        '--markstream-code-tab-size': visualOptions.tabSize,
        '--markstream-pre-line-number-top': `${visualOptions.padding}px`,
        ...(isDiff ? { '--markstream-pre-diff-line-height': `${visualOptions.lineHeight}px` } : {}),
        '--markstream-code-font-family': visualOptions.fontFamily,
        '--markstream-code-fallback-bg': themePalette.background,
        '--markstream-code-fallback-fg': themePalette.foreground,
        ...(themePalette.builtin
          ? {
              '--markstream-code-theme-bg': themePalette.background,
              '--markstream-code-theme-fg': themePalette.foreground,
              '--markstream-code-theme-line-number': themePalette.lineNumber,
            }
          : {}),
        '--markstream-diff-added-line-fill': themePalette.diffAddedLine,
        '--markstream-diff-added-number-fill': themePalette.diffAddedNumber,
        '--markstream-diff-metadata-bg': themePalette.background,
        '--markstream-diff-metadata-fg': themePalette.lineNumber,
        '--markstream-diff-removed-line-fill': themePalette.diffRemovedLine,
        '--markstream-diff-removed-number-fill': themePalette.diffRemovedNumber,
        '--markstream-pre-resolved-theme-bg': themePalette.background,
        '--markstream-pre-resolved-theme-fg': themePalette.foreground,
        '--markstream-pre-resolved-theme-line-number': themePalette.lineNumber,
        'backgroundColor': themePalette.background,
        'color': themePalette.foreground,
        'fontFamily': visualOptions.fontFamily,
      }
      const isPreviewable = props.isShowPreview !== false && (language === 'html' || language === 'svg')
      const formatSize = (value: unknown) => {
        if (value == null)
          return undefined
        return typeof value === 'number' ? `${value}px` : String(value)
      }
      const containerStyle = {
        '--code-bg': themePalette.background,
        '--code-fg': themePalette.foreground,
        '--code-line-number': themePalette.lineNumber,
        '--markstream-code-layout-character-width': '1ch',
        '--markstream-code-fallback-bg': themePalette.background,
        '--markstream-code-fallback-fg': themePalette.foreground,
        ...(themePalette.builtin
          ? {
              '--markstream-code-theme-bg': themePalette.background,
              '--markstream-code-theme-fg': themePalette.foreground,
              '--markstream-code-theme-line-number': themePalette.lineNumber,
            }
          : {}),
        '--markstream-diff-added-line-fill': themePalette.diffAddedLine,
        '--markstream-diff-added-number-fill': themePalette.diffAddedNumber,
        '--markstream-diff-editor-bg': themePalette.background,
        '--markstream-diff-removed-line-fill': themePalette.diffRemovedLine,
        '--markstream-diff-removed-number-fill': themePalette.diffRemovedNumber,
        '--markstream-diff-shell-bg': themePalette.background,
        '--markstream-pre-resolved-theme-bg': themePalette.background,
        '--markstream-pre-resolved-theme-fg': themePalette.foreground,
        '--markstream-pre-resolved-theme-line-number': themePalette.lineNumber,
        'color': themePalette.foreground,
        'backgroundColor': themePalette.background,
        ...(formatSize(props.minWidth) ? { minWidth: formatSize(props.minWidth) } : {}),
        ...(formatSize(props.maxWidth) ? { maxWidth: formatSize(props.maxWidth) } : {}),
        ...(!isDiff ? { borderColor: 'var(--markstream-code-border-color, var(--code-border))' } : {}),
      }
      return h('div', {
        ...attrs,
        'class': [
          'code-block-container',
          'rounded-lg',
          'border',
          {
            'dark': props.isDark === true,
            'is-rendering': props.loading !== false,
            'is-dark': themePalette.dark,
            'is-diff': isDiff,
            'is-plain-text': language === '' || language === 'plaintext' || language === 'text',
          },
          attrs.class,
        ],
        'style': [containerStyle, attrs.style],
        'data-markstream-code-block': '1',
        'data-markstream-enhanced': 'false',
        'data-markstream-code-block-state': props.loading ? 'streaming' : 'settled',
        'data-markstream-code-loading': '1',
      }, [h(CodeBlockShell, {
        showHeader: props.showHeader,
        showCollapseButton: props.showCollapseButton,
        showFontSizeButtons: props.showFontSizeButtons,
        enableFontSizeControl: props.enableFontSizeControl,
        showCopyButton: props.showCopyButton,
        showExpandButton: props.showExpandButton,
        showPreviewButton: props.showPreviewButton,
        showTooltips: props.showTooltips,
        isDark: props.isDark,
        loading: props.loading,
        stream: props.stream,
        isPreviewable,
        diffStats,
        diffStatsAriaLabel: diffStats ? `-${diffStats.removed} +${diffStats.added}` : undefined,
        onCopy: () => emit('copy', String(props.node?.code ?? '')),
        onPreview: () => emit('previewCode', {
          node: props.node,
          artifactType: language === 'html' ? 'text/html' : 'image/svg+xml',
          artifactTitle: language === 'html' ? 'HTML Preview' : 'SVG Preview',
          id: `temp-${language}-${Date.now()}`,
        }),
      }, {
        'header-left': () => h('div', { class: 'code-header-main' }, [
          h('span', {
            'class': 'icon-slot h-4 w-4 flex-shrink-0',
            'aria-hidden': 'true',
            'innerHTML': languageIcon,
          }),
          h('div', { class: 'code-header-copy' }, [
            h('div', { class: 'code-header-title' }, header.title),
            header.caption
              ? h('div', { class: 'code-header-caption' }, header.caption)
              : null,
          ]),
        ]),
        'default': () => h(PreCodeNode, {
          'node': props.node,
          'loading': props.loading,
          'showLineNumbers': showLineNumbers,
          'reservedHeightPx': isDiff || reservedHeight == null
            ? undefined
            : Math.min(reservedHeight, visualOptions.maxHeight),
          'diffInline': diffInline,
          'diffHideUnchangedRegions': isDiff
            ? props.diffHideUnchangedRegions ?? resolveDiffHideUnchangedRegionsOption(codeBlockOptions)
            : undefined,
          'class': ['code-pre-fallback', { 'is-wrap': visualOptions.overflow === 'wrap' }],
          'style': preStyle,
          'data-markstream-code-theme': themePalette.name,
          'data-markstream-code-loading': '1',
        }),
        'loading': () => h('div', { class: 'loading-skeleton' }, [
          h('div', { class: 'skeleton-line' }),
          h('div', { class: 'skeleton-line' }),
          h('div', { class: 'skeleton-line short' }),
        ]),
      })])
    }
  },
})
