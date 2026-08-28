import { describe, expect, it } from 'vitest'

import {
  getTolerantMathBlockBoundaryStreamKey,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../packages/markdown-parser/src/plugins/math'

const TOLERANT_BOUNDARY_SCAN_TAIL_CHARS = 20000 + 4096

// End-of-line openers require a non-empty prefix before the delimiter
// (getTolerantBoundaryLineEndOpenIndex rejects openIndex <= 0), so a bare
// "$$" line is a standard block, not a tolerant boundary. Use "text $$"
// style openers so the scanned window actually produces a key.
const PREFIXED_DOLLAR_BLOCK = 'inline text $$\nE = mc^2\n$$\n'
const PREFIXED_BRACKET_BLOCK = 'inline text \\[\n\\sum_{i=1}^{\\infty} \\frac{1}{i^2}\n\\]\n'

function coldKey(source: string) {
  return getTolerantMathBlockBoundaryStreamKey(source)
}

describe('tolerant math boundary stream key incremental lineOffset', () => {
  it('warm (incremental) keys equal full-recomputation keys across appends', () => {
    const cache = { lineOffset: 0, source: '', windowStart: 0 }
    const paragraphs = [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.\n',
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
      '```\nfenced code line stays inert\n```\n',
      'Escaped dollars \\$\\$ and inline $x^2$ stay inert.\n',
      PREFIXED_DOLLAR_BLOCK,
      PREFIXED_BRACKET_BLOCK,
      'Currency ranges like $2000~$5000 remain plain text.\n',
    ]

    let source = '# Streaming math document\n'
    let steps = 0
    for (let step = 0; step < 1100; step++) {
      source += paragraphs[step % paragraphs.length]
      if (source.length <= TOLERANT_BOUNDARY_SCAN_TAIL_CHARS)
        continue
      steps++

      // Warm path: memo holds the previous append of this same document.
      const warm = getTolerantMathBlockBoundaryStreamKey(source, cache)
      // Repeat must be stable (memo now holds this exact source).
      expect(getTolerantMathBlockBoundaryStreamKey(source, cache)).toBe(warm)
      // Cold path: full recomputation reference.
      expect(warm, `step ${step}`).toBe(coldKey(source))
    }

    expect(steps).toBeGreaterThan(100)
    expect(source.length).toBeGreaterThan(TOLERANT_BOUNDARY_SCAN_TAIL_CHARS + 20000)
  })

  it('single-char appends crossing the window cut boundary stay exact', () => {
    const cache = { lineOffset: 0, source: '', windowStart: 0 }
    // Build past the tail threshold, then append one char at a time. The cut
    // index (source.length - TAIL) advances one position per append and sweeps
    // over newline positions, exercising both the "first newline after cut is
    // exactly the memoized window start" case (start === prevStart) and the
    // "newline lands inside the appended region" case (start > prevStart).
    let source = 'text $$\nE = mc^2\n$$\n'
    const filler = 'The quick brown fox jumps over the lazy dog. '
    while (source.length <= TOLERANT_BOUNDARY_SCAN_TAIL_CHARS)
      source += filler

    const cycle = ['\n', 'a', '$', '\n', ' ', 'x']
    for (let step = 0; step < 500; step++) {
      source += cycle[step % cycle.length]
      const warm = getTolerantMathBlockBoundaryStreamKey(source, cache)
      expect(warm, `step ${step}`).toBe(coldKey(source))
    }
  })

  it('newline-free appends keep the clamped empty-window branch exact', () => {
    const cache = { lineOffset: 0, source: '', windowStart: 0 }
    // Window start clamps to source.length when no '\n' exists after the cut:
    // the window is empty and the key is null, while the memo must keep
    // tracking the newline count for later appends that reintroduce '\n'.
    let source = 'text $$\nE = mc^2\n$$\n\n'
    while (source.length <= TOLERANT_BOUNDARY_SCAN_TAIL_CHARS)
      source += 'x'

    expect(getTolerantMathBlockBoundaryStreamKey(source, cache)).toBeNull()
    expect(coldKey(source)).toBeNull()

    const noNewlineTail = 'y'.repeat(3000)
    source += noNewlineTail
    expect(getTolerantMathBlockBoundaryStreamKey(source, cache)).toBeNull()
    expect(coldKey(source)).toBeNull()

    // Reintroduce a newline: window becomes non-empty; incremental vs full.
    source += `tail text $\n\\nabla \\cdot E = 0\n$\n`
    const warm = getTolerantMathBlockBoundaryStreamKey(source, cache)
    expect(warm).toBe(coldKey(source))

    // More no-newline growth, then newline again.
    source += 'z'.repeat(5000)
    source += '\npending math\n'
    expect(getTolerantMathBlockBoundaryStreamKey(source, cache)).toBe(coldKey(source))
  })

  it('non-append replacement invalidates the memo without wrong output', () => {
    const cache = { lineOffset: 0, source: '', windowStart: 0 }
    const mathBlock = 'text $$\nE = mc^2\n$$\n'
    const filler = 'word '.repeat(120)
    const docA = `${mathBlock + filler}\n`.repeat(600)
    const docB = `${`# Other document\n${filler}${mathBlock}`}\n`.repeat(600)

    const keyA1 = getTolerantMathBlockBoundaryStreamKey(docA, cache)
    const keyB = getTolerantMathBlockBoundaryStreamKey(docB, cache)

    // Complete replacement: docB does not extend docA.
    expect(keyB).not.toBe(keyA1)

    // Back to docA (now a non-append vs the memoized docB).
    expect(getTolerantMathBlockBoundaryStreamKey(docA, cache)).toBe(keyA1)
    // And cold recomputation agrees with both.
    expect(coldKey(docA)).toBe(keyA1)
    expect(coldKey(docB)).toBe(keyB)
  })

  it('mayContainTolerantMathBlockBoundaryOpener stays correct on long streamed docs', () => {
    const cache = { lineOffset: 0, source: '', windowStart: 0 }
    const paragraph = 'Plain narrative line without delimiters.\n'
    const mathBlock = 'inline text $$\n\\int_0^1 x^2 dx\n$$\n'

    let withMath = ''
    for (let step = 0; step < 900; step++) {
      withMath += step % 5 === 0 ? mathBlock : paragraph
      if (!withMath.includes('$$'))
        continue
      expect(mayContainTolerantMathBlockBoundaryOpener(withMath, cache), `step ${step}`).toBe(true)
    }

    let plain = ''
    for (let step = 0; step < 700; step++) {
      plain += paragraph
      expect(mayContainTolerantMathBlockBoundaryOpener(plain, cache), `plain step ${step}`).toBe(false)
    }
  })
})
