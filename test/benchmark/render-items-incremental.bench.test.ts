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

describe('code-block identity scan', () => {
  // Mirrors the `renderedItems` computed scan branch in NodeRenderer.vue for
  // code blocks. Code blocks are rendered from a shallow clone (not the source
  // node), so the cache stores the clone; a cached item is fresh only when the
  // clone matches the code-block render cache, the source node is the same
  // object it was built from, and the loading snapshot is unchanged.
  function findDirtyStart(
    nodes: Array<{ type: string, loading?: unknown }>,
    cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined>,
    clones: Array<unknown | undefined>,
    sourceNodes: Array<unknown | undefined>,
  ) {
    const identityLimit = Math.min(cache.length, nodes.length)
    let dirtyStart = identityLimit
    for (let index = 0; index < identityLimit; index++) {
      const sourceNode = nodes[index]!
      if (sourceNode.type === 'code_block') {
        if (
          cache[index]?.node !== clones[index]
          || sourceNodes[index] !== sourceNode
          || !Object.is(cache[index]?.sourceLoading, sourceNode.loading)
        ) {
          dirtyStart = index
          break
        }
      }
      else if (
        cache[index]?.node !== sourceNode
        || !Object.is(cache[index]?.sourceLoading, sourceNode.loading)
      ) {
        dirtyStart = index
        break
      }
    }
    return dirtyStart
  }

  function buildCommit(
    nodes: Array<{ type: string, loading?: unknown }>,
    cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined>,
    clones: Array<unknown | undefined>,
    sourceNodes: Array<unknown | undefined>,
  ) {
    if (cache.length > nodes.length) {
      cache.length = nodes.length
      clones.length = nodes.length
      sourceNodes.length = nodes.length
    }
    for (let index = 0; index < nodes.length; index++) {
      const sourceNode = nodes[index]!
      // Code blocks render a fresh clone object; other nodes render the source.
      const rendered = sourceNode.type === 'code_block'
        ? { ...sourceNode }
        : sourceNode
      cache[index] = { node: rendered, sourceLoading: sourceNode.loading }
      if (sourceNode.type === 'code_block')
        clones[index] = rendered
      sourceNodes[index] = sourceNode
    }
  }

  it('keeps a stable-prefix code block clean while the tail grows (no full rebuild)', () => {
    const codeBlock = { type: 'code_block', loading: false }
    const paragraph = { type: 'paragraph' }
    const nodes: Array<{ type: string, loading?: unknown }> = Array.from(
      { length: 50 },
      (_, i) => (i === 10 ? { ...codeBlock } : { ...paragraph }),
    )
    const cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined> = []
    const clones: Array<unknown | undefined> = []
    const sourceNodes: Array<unknown | undefined> = []
    buildCommit(nodes, cache, clones, sourceNodes)

    for (let append = 0; append < 10; append++) {
      const start = nodes.length
      for (let i = 0; i < 5; i++)
        nodes.push({ ...paragraph })
      // Tail entries are built once (only the tail is dirty).
      for (let i = start; i < nodes.length; i++) {
        const sourceNode = nodes[i]!
        cache[i] = { node: sourceNode, sourceLoading: undefined }
        sourceNodes[i] = sourceNode
      }
      // The scan must not fall back to the code block at index 10; the whole
      // array (including the previously built tail) is clean, so the dirty
      // start lands on `nodes.length` (the no-op case in the real computed).
      expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(nodes.length)
    }
  })

  it('detects a replaced code block source node as dirty', () => {
    const codeBlock = { type: 'code_block', loading: false }
    const paragraph = { type: 'paragraph' }
    const nodes: Array<{ type: string, loading?: unknown }> = [
      { ...paragraph },
      { ...codeBlock },
      { ...paragraph },
    ]
    const cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined> = []
    const clones: Array<unknown | undefined> = []
    const sourceNodes: Array<unknown | undefined> = []
    buildCommit(nodes, cache, clones, sourceNodes)
    expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(3)

    // Parent supplies a NEW code block object with identical content.
    nodes[1] = { type: 'code_block', loading: false }
    expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(1)
  })

  it('detects an in-place loading flip on a reused code block as dirty', () => {
    const codeBlock = { type: 'code_block', loading: false }
    const nodes: Array<{ type: string, loading?: unknown }> = [{ ...codeBlock }]
    const cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined> = []
    const clones: Array<unknown | undefined> = []
    const sourceNodes: Array<unknown | undefined> = []
    buildCommit(nodes, cache, clones, sourceNodes)
    expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(1)

    // Same source object, loading flipped in place.
    nodes[0]!.loading = true
    expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(0)
  })

  it('detects a code block payload change via a fresh clone', () => {
    const codeBlock = { type: 'code_block', loading: false }
    const nodes: Array<{ type: string, loading?: unknown }> = [{ ...codeBlock }]
    const cache: Array<{ node: unknown, sourceLoading?: unknown } | undefined> = []
    const clones: Array<unknown | undefined> = []
    const sourceNodes: Array<unknown | undefined> = []
    buildCommit(nodes, cache, clones, sourceNodes)

    // Payload changed (new code) -> the render cache produces a NEW clone.
    const changed = { type: 'code_block', loading: false }
    nodes[0] = changed
    clones[0] = { ...changed }
    expect(findDirtyStart(nodes, cache, clones, sourceNodes)).toBe(0)
  })
})
