import type { CodeBlockDiffHideUnchangedRegions, CodeBlockNodeProps } from '../../types/component-props'
import { defineComponent, h } from 'vue'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier } from '../../utils/languageIcon'
import {
  isDiffCodeBlock,
  resolveCodeBlockHeader,
  resolveDiffHideUnchangedRegionsOption,
  resolveDiffInlineLayout,
} from '../CodeBlockNode/codeBlockHeader'
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
  setup(rawProps, { attrs }) {
    const props = rawProps as CodeBlockFallbackProps & {
      diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
      diffInline?: boolean
      estimatedContentHeightPx?: number
      estimatedDiffInline?: boolean
      reservedHeightPx?: number
    }

    return () => {
      const sourceLanguage = String(props.node?.language ?? '').trim().toLowerCase()
      const language = normalizeLanguageIdentifier(sourceLanguage)
      const displayLanguage = languageMap[sourceLanguage] || languageMap[language]
        || (language ? language.charAt(0).toUpperCase() + language.slice(1) : languageMap[''])
      const isDiff = isDiffCodeBlock(props.node)
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
      const actionPlaceholder = (kind: 'copy' | 'collapse' | 'more') => h('button', {
        'class': 'code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0',
        'aria-hidden': 'true',
        'disabled': true,
        'tabindex': -1,
        'type': 'button',
      }, [kind === 'copy'
        ? h('svg', {
            class: 'action-icon',
            height: '1em',
            innerHTML: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g>',
            viewBox: '0 0 24 24',
            width: '1em',
          })
        : kind === 'collapse'
          ? h('svg', {
              class: 'action-icon',
              height: '1em',
              innerHTML: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18 6-6-6-6"/>',
              style: { rotate: '90deg' },
              viewBox: '0 0 24 24',
              width: '1em',
            })
          : h('svg', {
              class: 'action-icon',
              height: '1em',
              innerHTML: '<g fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></g>',
              viewBox: '0 0 24 24',
              width: '1em',
            })])
      const isPreviewable = props.isShowPreview !== false && (language === 'html' || language === 'svg')
      const showOverflowPlaceholder = (props.showFontSizeButtons !== false && props.enableFontSizeControl !== false)
        || props.showExpandButton !== false
        || (isPreviewable && props.showPreviewButton !== false)
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
      }, [
        props.showHeader === false
          ? null
          : h('div', {
              class: 'code-block-header flex justify-between items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)] border-[var(--code-border)] bg-[var(--code-header-bg)] text-[var(--code-fg)]',
            }, [
              h('div', {
                class: 'code-header-main',
                style: {
                  minWidth: 0,
                  flex: '1 1 auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--ms-gap-header-main, 0.625rem)',
                  overflow: 'hidden',
                },
              }, [
                h('span', {
                  'class': 'icon-slot h-4 w-4 flex-shrink-0',
                  'aria-hidden': 'true',
                  'innerHTML': getLanguageIcon(language),
                  'style': {
                    display: 'inline-flex',
                    width: '1rem',
                    height: '1rem',
                    flex: '0 0 auto',
                  },
                }),
                h('div', {
                  class: 'code-header-copy',
                  style: { minWidth: 0, display: 'grid', gap: '2px' },
                }, [
                  h('div', {
                    class: 'code-header-title',
                    style: {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 'var(--ms-text-label, 0.75rem)',
                      fontWeight: '500',
                      color: 'var(--code-action-fg)',
                    },
                  }, header.title),
                  header.caption
                    ? h('div', {
                        class: 'code-header-caption',
                        style: {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.75rem',
                          color: 'var(--code-line-number)',
                        },
                      }, header.caption)
                    : null,
                ]),
              ]),
              h('div', {
                class: 'flex items-center gap-0.5',
              }, [
                isDiff
                  ? h('div', { 'class': 'code-diff-stats', 'aria-hidden': 'true' }, [
                      h('span', { class: 'code-diff-stat removed' }, '-0'),
                      h('span', { class: 'code-diff-stat added' }, '+0'),
                    ])
                  : null,
                props.showCopyButton === false ? null : actionPlaceholder('copy'),
                props.showCollapseButton === false ? null : actionPlaceholder('collapse'),
                showOverflowPlaceholder
                  ? h('div', { class: 'relative' }, [actionPlaceholder('more')])
                  : null,
              ]),
            ]),
        h('div', {
          class: 'code-block-shell-content',
          style: props.stream !== false || props.loading === false ? undefined : { display: 'none' },
        }, [
          h(PreCodeNode, {
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
        ]),
        h('div', {
          class: 'code-loading-placeholder',
          style: props.stream === false && props.loading !== false ? undefined : { display: 'none' },
        }, [
          h('div', { class: 'loading-skeleton' }, [
            h('div', { class: 'skeleton-line' }),
            h('div', { class: 'skeleton-line' }),
            h('div', { class: 'skeleton-line short' }),
          ]),
        ]),
        h('span', { 'class': 'sr-only', 'aria-live': 'polite', 'role': 'status' }),
      ])
    }
  },
})
