<script setup lang="ts">
import type { ComponentDocEntry } from './data/components'
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDark } from './composables/useDark'
import { componentsDocData } from './data/components'
import { needsCodeFallback, optionalMarkdownIt } from './optionalMarkdownIt'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

// One card per built-in component, driven by the same data file as the
// gallery. The deck is split into waves that autoplay: each wave streams its
// markdown once, then advances to the next wave. Hovering pauses autoplay.
interface ShowcaseCard extends ComponentDocEntry {
  /** Cells with no live preview (API-only) never stream. */
  streamable: boolean
  /** Cells whose snippet cannot live-render without extra plugins. */
  codeFallback: boolean
}

const cards = computed<ShowcaseCard[]>(() =>
  componentsDocData.map(entry => ({
    ...entry,
    streamable: entry.mdSnippet.length > 0 && !needsCodeFallback(entry.slug),
    codeFallback: needsCodeFallback(entry.slug),
  })),
)

const GROUP_SIZE_DESKTOP = 6
const GROUP_SIZE_MOBILE = 2

const isMobileViewport = ref(false)
let resizeListener: (() => void) | undefined

function updateViewportKind() {
  isMobileViewport.value = window.innerWidth < 760
}

const groups = computed(() => {
  const size = isMobileViewport.value ? GROUP_SIZE_MOBILE : GROUP_SIZE_DESKTOP
  const out: ShowcaseCard[][] = []
  for (let i = 0; i < cards.value.length; i += size)
    out.push(cards.value.slice(i, i + size))
  return out
})

const currentGroup = ref(0)

const PAUSE_BETWEEN_WAVES_MS = 2600
const WAVE_STREAM_TIMEOUT_MS = 4500

type CardState = 'full' | 'skeleton' | 'playing' | 'done'

// SSR renders every card statically (full / skeleton for heavy peers), so
// hydration starts identical and SSG keeps the content for SEO. Autoplay
// only re-streams a wave after the carousel enters the viewport.
const cardStates = ref<CardState[]>(
  cards.value.map(card => (card.heavy && card.streamable ? 'skeleton' : 'full')),
)
const streamed = ref<string[]>(cards.value.map(() => ''))

function resetDeck() {
  stopAllStreams()
  cardStates.value = cards.value.map(card => (card.heavy && card.streamable ? 'skeleton' : 'full'))
  streamed.value = cards.value.map(() => '')
}

watch(cards, () => {
  resetDeck()
  currentGroup.value = 0
})

watch(isMobileViewport, () => {
  // Grouping changed; restart the show from the first wave.
  resetDeck()
  currentGroup.value = 0
})

const timers: (ReturnType<typeof setInterval> | undefined)[] = []

function stopCardStream(index: number) {
  if (timers[index]) {
    clearInterval(timers[index])
    timers[index] = undefined
  }
}

function stopAllStreams() {
  timers.forEach((_, i) => stopCardStream(i))
}

function playCard(index: number) {
  const card = cards.value[index]
  if (!card || !card.streamable) {
    cardStates.value[index] = 'done'
    return
  }
  stopCardStream(index)
  const full = card.mdSnippet
  let cursor = 0
  streamed.value[index] = ''
  cardStates.value[index] = 'playing'
  timers[index] = setInterval(() => {
    const size = 3 + Math.floor(Math.random() * 5)
    cursor = Math.min(full.length, cursor + size)
    streamed.value[index] = full.slice(0, cursor)
    if (cursor >= full.length) {
      stopCardStream(index)
      cardStates.value[index] = 'done'
    }
  }, 36)
}

function cardIndexInDeck(groupIndex: number, offset: number): number {
  const size = isMobileViewport.value ? GROUP_SIZE_MOBILE : GROUP_SIZE_DESKTOP
  return groupIndex * size + offset
}

function renderContent(index: number): string {
  if (cardStates.value[index] === 'playing')
    return streamed.value[index]
  return cards.value[index]?.mdSnippet ?? ''
}

// --- Autoplay ----------------------------------------------------------------

