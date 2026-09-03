<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

const props = defineProps<{
  /** Curated next-step destinations, up to three. */
  items: { text: string, link: string, description?: string }[]
}>()

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

const label = computed(() => (isZh.value ? '下一步' : 'Next step'))
</script>

<template>
  <div v-if="props.items.length" class="ms-next-step">
    <span class="ms-next-step-label">{{ label }}</span>
    <div class="ms-next-step-grid">
      <a v-for="item in props.items" :key="item.link" :href="item.link" class="ms-next-step-card">
        <span class="ms-next-step-text">{{ item.text }}</span>
        <span v-if="item.description" class="ms-next-step-desc">{{ item.description }}</span>
        <span class="ms-next-step-arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.ms-next-step {
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--vp-c-divider);
}

.ms-next-step-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin-bottom: 0.6rem;
}

.ms-next-step-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.7rem;
}

.ms-next-step-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  position: relative;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg);
  padding: 0.75rem 2.2rem 0.75rem 0.9rem;
  text-decoration: none;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}

.ms-next-step-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-1);
  transform: translateY(-1px);
}

.ms-next-step-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.ms-next-step-desc {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.ms-next-step-arrow {
  position: absolute;
  right: 0.9rem;
  top: 0.85rem;
  color: var(--vp-c-text-3);
  font-size: 0.9rem;
  transition: transform 0.25s, color 0.25s;
}

.ms-next-step-card:hover .ms-next-step-arrow {
  transform: translateX(3px);
  color: var(--vp-c-brand-1);
}

@media (max-width: 760px) {
  .ms-next-step-grid {
    grid-template-columns: 1fr;
  }
}
</style>
