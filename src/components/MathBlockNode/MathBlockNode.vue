<script setup lang="ts">
import type { MathBlockNodeProps } from '../../types/component-props'
import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'

import { getKatex, getKatexSync } from '../MathInlineNode/katex'
import { useMathBlockMinHeightCache } from './minHeightCache'

const props = defineProps<MathBlockNodeProps>()
const containerEl = ref<HTMLElement | null>(null)
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const mathContent = computed(() => normalizeKaTeXRenderInput(props.node.content))
const isHydrating = getCurrentInstance()?.vnode.el?.nodeType === 1
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, {})
})

function resolveInitialState() {
  if (!props.node.content) {
    return {
      html: '',
      text: props.node.raw,
      loading: false,
    }
  }

  if (props.node.loading) {
    return {
      html: '',
      text: '',
      loading: true,
    }
  }

  const katex = getKatexSync()
  if (!katex) {
    const keepHydrationFallback = typeof window === 'undefined' || isHydrating
    return {
      html: '',
      text: keepHydrationFallback ? props.node.raw : '',
      loading: !keepHydrationFallback,
    }
  }

  try {
    const html = katex.renderToString(mathContent.value, {
      throwOnError: false,
      displayMode: true,
    })
    setKaTeXCache(mathContent.value, true, html)
    return {
      html,
      text: '',
      loading: false,
    }
  }
  catch {
    return {
      html: '',
      text: props.node.loading ? '' : props.node.raw,
      loading: props.node.loading,
    }
  }
}

const initialState = resolveInitialState()
const renderedHtml = ref(initialState.html)
const renderedText = ref(initialState.text)
let hasRenderedOnce = false
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null
const minHeightCacheContext = useMathBlockMinHeightCache()
let resizeObserver: ResizeObserver | null = null
let lifecyclePendingIndexKey = ''
const renderingLoading = ref(initialState.loading)
const renderingPending = ref(false)
const lockedMinHeight = ref(resolveCachedMinHeight())

if (initialState.html)
  hasRenderedOnce = true

function markRenderPending() {
  renderingPending.value = true
}

function clearRenderPending(renderId?: number) {
  if (renderId != null && renderId !== currentRenderId)
    return

  renderingPending.value = false
}

function getHeightCacheKey() {
  if (props.indexKey == null)
    return ''

  const scope = props.cacheScope ?? minHeightCacheContext?.scope
  const scopedPrefix = scope != null && String(scope).length > 0
    ? `${String(scope)}:`
    : ''
  return `${scopedPrefix}math-block:${String(props.indexKey)}`
}

function resolveCachedMinHeight() {
  const cacheKey = getHeightCacheKey()
  return cacheKey ? (minHeightCacheContext?.cache.get(cacheKey) ?? 0) : 0
}

function clearLockedMinHeight() {
  if (lockedMinHeight.value === 0)
    return

  lockedMinHeight.value = 0
  const cacheKey = getHeightCacheKey()
  if (cacheKey)
    minHeightCacheContext?.cache.set(cacheKey, 0)
}

if (initialState.html)
  clearLockedMinHeight()

function updateLockedMinHeight(height: number) {
  if (renderedHtml.value) {
    clearLockedMinHeight()
    return
  }

  if (!Number.isFinite(height) || height <= 0)
    return

  const nextMinHeight = Math.max(lockedMinHeight.value, height)
  if (nextMinHeight === lockedMinHeight.value)
    return

  lockedMinHeight.value = nextMinHeight
  const cacheKey = getHeightCacheKey()
  if (cacheKey)
    minHeightCacheContext?.cache.set(cacheKey, nextMinHeight)
}

function captureHeight() {
  nextTick(() => {
    updateLockedMinHeight(containerEl.value?.offsetHeight ?? 0)
  })
}

function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!lifecycle || !indexKey)
    return

  if (lifecyclePendingIndexKey === indexKey)
    return

  if (lifecyclePendingIndexKey)
    lifecycle.markSettled(lifecyclePendingIndexKey)

  lifecyclePendingIndexKey = indexKey
  lifecycle.markPending(indexKey)
}

function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  nextTick(() => {
    if (!isUnmounted) {
      const height = containerEl.value?.offsetHeight ?? 0
      if (height > 0)
        lifecycle.reportHeight(indexKey, height)
    }
    lifecycle.markSettled(indexKey)
  })
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  lifecycle.markSettled(indexKey)
}