const autoplayPausedByHover = ref(false)
const autoplayInView = ref(false)
const prefersReducedMotion
  = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let advanceTimer: ReturnType<typeof setTimeout> | undefined
let waveWatchTimer: ReturnType<typeof setTimeout> | undefined

function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = undefined
  }
}

function clearWaveWatchTimer() {
  if (waveWatchTimer) {
    clearTimeout(waveWatchTimer)
    waveWatchTimer = undefined
  }
}

function waveIsSettled(groupIndex: number): boolean {
  const group = groups.value[groupIndex] ?? []
  return group.every((_, offset) => {
    const index = cardIndexInDeck(groupIndex, offset)
    const state = cardStates.value[index]
    return state === 'done' || state === 'full'
  })
}

function scheduleAdvance() {
  clearAdvanceTimer()
  if (autoplayPausedByHover.value || !autoplayInView.value || prefersReducedMotion)
    return
  advanceTimer = setTimeout(() => {
    advanceTimer = undefined
    goToGroup((currentGroup.value + 1) % groups.value.length)
  }, PAUSE_BETWEEN_WAVES_MS)
}

function watchWaveAndAdvance(groupIndex: number) {
  clearWaveWatchTimer()
  const check = () => {
    if (autoplayPausedByHover.value) {
      waveWatchTimer = setTimeout(check, 400)
      return
    }
    if (waveIsSettled(groupIndex)) {
      waveWatchTimer = undefined
      scheduleAdvance()
      return
    }
    waveWatchTimer = setTimeout(check, 250)
  }
  waveWatchTimer = setTimeout(check, 250)
  // Safety net: never let a stuck stream block the carousel.
  setTimeout(() => {
    if (waveWatchTimer) {
      clearWaveWatchTimer()
      scheduleAdvance()
    }
  }, WAVE_STREAM_TIMEOUT_MS)
}

function goToGroup(groupIndex: number, options: { autoplay?: boolean } = {}) {
  const total = groups.value.length
  if (!total)
    return
  clearAdvanceTimer()
  clearWaveWatchTimer()
  currentGroup.value = ((groupIndex % total) + total) % total

  const group = groups.value[currentGroup.value] ?? []
  group.forEach((card, offset) => {
    const index = cardIndexInDeck(currentGroup.value, offset)
    if (card.streamable)
      playCard(index)
    else
      cardStates.value[index] = 'done'
  })

  if (options.autoplay !== false)
    watchWaveAndAdvance(currentGroup.value)
}

function replayCurrentCard(groupIndex: number, offset: number) {
  const index = cardIndexInDeck(groupIndex, offset)
  const card = cards.value[index]
  if (!card?.streamable)
    return
  playCard(index)
}

function previousGroup() {
  goToGroup(currentGroup.value - 1)
}

function nextGroup() {
  goToGroup(currentGroup.value + 1)
}

function onHoverChange(paused: boolean) {
  autoplayPausedByHover.value = paused
  if (paused) {
    clearAdvanceTimer()
  }
  else {
    // Resume: if the wave already settled, restart the countdown.
    if (!waveWatchTimer && waveIsSettled(currentGroup.value))
      scheduleAdvance()
  }
}

let viewportObserver: IntersectionObserver | undefined

onMounted(() => {
  updateViewportKind()
  resizeListener = () => updateViewportKind()
  window.addEventListener('resize', resizeListener, { passive: true })

  const root = document.querySelector('.ms-showcase-carousel')
  if (!root)
    return

  if (prefersReducedMotion) {
    autoplayInView.value = false
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    autoplayInView.value = true
    return
  }

  viewportObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        autoplayInView.value = entry.isIntersecting
        if (entry.isIntersecting) {
          // Replay the current wave whenever the carousel scrolls into view,
          // so visitors always catch the streaming demo.
          goToGroup(currentGroup.value)
        }
        else {
          clearAdvanceTimer()
          clearWaveWatchTimer()
        }
      }
    },
    { rootMargin: '0px' },
  )
  viewportObserver.observe(root)
})

