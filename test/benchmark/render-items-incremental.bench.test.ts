/**
 * Micro-benchmark: incremental render-item maintenance (identity scan + tail
 * build) vs the previous full-document rebuild (signature array + WeakMap
 * lookup per node) for non-virtualized streaming renders.
 * The old path built a ~21-entry signature array per node on every commit;
 * the new path performs cheap O(N) reference comparisons to locate the
 * dirty tail and only rebuilds that tail.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

interface FakeNode {
  id: number
  raw: string
}

function makeNodes(count: number) {
  return Array.from({ length: count }, (_, id) => ({ id, raw: `node ${id}` }))
}

// Old behavior: per node, build a 21-entry signature (roughly matching the
// previous buildRenderedItemSignature) and compare against a cache map.
function oldFullRebuild(nodes: FakeNode[], cache: Map<FakeNode, unknown[]>) {
  const items: unknown[] = []
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    const signature = [
      index,
      null,
      false,
      null,
      null,
      'safe',
      'session',
      'prefix',
      'scope',
      null,
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      true,
      0,
      0,
    ]
    const cached = cache.get(node)
    if (cached && cached.length === signature.length && cached.every((v, i) => Object.is(v, signature[i]))) {
      items.push(cached)
      continue
    }
    cache.set(node, signature)
    items.push({ node, index, bindings: {} })
  }
  return items
}

// New behavior: identity scan over the prefix, rebuild only the tail.
function newIncrementalUpdate(
  nodes: FakeNode[],
  cache: Array<{ node: FakeNode, item: { node: FakeNode, index: number } } | undefined>,
) {
  const total = nodes.length
  if (cache.length > total)
    cache.length = total
  const identityLimit = Math.min(cache.length, total)
  let dirtyStart = identityLimit
  for (let index = 0; index < identityLimit; index++) {
    if (cache[index]?.node !== nodes[index]) {
      dirtyStart = index
      break
    }
  }
  for (let index = dirtyStart; index < total; index++) {
    const node = nodes[index]!
    cache[index] = { node, item: { node, index } }
  }
  return dirtyStart
}

describe('render item incremental maintenance benchmark', () => {
  it('reduces per-commit work to the dirty tail at scale', () => {
    const N0 = 5000
    const appends = 200
    const chunk = 10
    const iterations = 10

    // Old: full rebuild every commit (new cache per iteration's committed view)
    let oldNodes = makeNodes(N0)
    let oldTotal = 0
    for (let iter = 0; iter < iterations; iter++) {
      const cache = new Map<FakeNode, unknown[]>()
      let base = N0
      oldNodes = makeNodes(N0)
      const start = performance.now()
      for (let a = 0; a < appends; a++) {
        oldNodes = [...oldNodes, ...makeNodes(chunk).map(n => ({ ...n, id: n.id + base }))]
        base += chunk
        void oldFullRebuild(oldNodes, cache)
      }
      oldTotal += performance.now() - start
    }
    const oldMs = oldTotal / iterations

    // New: identity scan + tail build (stable prefix nodes are the same objects)
    let newNodes = makeNodes(N0)
    let newTotal = 0
    for (let iter = 0; iter < iterations; iter++) {
      const cache: Array<{ node: FakeNode, item: { node: FakeNode, index: number } } | undefined> = []
      newNodes = makeNodes(N0)
      let base = N0
      const start = performance.now()
      for (let a = 0; a < appends; a++) {
        const additions = makeNodes(chunk).map(n => ({ ...n, id: n.id + base }))
        newNodes = [...newNodes, ...additions]
        base += chunk
        newIncrementalUpdate(newNodes, cache)
      }
      newTotal += performance.now() - start
    }
    const newMs = newTotal / iterations

    // Correctness (outside the timed loop): the incremental cache must agree
    // with a from-scratch rebuild at the final state (same node per index,
    // same ordering).
    {
      const cache: Array<{ node: FakeNode, item: { node: FakeNode, index: number } } | undefined> = []
      let base = N0
      for (let a = 0; a < appends; a++) {
        const additions = makeNodes(chunk).map(n => ({ ...n, id: n.id + base }))
        newNodes = [...newNodes, ...additions]
        base += chunk
        newIncrementalUpdate(newNodes, cache)
      }
      const rebuiltFinal = oldFullRebuild(newNodes, new Map<FakeNode, unknown[]>())
      expect(cache.length).toBe(newNodes.length)
      for (let i = 0; i < newNodes.length; i++) {
        expect(cache[i]?.node).toBe(newNodes[i])
        expect((cache[i]?.item as { node: FakeNode, index: number })?.node).toBe((rebuiltFinal[i] as { node: FakeNode })?.node)
      }
    }

    const speedup = oldMs / Math.max(0.0001, newMs)
    console.log(`[render-items-bench] old=${oldMs.toFixed(2)}ms/session new=${newMs.toFixed(2)}ms/session`)
    console.log(`[render-items-bench] speedup=${speedup.toFixed(1)}x (${N0} nodes, ${appends} appends x ${chunk})`)
    expect(newMs).toBeLessThan(oldMs)
  }, 120_000)
})
