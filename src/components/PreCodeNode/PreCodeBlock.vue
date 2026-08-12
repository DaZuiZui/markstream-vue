<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp, CodeBlockThemes, PreCodeNodeProps } from '../../types/component-props'
import type { ResolvedPreCodeVisualOptions } from './preCodeVisual'
import { computed, nextTick, onBeforeUnmount, ref, useAttrs } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import PreCodeNode from './PreCodeNode.vue'
import { resolvePreCodeThemePalette, resolvePreCodeVisualOptions } from './preCodeVisual'

interface PreCodeBlockProps extends PreCodeNodeProps {
  codeBlockOptions?: CodeBlockOptions
  darkTheme?: CodeBlockTheme
  isDark?: boolean
  lightTheme?: CodeBlockTheme
  resolvedVisualOptions?: ResolvedPreCodeVisualOptions
  showCopyButton?: boolean
  showHeader?: boolean
  showToolbar?: boolean
  showTooltips?: boolean
  theme?: CodeBlockThemeProp
  themes?: CodeBlockThemes
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<PreCodeBlockProps>(), {
  isDark: false,
  showCopyButton: true,
  showHeader: true,
  showLineNumbers: true,
  showToolbar: true,
  showTooltips: true,
})

const emit = defineEmits<{
  (event: 'copy', code: string): void
}>()

const attrs = useAttrs()
const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const preNodeRef = ref<InstanceType<typeof PreCodeNode> | null>(null)
const copyText = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined
const { t } = useSafeI18n()

const showLineNumbers = computed(() => {
  return props.showLineNumbers ?? (props.codeBlockOptions?.disableLineNumbers !== true)
})
const isDiff = computed(() => props.node?.diff === true)
const visualOptions = computed(() => props.resolvedVisualOptions
  ?? resolvePreCodeVisualOptions(props.codeBlockOptions, isDiff.value))
const themePalette = computed(() => resolvePreCodeThemePalette({
  darkTheme: props.darkTheme,
  isDark: props.isDark,
  lightTheme: props.lightTheme,
  theme: props.theme,
  themes: props.themes,
}))
const preClass = computed(() => [
  'code-pre-fallback',
  attrs.class,
  { 'is-wrap': visualOptions.value.overflow === 'wrap' },
])
const preStyle = computed<CSSProperties>(() => {
  const visual = visualOptions.value
  const horizontalPadding = props.codeBlockOptions?.padding == null
    ? '1ch'
    : `${visual.padding}px`

  return {
    '--markstream-code-font-family': visual.fontFamily,
    '--markstream-code-padding-x': horizontalPadding,
    '--markstream-code-padding-y': `${visual.padding}px`,
    '--markstream-code-padding-bottom': `${visual.paddingBottom}px`,
    '--markstream-code-scrollbar-gutter': `${visual.scrollbarGutter}px`,
    '--markstream-code-tab-size': String(visual.tabSize),
    '--markstream-pre-line-number-top': `${visual.padding}px`,
    '--markstream-pre-line-number-left': '0px',
    '--markstream-pre-line-number-padding-left': '2ch',
    '--markstream-pre-line-number-padding-right': '1ch',
    '--markstream-pre-line-number-separator-width': '2px',
    '--markstream-code-theme-bg': themePalette.value.background,
    '--markstream-code-theme-fg': themePalette.value.foreground,
    '--markstream-code-theme-line-number': themePalette.value.lineNumber,
    '--markstream-pre-resolved-theme-bg': themePalette.value.background,
    '--markstream-pre-resolved-theme-fg': themePalette.value.foreground,
    '--markstream-pre-resolved-theme-line-number': themePalette.value.lineNumber,
    '--markstream-pre-line-number-gap-to-code': horizontalPadding,
    'backgroundColor': 'var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg)))',
    'boxSizing': 'border-box',
    'color': 'var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg)))',
    'fontFamily': visual.fontFamily,
    'fontSize': `${visual.fontSize}px`,
    'lineHeight': `${visual.lineHeight}px`,
    'margin': '0',
    'maxHeight': `${visual.maxHeight}px`,
    'overflow': 'auto',
    'paddingBottom': `${visual.paddingBottom}px`,
    'paddingLeft': showLineNumbers.value
      ? 'var(--markstream-code-padding-left)'
      : horizontalPadding,
    'paddingRight': horizontalPadding,
    'paddingTop': `${visual.padding}px`,
    'scrollbarGutter': 'stable',
    'tabSize': visual.tabSize,
    'whiteSpace': visual.overflow === 'scroll' ? 'pre' : 'pre-wrap',
    'width': '100%',
  } as CSSProperties
})