// Function to render math using KaTeX
async function renderMath() {
  if (isUnmounted) {
    clearLifecyclePending()
    clearRenderPending()
    return
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId

  if (!props.node.content) {
    clearLifecyclePending()
    clearRenderPending()
    renderingLoading.value = false
    renderedHtml.value = ''
    renderedText.value = props.node.raw
    hasRenderedOnce = false
    captureHeight()
    return
  }

  const abortController = new AbortController()
  currentAbortController = abortController

  markRenderPending()
  if (isUnmounted || renderId !== currentRenderId || abortController.signal.aborted) {
    if (!isUnmounted)
      clearRenderPending(renderId)
    return
  }

  markLifecyclePending()
  renderKaTeXWithBackpressure(mathContent.value, true, {
    timeout: 3000,
    waitTimeout: 2000,
    maxRetries: 8,
    signal: abortController.signal,
  })
    .then((html) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return
      renderedHtml.value = html
      renderedText.value = ''
      hasRenderedOnce = true
      renderingLoading.value = false
      clearLockedMinHeight()
      captureHeight()
    })
    .catch(async (err: any) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return

      // If the worker failed to initialize (e.g. bad new Worker path), the
      // worker client will return a special error with code 'WORKER_INIT_ERROR'
      // and `fallbackToRenderer = true`. In that case, perform a synchronous
      // KaTeX render on the main thread as a fallback. If the error is a
      // KaTeX render error from the worker (syntax), we should ignore it here
      // and fall through to the raw/text fallback below.
      const code = err?.code || err?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      const isDisabled = code === 'KATEX_DISABLED'

      // For blocks, also fall back to main-thread render when the worker is busy/timeout
      // under viewport bursts to avoid showing raw text.
      if (isWorkerInitFailure || (isBusyOrTimeout && !props.node.loading)) {
        const katex = await getKatex()
        if (isUnmounted || renderId !== currentRenderId)
          return

        if (katex) {
          try {
            const html = katex.renderToString(mathContent.value, {
              throwOnError: props.node.loading,
              displayMode: true,
            })
            renderedHtml.value = html
            renderedText.value = ''
            hasRenderedOnce = true
            renderingLoading.value = false
            clearLockedMinHeight()
            captureHeight()
            // populate worker client cache so future calls hit cache
            setKaTeXCache(mathContent.value, true, html)
          }
          catch {
          }
          return
        }
      }

      // show raw fallback when we never successfully rendered before or when loading flag is false

      if (isDisabled || !props.node.loading) {
        renderingLoading.value = false
        renderedHtml.value = ''
        renderedText.value = props.node.raw
        captureHeight()
        return
      }

      if (!hasRenderedOnce)
        renderingLoading.value = true
    })
    .finally(() => {
      if (!isUnmounted && renderId === currentRenderId) {
        clearRenderPending(renderId)
        markLifecycleSettled()
      }
    })
}

// Distinguish streaming appends (keep lockedMinHeight to avoid flicker) from
// content replacements (clear stale lockedMinHeight so a shorter block doesn't
// inherit the previous block's height).
//
// We extract the inner content (between delimiters) from `raw` and compare for
// prefix extension. This correctly identifies streaming appends like
// `$$x$$` -> `$$x^2$$` (inner: `x` -> `x^2`, prefix extension) even though
// the full raw strings are NOT prefix-related (the `^2` is inserted before
// the closing `$$`).
//
// We require a complete delimiter PAIR match (both open and close) before
// trusting the stripped inner content. This avoids false positives from
// one-sided strips (e.g. `\[x]` where `]` is a fallback close for `\[`).
// When no pair matches, we fall back to `content` and only allow exact
// equality (no prefix inference), which is conservative but safe.
const DELIMITER_PAIRS = [
  // Order matters: longer/more specific pairs first.
  { family: '$$', open: '$$', close: '$$' },
  { family: '\\[]', open: '\\\[', close: '\\\]' },
  // Parser-tolerated fallback close for `\[` in non-strict mode.
  { family: '\\[]', open: '\\\[', close: ']' },
  // Non-strict plain-bracket forms.
  { family: '[]', open: '[', close: '\\\]' },
  { family: '[]', open: '[', close: ']' },
  // Inline math forms (kept for tolerance when MathBlockNode is used directly).
  { family: '\\()', open: '\\\(', close: '\\\)' },
  { family: '$', open: '$', close: '$' },
] as const

function resolveTrustedInner(raw: unknown): { family: string, inner: string, trusted: boolean } | null {
  const rawText = String(raw ?? '')
  for (const { family, open, close } of DELIMITER_PAIRS) {
    // Guard against a malformed `$$...$` being parsed as single-dollar math.
    if (open === '$' && (rawText.startsWith('$$') || rawText.endsWith('$$')))
      continue

    if (
      rawText.length >= open.length + close.length
      && rawText.startsWith(open)
      && rawText.endsWith(close)
    ) {
      return {
        family,
        inner: rawText.slice(open.length, rawText.length - close.length),
        trusted: true,
      }
    }
  }
  return null
}

function getInnerContent(raw: unknown, content: unknown): { family: string, inner: string, trusted: boolean } {
  const trusted = resolveTrustedInner(raw)
  if (trusted)
    return trusted
  // No trusted delimiter pair: fall back to `content` (may be normalized).
  // Prefix-extension is not safe here, callers must require exact equality.
  return { family: 'content', inner: String(content ?? ''), trusted: false }
}