onBeforeUnmount(() => {
  viewportObserver?.disconnect()
  viewportObserver = undefined
  resizeListener && window.removeEventListener('resize', resizeListener)
  clearAdvanceTimer()
  clearWaveWatchTimer()
  stopAllStreams()
})
</script>

<template>
  <div class="ms-showcase-section ms-home-container">
    <div class="ms-showcase-head">
      <div>
        <h2 class="ms-showcase-heading">
          {{ isZh ? '开箱即用的渲染能力' : 'What you get out of the box' }}
        </h2>
        <p class="ms-showcase-subtitle">
          {{
            isZh
              ? `全部 ${cards.length} 个内置组件自动轮播 — 每一波都会逐 token 流式播放一遍；悬停暂停，移开恢复。`
              : `All ${cards.length} built-in components on autoplay — every wave replays its markdown as a token stream. Hover to pause, move away to resume.`
          }}
        </p>
      </div>
      <div class="ms-showcase-dots" role="tablist" :aria-label="isZh ? '选择轮播组' : 'Choose a wave'">
        <button
          v-for="(group, gi) in groups"
          :key="gi"
          type="button"
          class="ms-showcase-dot"
          :class="{ active: gi === currentGroup }"
          :aria-label="isZh ? `第 ${gi + 1} 组` : `Wave ${gi + 1}`"
          @click="goToGroup(gi)"
        />
      </div>
    </div>

    <div
      class="ms-showcase-carousel"
      @mouseenter="onHoverChange(true)"
      @mouseleave="onHoverChange(false)"
    >
      <button
        type="button"
        class="ms-showcase-nav prev"
        :aria-label="isZh ? '上一组' : 'Previous wave'"
        @click="previousGroup"
      >
        ‹
      </button>
      <button
        type="button"
        class="ms-showcase-nav next"
        :aria-label="isZh ? '下一组' : 'Next wave'"
        @click="nextGroup"
      >
        ›
      </button>

      <div
        v-for="(group, gi) in groups"
        :key="gi"
        class="ms-showcase-wave"
        :class="{ active: gi === currentGroup }"
        :aria-hidden="gi !== currentGroup"
      >
        <article
          v-for="(card, offset) in group"
          :key="card.slug"
          class="ms-showcase-card"
        >
          <div class="ms-showcase-card-head">
            <a :href="isZh ? `/zh/components/${card.slug}` : `/components/${card.slug}`" class="ms-showcase-card-name">
              {{ card.name }}
            </a>
            <div class="ms-showcase-card-tools">
              <span v-if="card.peers.length" class="ms-showcase-peer">{{ card.peers.join(' · ') }}</span>
              <button
                v-if="card.streamable"
                type="button"
                class="ms-showcase-replay"
                :aria-label="isZh ? `重播「${card.name}」` : `Replay ${card.name}`"
                @click="replayCurrentCard(gi, offset)"
              >
                ⟳
              </button>
            </div>
          </div>
          <div class="ms-showcase-preview">
            <div v-if="cardStates[cardIndexInDeck(gi, offset)] === 'skeleton'" class="ms-showcase-skeleton" aria-hidden="true" />
            <pre v-else-if="card.codeFallback" class="ms-showcase-codefallback"><code>{{ card.mdSnippet }}</code></pre>
            <div v-else-if="!card.mdSnippet" class="ms-showcase-api" aria-hidden="true">
              <code>{{ card.name }}</code>
            </div>
            <MarkdownRender
              v-else
              :key="card.slug"
              :content="renderContent(cardIndexInDeck(gi, offset))"
              :is-dark="isDark"
              :custom-markdown-it="optionalMarkdownIt(card.slug)"
              :typewriter="cardStates[cardIndexInDeck(gi, offset)] !== 'full'"
              :final="cardStates[cardIndexInDeck(gi, offset)] !== 'playing'"
              :fade="false"
            />
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-home-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (min-width: 640px) {
  .ms-home-container {
    padding: 0 48px;
  }
}

@media (min-width: 960px) {
  .ms-home-container {
    padding: 0 64px;
  }
}

.ms-showcase-section {
  margin-top: 2.5rem;
}

