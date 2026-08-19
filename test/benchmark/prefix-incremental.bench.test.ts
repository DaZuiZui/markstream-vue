/**
 * Micro-benchmark: incremental fallback-height prefix rebuild vs full rebuild.
 * The pre-optimization behavior is equivalent to marking the whole prefix
 * dirty (mark(0)) on every commit; the optimized path marks only the dirty
 * tail (mark(dirtyStart)) and resumes from the cached prefix.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { useHeightMeasurements } from '../../src/components/NodeRenderer/composables/useHeightMeasurements'
import { getHeightCacheWidthBucket, useHeightModel } from '../../src/components/NodeRenderer/composables/useHeightModel'

function paragraph(raw: string): any {
  return { type: 'paragraph', raw, children: [] }
}

function estimateNodeHeight(node: any) {
  const text = String(node?.raw ?? '')
  return { height: Math.max(28, Math.min(28 + text.length, 120)), contentHeight: 28, kind: 'simple-text' as const }
}

function setup(nodes: any[]) {
  const nodesRef = ref(nodes)
  const active = ref(true)
  const width = ref(640)
  const measurements = useHeightMeasurements()
  const estimates = ref<Array<{ height: number, contentHeight: number, kind: 'simple-text' } | null>>(nodes.map(n => estimateNodeHeight(n)))
  const model = useHeightModel({
    parsedNodes: computed(() => nodesRef.value),
    nodeHeights: measurements.nodeHeights,
    heightStats: measurements.heightStats,
    heightTreeSize: measurements.heightTreeSize,
    heightSumTree: measurements.heightSumTree,
    heightKnownTree: measurements.heightKnownTree,
    averageNodeHeight: measurements.averageNodeHeight,
    heightEstimationActive: computed(() => active.value),
    estimatedNodeHeights: computed(() => estimates.value),
    getContainerWidth: () => width.value,
    getPrefixCacheKeyParts: () => [
      getHeightCacheWidthBucket(width.value),
      active.value ? 1 : 0,
    ],
    fenwickRangeSum: measurements.fenwickRangeSum,
  })
  return { model, nodesRef, estimates, measurements }
}

describe('fallback prefix incremental benchmark', () => {
  it('measures incremental vs full invalidations', async () => {
    const N0 = 2000
    const appends = 200
    const chunk = 10
    const nodes = Array.from({ length: N0 }, (_, i) => paragraph(`node ${i} ${'x'.repeat(i % 40)}`))

    const { model, nodesRef, estimates } = setup(nodes)
    // Warm up + build the full prefix once
    model.estimateHeightRange(0, N0)
    let totalMs = 0
    const iterations = 20

    for (let iter = 0; iter < iterations; iter++) {
      const base = N0
      const start = performance.now()
      for (let a = 0; a < appends; a++) {
        const next = base + (a + 1) * chunk
        const additions = Array.from({ length: chunk }, (_, i) => paragraph(`appended ${a}.${i} ${'y'.repeat((a + i) % 50)}`))
        nodesRef.value = [...nodesRef.value, ...additions]
        estimates.value = [...estimates.value, ...additions.map(n => estimateNodeHeight(n))]
        const dirtyStart = base + a * chunk
        // incremental path: only dirty tail invalidated
        model.markFallbackHeightPrefixDirty(dirtyStart)
        model.estimateHeightRange(dirtyStart, next)
        void dirtyStart
      }
      totalMs += performance.now() - start
      nodesRef.value.splice(N0)
      estimates.value.splice(N0)
      model.markFallbackHeightPrefixDirty(0)
      model.estimateHeightRange(0, N0)
    }
    const incrementalMs = totalMs / iterations

    const { model: modelFull, nodesRef: nodesFull } = setup(nodes)
    modelFull.estimateHeightRange(0, N0)
    totalMs = 0
    for (let iter = 0; iter < iterations; iter++) {
      const base = N0
      const start = performance.now()
      for (let a = 0; a < appends; a++) {
        const next = base + (a + 1) * chunk
        const additions = Array.from({ length: chunk }, (_, i) => paragraph(`appended ${a}.${i} ${'y'.repeat((a + i) % 50)}`))
        nodesFull.value = [...nodesFull.value, ...additions]
        // full path: everything invalidated (pre-optimization behavior)
        modelFull.markFallbackHeightPrefixDirty(0)
        modelFull.estimateHeightRange(0, next)
      }
      totalMs += performance.now() - start
      nodesFull.value.splice(N0)
      modelFull.markFallbackHeightPrefixDirty(0)
      modelFull.estimateHeightRange(0, N0)
    }
    const fullMs = totalMs / iterations

    // Correctness (outside the timed loops): the incremental prefix must
    // agree with a forced full rebuild at every sampled commit.
    {
      const { model: modelInc, nodesRef: nodesInc, estimates: estimatesInc } = setup(nodes)
      modelInc.estimateHeightRange(0, N0)
      let base = N0
      for (let a = 0; a < appends; a++) {
        const next = base + (a + 1) * chunk
        const additions = Array.from({ length: chunk }, (_, i) => paragraph(`appended ${a}.${i} ${'y'.repeat((a + i) % 50)}`))
        nodesInc.value = [...nodesInc.value, ...additions]
        estimatesInc.value = [...estimatesInc.value, ...additions.map(n => estimateNodeHeight(n))]
        const dirtyStart = base + a * chunk
        modelInc.markFallbackHeightPrefixDirty(dirtyStart)
        const incremental = modelInc.estimateHeightRange(0, next)
        modelInc.markFallbackHeightPrefixDirty(0)
        const fullRebuild = modelInc.estimateHeightRange(0, next)
        expect(incremental).toBe(fullRebuild)
        base = next
      }
    }

    console.log(`[prefix-bench] incremental=${incrementalMs.toFixed(2)}ms/session full=${fullMs.toFixed(2)}ms/session`)
    console.log(`[prefix-bench] speedup=${(fullMs / Math.max(0.001, incrementalMs)).toFixed(2)}x (${N0} nodes, ${appends} appends x ${chunk})`)
    expect(incrementalMs).toBeLessThan(fullMs)
  }, 120_000)
})