function isAppendUpdate(
  previous: { family: string, inner: string, trusted: boolean },
  next: { family: string, inner: string, trusted: boolean },
) {
  if (previous.inner === '')
    return true
  // Different delimiter families: always treat as replacement.
  if (previous.family !== next.family)
    return false
  // Prefix reuse is only allowed when both sides came from a complete,
  // recognized delimiter pair. Otherwise require exact equality to avoid
  // false positives from normalization (e.g. `alpha` -> `\alpha`).
  if (previous.trusted && next.trusted)
    return next.inner.startsWith(previous.inner)
  return next.inner === previous.inner
}

// Coalesce streaming math renders: token bursts often produce several
// content commits within one frame, and each renderMath() call aborts the
// in-flight worker request. Deduplicate identical content and merge rapid
// streaming appends into a single render burst (32ms window). Final/complete
// content (loading=false) renders immediately.
let mathRenderCoalesceTimer: ReturnType<typeof setTimeout> | null = null
let lastMathRenderRequestKey = `${mathContent.value}\u0000${props.node.loading ? '1' : '0'}`

function scheduleMathRender() {
  const content = mathContent.value
  const isStreaming = props.node.loading === true
  // The worker-busy fallback path is loading-dependent, so the dedupe key
  // must include the loading flag: identical content with a different
  // loading state still needs a fresh render attempt.
  const requestKey = `${content}\u0000${isStreaming ? '1' : '0'}`
  if (requestKey === lastMathRenderRequestKey)
    return
  lastMathRenderRequestKey = requestKey

  if (!isStreaming) {
    if (mathRenderCoalesceTimer != null) {
      clearTimeout(mathRenderCoalesceTimer)
      mathRenderCoalesceTimer = null
    }
    renderMath()
    return
  }

  if (mathRenderCoalesceTimer != null)
    return
  mathRenderCoalesceTimer = setTimeout(() => {
    mathRenderCoalesceTimer = null
    renderMath()
  }, 32)
}

watch(
  () => [props.node.content, props.node.loading, props.node.raw] as const,
  ([content, , raw], [previousContent, , previousRaw]) => {
    const previous = getInnerContent(previousRaw, previousContent)
    const next = getInnerContent(raw, content)
    const appendOnly = isAppendUpdate(previous, next)

    if (!appendOnly)
      clearLockedMinHeight()

    scheduleMathRender()
  },
  { flush: 'post' },
)

watch(
  [() => props.indexKey, () => props.cacheScope],
  () => {
    lockedMinHeight.value = resolveCachedMinHeight()
    captureHeight()
  },
)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && containerEl.value) {
    resizeObserver = new ResizeObserver(() => {
      updateLockedMinHeight(containerEl.value?.offsetHeight ?? 0)
    })
    resizeObserver.observe(containerEl.value)
  }

  captureHeight()

  if (renderedHtml.value)
    return
  renderMath()
})

onBeforeUnmount(() => {
  // prevent any pending worker responses from touching the DOM
  isUnmounted = true
  if (mathRenderCoalesceTimer != null) {
    clearTimeout(mathRenderCoalesceTimer)
    mathRenderCoalesceTimer = null
  }
  clearLifecyclePending()
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="containerEl"
    class="math-block text-center overflow-x-auto relative"
    data-markstream-math="block"
    :data-markstream-mode="renderedHtml ? 'katex' : renderedText ? 'fallback' : 'loading'"
    :data-markstream-pending="renderingPending ? 'true' : undefined"
    :style="lockedMinHeight ? { minHeight: `${lockedMinHeight}px` } : undefined"
  >
    <Transition name="math-fade">
      <div v-if="renderingLoading && !renderedHtml && !renderedText" class="math-loading-overlay">
        <div class="math-loading-spinner" />
      </div>
    </Transition>
    <div
      v-if="renderedHtml"
      class="math-block__content"
      :class="{ 'math-rendering': renderingLoading }"
      v-html="renderedHtml"
    />
    <pre v-else-if="renderedText" class="math-block__fallback text-left">{{ renderedText }}</pre>
    <div v-else class="math-block__content" :class="{ 'math-rendering': renderingLoading }" />
  </div>
</template>

<style scoped>
.math-block {
  min-height: var(--ms-size-math-min-height);
  transition: min-height var(--ms-duration-overlay) var(--ms-ease-standard);
}

.math-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  min-height: var(--ms-size-math-min-height);
}

.math-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid color-mix(in srgb, var(--loading-spinner) 15%, transparent);
  border-top-color: color-mix(in srgb, var(--loading-spinner) 80%, transparent);
  border-radius: 50%;
  animation: math-spin 0.8s linear infinite;
}

@keyframes math-spin {
  to {
    transform: rotate(360deg);
  }
}

.math-rendering {
  opacity: 0.3;
  transition: opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}

.math-block__fallback {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}

.math-fade-enter-active,
.math-fade-leave-active {
  transition: all var(--ms-duration-slow) var(--ms-ease-standard);
}

.math-fade-enter-from,
.math-fade-leave-to {
  opacity: 0;
}

/* Dark mode spinner now handled by --loading-spinner token; no override needed */
</style>