function codeText() {
  return String(props.node?.code ?? '')
}

async function selectCodeContents() {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return

  await nextTick()
  const pre = preNodeRef.value?.$el as HTMLElement | undefined
  const code = pre?.querySelector('code')
  const selection = window.getSelection()
  if (!pre || pre.tagName !== 'PRE' || !code || !selection)
    return

  const range = document.createRange()
  range.selectNodeContents(code)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function writeClipboardText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined' || !document.body)
    throw new Error('Clipboard API is unavailable')

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy'))
      throw new Error('Clipboard copy command failed')
  }
  finally {
    textarea.remove()
  }
}

async function copyCode() {
  const code = codeText()
  try {
    await selectCodeContents()
    await writeClipboardText(code)
    copyText.value = true
    emit('copy', code)
    if (copyResetTimer)
      clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copyText.value = false
      copyResetTimer = undefined
    }, 1000)
  }
  catch (error) {
    copyText.value = false
    console.error('[markstream-vue] Failed to copy preformatted code.', error)
  }
}

function copyLabel() {
  return copyText.value
    ? (t('common.copied') || 'Copied')
    : (t('common.selectCopy') || '全选（复制）')
}

function onCopyHover(event: MouseEvent | FocusEvent) {
  if (props.showTooltips !== false) {
    showTooltipForAnchor(
      event.currentTarget as HTMLElement,
      copyLabel(),
      'top',
      false,
      undefined,
      undefined,
    )
  }
}

function onCopyLeave() {
  if (props.showTooltips !== false)
    hideTooltip()
}

onBeforeUnmount(() => {
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
})
</script>

<template>
  <div
    v-if="props.showToolbar && props.showHeader && props.showCopyButton"
    class="pre-code-block-toolbar code-block-header flex justify-end items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)] border-[var(--code-border)] bg-[var(--code-header-bg)] text-[var(--code-fg)]"
  >
    <button
      type="button"
      class="pre-code-block-select-copy code-action-btn inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded leading-none shrink-0 cursor-pointer text-[var(--code-action-fg)] hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] active:scale-[0.96] transition-colors"
      :aria-label="copyLabel()"
      @click.stop="copyCode"
      @mouseenter="onCopyHover"
      @focus="onCopyHover"
      @mouseleave="onCopyLeave"
      @blur="onCopyLeave"
    >
      <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1 1-2 2-2h10c1.1 0 2 2 2 2" /></g></svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
      <span>{{ copyLabel() }}</span>
    </button>
  </div>
  <PreCodeNode
    ref="preNodeRef"
    v-bind="forwardedAttrs"
    :class="preClass"
    :style="[preStyle, attrs.style]"
    :node="props.node"
    :loading="props.loading"
    :show-line-numbers="showLineNumbers"
    :diff-inline="props.diffInline"
    :diff-hide-unchanged-regions="props.diffHideUnchangedRegions"
    :reserved-height-px="props.reservedHeightPx"
    :data-markstream-code-theme="themePalette.name"
  />
</template>

<style>
.pre-code-block-toolbar {
  min-height: var(--ms-code-header-height, 2.25rem);
}

.markstream-vue pre.code-pre-fallback {
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: 0;
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg, #fff)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg, var(--code-fg))));
  backface-visibility: visible;
  transform: none;
  -webkit-font-smoothing: auto;
  font-family: var(--markstream-code-font-family);
  font-size: var(--vscode-editor-font-size, 12px);
  font-weight: 400;
  line-height: var(--vscode-editor-line-height, 18px);
}

.markstream-vue pre.code-pre-fallback > code {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.markstream-vue pre.code-pre-fallback.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.markstream-vue pre.code-pre-fallback .markstream-pre__line-numbers,
.markstream-vue pre.code-pre-fallback .markstream-pre__logical-line::before {
  color: var(--markstream-code-theme-line-number, var(--markstream-pre-resolved-theme-line-number, var(--code-line-number)));
}
</style>
