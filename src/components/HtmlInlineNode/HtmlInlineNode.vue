<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { computed, defineComponent, inject } from 'vue'
import { resolveHtmlVNodes } from '../../utils/htmlRenderer'
import { useCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    type: 'html_inline'
    tag?: string
    content: string
    loading?: boolean
    autoClosed?: boolean
  }
  customId?: string
  htmlPolicy?: HtmlPolicy
}>()

const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>('markstreamHtmlPolicy', undefined)
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => props.htmlPolicy ?? inheritedHtmlPolicy?.value ?? 'safe')

const customComponents = useCustomNodeComponents(() => props.customId)

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    nodes: {
      type: Array as () => any[],
      required: true,
    },
  },
  render() {
    return this.nodes
  },
})

// Computed property to determine render mode and content
const renderMode = computed(() => {
  const content = props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  if (resolvedHtmlPolicy.value === 'escape')
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }

  if (props.node.loading && !props.node.autoClosed)
    return { mode: 'text', content }

  // Streaming mid-state with auto-close, or completed content with custom
  // components: resolve in a single tokenize + VNode build pass. The old path
  // ran hasCustomComponents (full tokenize) and then parseHtmlToVNodes
  // (second full tokenize) back to back.
  const forceDynamic = props.node.loading === true && props.node.autoClosed === true
  const resolved = resolveHtmlVNodes(content, customComponents.value, resolvedHtmlPolicy.value, forceDynamic)
  if (resolved.ok && (forceDynamic || resolved.hasCustomComponents))
    return { mode: 'dynamic', nodes: resolved.nodes }

  return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }
})
</script>

<template>
  <span
    v-if="renderMode.mode === 'dynamic'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >
    <DynamicRenderer :nodes="renderMode.nodes" />
  </span>
  <span
    v-else-if="renderMode.mode === 'text'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >{{ renderMode.content }}</span>
  <span
    v-else
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
    v-html="renderMode.content"
  />
</template>

<style scoped>
.html-inline-node {
  display: inline;
}

.html-inline-node--loading {
  opacity: 0.85;
}
</style>