.ms-showcase-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.ms-showcase-heading {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin: 0 0 0.35rem;
}

.ms-showcase-subtitle {
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  margin: 0;
}

.ms-showcase-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding-bottom: 0.2rem;
  flex-shrink: 0;
}

.ms-showcase-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  background: var(--vp-c-border);
  transition: background 0.2s, transform 0.2s;
}

.ms-showcase-dot:hover {
  background: var(--vp-c-text-3);
}

.ms-showcase-dot.active {
  background: var(--vp-c-brand-1);
  transform: scale(1.15);
}

.ms-showcase-carousel {
  position: relative;
  /* Two rows of fixed-height cards; the mobile layout keeps two cards. */
  height: 632px;
}

.ms-showcase-wave {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 1rem;
  opacity: 0;
  visibility: hidden;
  transform: translateY(10px);
  transition: opacity 0.35s ease, transform 0.35s ease, visibility 0.35s;
  pointer-events: none;
}

.ms-showcase-wave.active {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.ms-showcase-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
  opacity: 0;
}

.ms-showcase-carousel:hover .ms-showcase-nav,
.ms-showcase-nav:focus-visible {
  opacity: 1;
}

.ms-showcase-nav:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-1);
}

.ms-showcase-nav.prev {
  left: -14px;
}

.ms-showcase-nav.next {
  right: -14px;
}

.ms-showcase-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  padding: 0.75rem 0.9rem 0.9rem;
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.ms-showcase-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-2);
}

.ms-showcase-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
  min-height: 1.5rem;
}

.ms-showcase-card-name {
  font-size: 0.82rem;
  font-weight: 650;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ms-showcase-card-name:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.ms-showcase-card-tools {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.ms-showcase-peer {
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--vp-c-warning-1);
  background: var(--vp-c-warning-soft);
  border-radius: 999px;
  padding: 0.08rem 0.45rem;
  white-space: nowrap;
}

.ms-showcase-replay {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  width: 1.5rem;
  height: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s;
}

.ms-showcase-card:hover .ms-showcase-replay,
.ms-showcase-replay:focus-visible {
  opacity: 1;
}

.ms-showcase-replay:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

/* Fixed height keeps the wave (and the page) from reflowing while streaming. */
.ms-showcase-preview {
  height: 216px;
  overflow: hidden;
  font-size: 0.82rem;
  line-height: 1.55;
}

.ms-showcase-preview :deep(pre) {
  margin: 0.3rem 0;
}

/* The mermaid block ships a ~360px interactive preview area, which would
   push its diagram below the fixed-height box. Shrink it to fit. */
.ms-showcase-preview :deep(.mermaid-preview-area),
.ms-showcase-preview :deep(._mermaid),
.ms-showcase-preview :deep(._mermaid > div) {
  min-height: 150px !important;
  height: 150px !important;
}

/* Same for the infographic block: its preview area defaults to 400px and
   its diagram is taller than the box, so shrink the area and let the SVG
   scale down to fit, centered. */
.ms-showcase-preview :deep(.infographic-preview),
.ms-showcase-preview :deep(.infographic-preview > div),
.ms-showcase-preview :deep(.infographic-preview > div > div) {
  min-height: 140px !important;
  height: 140px !important;
}

.ms-showcase-preview :deep(.infographic-preview svg) {
  max-height: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
}

.ms-showcase-skeleton {
  height: 100%;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
}

.ms-showcase-codefallback {
  margin: 0.3rem 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  overflow: auto;
  font-size: 0.72rem;
  line-height: 1.5;
}

.ms-showcase-codefallback code {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  white-space: pre;
}

.ms-showcase-api {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

@media (max-width: 759px) {
  .ms-showcase-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .ms-showcase-carousel {
    height: 616px;
  }

  .ms-showcase-wave {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .ms-showcase-nav.prev {
    left: -6px;
  }

  .ms-showcase-nav.next {
    right: -6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ms-showcase-wave {
    transition: none;
    transform: none;
  }

  .ms-showcase-nav {
    opacity: 1;
  }
}
</style>
