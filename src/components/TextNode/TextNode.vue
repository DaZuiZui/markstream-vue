<script setup lang="ts">
import { resolveStreamingTextUpdate } from 'markstream-core'
import { computed, inject, onScopeDispose, ref, useAttrs, watch } from 'vue'

const props = defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])
const attrs = useAttrs()
const inheritedFade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)
const inheritedTextStreamState = inject<Map<string, string> | undefined>('markstreamTextStreamState', undefined)
const inheritedStreamVersion = inject<{ value?: number } | undefined>('markstreamStreamVersion', undefined)
const explicitFade = computed<boolean | undefined>(() => {
  const raw = attrs.fade
  if (raw === '' || raw === true || raw === 'true')
    return true
  if (raw === false || raw === 'false')
    return false
  return undefined
})
const fadeEnabled = computed(() => {
  if (typeof explicitFade.value === 'boolean')
    return explicitFade.value
  if (typeof inheritedFade?.value === 'boolean')
    return inheritedFade.value
  return true
})
const streamStateKey = computed(() => {
  const raw = attrs['index-key'] ?? attrs.indexKey
  if (raw == null || raw === '')
    return ''
  return String(raw)
})
const settledContent = ref(props.node.content)
const streamedDelta = ref('')
const streamFadeVersion = ref(0)
// Template-bound value: rendered by SSR and never changed on the client, so
// Vue never patches this text node after mount (patching would mutate it and
// collapse a selection). All client updates flow through syncSettledText.
const frozenTemplateContent = ref(props.node.content)
let stopStreamVersionWatch: (() => void) | undefined

// Selection-safe settled-text rendering. Browsers collapse a Selection
// anchored inside a text node as soon as that node is mutated (nodeValue/
// data) OR replaced (verified in Chromium). The settle path used to merge
// the delta into the settled text, which re-rendered it with a NEW Text
// node — the streaming-selection bug (same class as VectoJS KNOWN_ISSUES:110).
// The settled node is therefore written ONCE and never touched again: each
// delta settle appends the increment as a NEW sibling text node, so existing
// nodes keep their identity and content forever.
const settledTextEl = ref<HTMLElement | null>(null)
const settledAppendsEl = ref<HTMLElement | null>(null)
let frozenSettledText = ''
let settledTextNode: Text | null = null
function syncSettledText() {
  const el = settledTextEl.value
  if (!el)
    return
  const text = String(settledContent.value ?? '')
  const appendsEl = settledAppendsEl.value

  if (!settledTextNode) {
    // Adopt the existing text node (including one rendered by SSR) instead
    // of rewriting it.
    settledTextNode = el.firstChild as Text | null
    frozenSettledText = settledTextNode?.data ?? ''
  }

  if (!text.startsWith(frozenSettledText)) {
    // Non-prefix replacement (message changed): rebuild everything. Any
    // selection anchored in the old content is gone with the content itself.
    el.textContent = text
    settledTextNode = el.firstChild as Text | null
    if (appendsEl)
      appendsEl.textContent = ''
    frozenSettledText = text
    return
  }

  if (!settledTextNode && text) {
    // First content write — this node is now frozen forever.
    el.textContent = text
    settledTextNode = el.firstChild as Text | null
    frozenSettledText = text
    return
  }

  if (text.length > frozenSettledText.length && appendsEl) {
    // Growth: never touch the frozen node — append a new sibling text node.
    appendsEl.appendChild(document.createTextNode(text.slice(frozenSettledText.length)))
    frozenSettledText = text
  }
}

watch([settledContent, settledTextEl, settledAppendsEl], syncSettledText, { immediate: true })

function getRenderedContent() {
  return settledContent.value + streamedDelta.value
}

function stopWatchingStreamVersion() {
  stopStreamVersionWatch?.()
  stopStreamVersionWatch = undefined
}

function settleStreamedDelta() {
  stopWatchingStreamVersion()
  if (!streamedDelta.value)
    return
  settledContent.value = getRenderedContent()
  streamedDelta.value = ''
}

function watchStreamVersionWhileDeltaActive() {
  if (!streamedDelta.value || stopStreamVersionWatch || !inheritedStreamVersion)
    return

  const activeVersion = inheritedStreamVersion.value
  stopStreamVersionWatch = watch(
    () => inheritedStreamVersion.value,
    (version) => {
      if (version !== activeVersion)
        settleStreamedDelta()
    },
    { flush: 'sync' },
  )
}

watch(
  [() => props.node.content, streamStateKey, fadeEnabled],
  ([next]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    const result = resolveStreamingTextUpdate({
      nextContent: normalized,
      persistedContent: key ? inheritedTextStreamState?.get(key) : undefined,
      currentState: { settledContent: settledContent.value, streamedDelta: streamedDelta.value },
      typewriterEnabled: fadeEnabled.value,
    })

    settledContent.value = result.settledContent
    streamedDelta.value = result.streamedDelta
    if (result.appended) {
      streamFadeVersion.value += 1
      watchStreamVersionWhileDeltaActive()
    }
    else if (!streamedDelta.value) {
      stopWatchingStreamVersion()
    }

    if (key)
      inheritedTextStreamState?.set(key, normalized)
  },
  { immediate: true },
)

onScopeDispose(stopWatchingStreamVersion)

const streamedDeltaClass = computed(() => (
  streamFadeVersion.value % 2 === 0
    ? 'text-node-stream-delta--a'
    : 'text-node-stream-delta--b'
))
</script>

<template>
  <span
    :class="[node.center ? 'text-node-center' : '']"
    class="text-node"
  >
    <span
      v-show="settledContent !== ''"
      ref="settledTextEl"
    >{{ frozenTemplateContent }}</span>
    <span
      v-show="settledContent !== ''"
      ref="settledAppendsEl"
    />
    <span
      v-if="streamedDelta"
      class="text-node-stream-delta" :class="[streamedDeltaClass]"
      @animationend="settleStreamedDelta"
    >
      {{ streamedDelta }}
    </span>
  </span>
</template>

<style scoped>
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
.text-node-center {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
.text-node-stream-delta {
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, 280ms));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1)));
  animation-fill-mode: both;
  will-change: opacity;
}
.text-node-stream-delta--a {
  animation-name: text-node-stream-update-fade-a;
}
.text-node-stream-delta--b {
  animation-name: text-node-stream-update-fade-b;
}

@keyframes text-node-stream-update-fade-a {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes text-node-stream-update-fade-b {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-node-stream-delta {
    animation: none !important;
  }
}
</style>
