<script setup lang="ts">
import type { ComponentCategory } from './data/components'
import { useData } from 'vitepress'
import { computed } from 'vue'
import { componentsDocData } from './data/components'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

const categoryColors: Record<ComponentCategory, string> = {
  'basic': 'var(--vp-c-brand-1)',
  'code': 'var(--vp-c-green-1)',
  'math-diagram': 'var(--vp-c-yellow-1)',
  'media': 'var(--vp-c-indigo-1)',
  'inline': 'var(--vp-c-red-1)',
  'infra': 'var(--vp-c-text-3)',
}

function categoryColor(category: ComponentCategory): string {
  return categoryColors[category] ?? 'var(--vp-c-text-3)'
}

function detailLink(slug: string): string {
  return isZh.value ? `/zh/components/${slug}` : `/components/${slug}`
}

const galleryLink = computed(() => (isZh.value ? '/zh/components/' : '/components/'))
const total = componentsDocData.length

const items = computed(() =>
  componentsDocData.map(entry => ({
    name: entry.name,
    slug: entry.slug,
    color: categoryColor(entry.category),
    peer: entry.peers.length > 0,
  })),
)
</script>

<template>
  <section class="ms-marquee-section ms-home-container">
    <div class="ms-marquee-head">
      <h2 class="ms-marquee-heading">
        {{ isZh ? `全部 ${total} 个内置组件` : `All ${total} built-in components` }}
      </h2>
      <a :href="galleryLink" class="ms-marquee-gallery">
        {{ isZh ? '逛逛组件画廊 →' : 'Browse the gallery →' }}
      </a>
    </div>
    <div class="ms-marquee">
      <div class="ms-marquee-track">
        <ul class="ms-marquee-list">
          <li v-for="item in items" :key="item.slug">
            <a :href="detailLink(item.slug)" class="ms-marquee-item">
              <span class="ms-marquee-dot" :style="{ background: item.color }" aria-hidden="true" />
              <span class="ms-marquee-name">{{ item.name }}</span>
              <span v-if="item.peer" class="ms-marquee-peer" :title="isZh ? '需要 peer 依赖' : 'Requires a peer dependency'">peer</span>
            </a>
          </li>
        </ul>
        <ul class="ms-marquee-list" aria-hidden="true">
          <li v-for="item in items" :key="`dup-${item.slug}`">
            <a :href="detailLink(item.slug)" class="ms-marquee-item" tabindex="-1">
              <span class="ms-marquee-dot" :style="{ background: item.color }" aria-hidden="true" />
              <span class="ms-marquee-name">{{ item.name }}</span>
              <span v-if="item.peer" class="ms-marquee-peer">peer</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ms-home-container {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (min-width: 768px) {
  .ms-home-container {
    padding: 0 32px;
  }
}

@media (min-width: 960px) {
  .ms-home-container {
    padding: 0 48px;
  }
}

.ms-marquee-section {
  margin-top: 2.5rem;
}

.ms-marquee-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.ms-marquee-heading {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin: 0;
}

.ms-marquee-gallery {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  white-space: nowrap;
}

.ms-marquee-gallery:hover {
  text-decoration: underline;
}

.ms-marquee {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
  mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
}

.ms-marquee-track {
  display: flex;
  width: max-content;
  animation: ms-marquee-scroll 90s linear infinite;
}

.ms-marquee:hover .ms-marquee-track {
  animation-play-state: paused;
}

@keyframes ms-marquee-scroll {
  to {
    transform: translateX(-50%);
  }
}

.ms-marquee-list {
  display: flex;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
  /* Keep the seam aligned for the -50% loop. */
  margin-right: 0.55rem;
}

.ms-marquee-item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  background: var(--vp-c-bg);
  padding: 0.32rem 0.8rem;
  text-decoration: none;
  white-space: nowrap;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ms-marquee-item:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-1);
}

.ms-marquee-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ms-marquee-name {
  font-size: 0.8rem;
  font-weight: 550;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

.ms-marquee-item:hover .ms-marquee-name {
  color: var(--vp-c-brand-1);
}

.ms-marquee-peer {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--vp-c-warning-1);
  background: var(--vp-c-warning-soft);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

@media (prefers-reduced-motion: reduce) {
  .ms-marquee-track {
    animation: none;
  }

  .ms-marquee {
    overflow-x: auto;
  }

  .ms-marquee-list {
    flex-wrap: wrap;
  }
}
</style>
