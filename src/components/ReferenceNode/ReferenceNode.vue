<script setup lang="ts">
defineProps<{
  node: {
    type: 'reference'
    id: string
    raw: string
  }
  messageId?: string
  threadId?: string
}>()
defineEmits(['click', 'mouseEnter', 'mouseLeave'])
</script>

<template>
  <span
    class="reference-node cursor-pointer text-xs rounded-md px-1.5 mx-0.5"
    role="button"
    tabindex="0"
    :data-reference-id="node.id"
    :data-markstream-reference-id="node.id"
    @click="$emit('click', $event, node.id, messageId, threadId)"
    @mouseenter="$emit('mouseEnter', $event, node.id, messageId, threadId)"
    @mouseleave="$emit('mouseLeave', $event, node.id, messageId, threadId)"
  >
    {{ node.id }}
  </span>
</template>

<style scoped>
.reference-node {
  background-color: hsl(var(--ms-muted));
  color: hsl(var(--ms-muted-foreground));
}

.reference-node:hover {
  background-color: hsl(var(--ms-secondary));
}
</style>
