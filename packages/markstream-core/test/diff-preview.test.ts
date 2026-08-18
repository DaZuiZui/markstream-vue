import { describe, expect, it } from 'vitest'
import { buildDiffPreviewPanes, createDiffMatchCache } from '../src/diff-preview'

describe('buildDiffPreviewPanes', () => {
  it('aligns changed source rows and collapses the same unchanged ranges in both panes', () => {
    const original = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[3] = 'changed line'

    const panes = buildDiffPreviewPanes({
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 2,
        minimumLineCount: 4,
      },
    })

    expect(panes).toHaveLength(2)
    expect(panes[0].lines).toHaveLength(panes[1].lines.length)
    expect(panes[0].lines.map(line => line.kind)).toEqual([
      'context',
      'context',
      'context',
      'removed',
      'context',
      'context',
      'collapsed',
    ])
    expect(panes[1].lines.map(line => line.kind)).toEqual([
      'context',
      'context',
      'context',
      'added',
      'context',
      'context',
      'collapsed',
    ])
    // The collapsed row reports the hidden source-line count (44), even though
    // the terminal range also consumes the trailing no-newline metadata row.
    expect(panes[0].lines.at(-1)?.code).toBe('44 unmodified lines')
    expect(panes[1].lines.at(-1)?.code).toBe('')
  })

  it('keeps side-by-side panes row aligned when one side has more changed lines', () => {
    const panes = buildDiffPreviewPanes({
      originalCode: 'before\nold one\nold two\nafter',
      updatedCode: 'before\nnew one\nafter',
    })

    expect(panes[0].lines.map(line => line.kind)).toEqual(['context', 'removed', 'removed', 'context', 'metadata'])
    expect(panes[1].lines.map(line => line.kind)).toEqual(['context', 'added', 'spacer', 'context', 'metadata'])
    // Sources without a final newline surface a no-newline metadata row on the
    // side that is missing it (removed for the original, added for the modified).
    expect(panes[0].lines.at(-1)?.metadataKind).toBe('removed')
    expect(panes[1].lines.at(-1)?.metadataKind).toBe('added')
  })

  it('keeps multi-hunk row classification stable while streaming', () => {
    const original = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[4] = 'changed near start'
    modified[94] = 'changed near end'
    const options = {
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: true,
    }

    const streaming = buildDiffPreviewPanes({ ...options, loading: true })
    const complete = buildDiffPreviewPanes({ ...options, loading: false })

    expect(streaming).toEqual(complete)
    expect(streaming[0].lines.some(line => line.kind === 'collapsed')).toBe(true)
  })

  it('does not render git patch metadata as numbered source rows', () => {
    const panes = buildDiffPreviewPanes({
      code: [
        'diff --git a/file.ts b/file.ts',
        'index 1111111..2222222 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1 +1 @@',
        '-const oldValue = 1',
        '+const newValue = 1',
      ].join('\n'),
      language: 'diff',
    })

    expect(panes[0].lines.map(line => line.kind)).toEqual(['hunk', 'removed'])
    expect(panes[1].lines.map(line => line.kind)).toEqual(['hunk', 'added'])
    expect(panes[0].lines[1].number).toBe(1)
    expect(panes[1].lines[1].number).toBe(1)
  })

  it('numbers split patch rows from each hunk header across multiple hunks', () => {
    const panes = buildDiffPreviewPanes({
      code: [
        'diff --git a/file.ts b/file.ts',
        'index 1111111..2222222 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -10,4 +20,4 @@',
        ' context ten',
        '-removed ten',
        '+added twenty',
        ' context eleven',
        '@@ -30,2 +40,2 @@',
        ' context thirty',
        '-removed thirty',
        '+added forty',
      ].join('\n'),
      language: 'diff',
    })

    // git file headers are dropped; hunk rows carry no line number, and each
    // hunk restarts numbering from its `@@ -orig +mod @@` header.
    expect(panes[0].lines.map(line => line.kind)).toEqual([
      'hunk',
      'context',
      'removed',
      'context',
      'hunk',
      'context',
      'removed',
    ])
    expect(panes[1].lines.map(line => line.kind)).toEqual([
      'hunk',
      'context',
      'added',
      'context',
      'hunk',
      'context',
      'added',
    ])
    expect(panes[0].lines.map(line => line.number)).toEqual(['', 10, 11, 12, '', 30, 31])
    expect(panes[1].lines.map(line => line.number)).toEqual(['', 20, 21, 22, '', 40, 41])
  })

  it('marks a terminal collapsed range as last so the pill can reuse the pre bottom padding', () => {
    const original = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[3] = 'changed'

    const panes = buildDiffPreviewPanes({
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: true,
    })

    const collapsed = panes[0].lines.find(line => line.kind === 'collapsed')
    expect(collapsed?.collapsedFirst).toBe(false)
    expect(collapsed?.collapsedLast).toBe(true)
    expect(collapsed?.code).toBe('24 unmodified lines')
  })

  it('marks a leading unchanged range as first so the pill flushes to the top rows', () => {
    const original = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[28] = 'changed'

    const panes = buildDiffPreviewPanes({
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: true,
    })

    const collapsed = panes[0].lines.find(line => line.kind === 'collapsed')
    expect(collapsed?.collapsedFirst).toBe(true)
    expect(collapsed?.collapsedLast).toBe(false)
  })

  it('renders a no-newline patch metadata row instead of a numbered context row', () => {
    const panes = buildDiffPreviewPanes({
      code: [
        '@@ -1 +1 @@',
        '-const oldValue = 1',
        '+const newValue = 1',
        '\\ No newline at end of file',
      ].join('\n'),
      language: 'diff',
    })

    expect(panes[0].lines.at(-1)?.kind).toBe('spacer')
    expect(panes[1].lines.at(-1)?.kind).toBe('metadata')
    expect(panes[1].lines.at(-1)?.metadataKind).toBe('added')
  })

  it('reuses the cached LCS incrementally for append-only streaming frames', () => {
    const cache = createDiffMatchCache()
    buildDiffPreviewPanes({
      originalCode: ['a', 'b', 'c', 'old'].join('\n'),
      updatedCode: ['a', 'b', 'c', 'new'].join('\n'),
      matchCache: cache,
    })

    // Both sides append an isolated line ('d' is absent from the previous
    // content of the other side), so the incremental path must reuse the
    // cached matches and only diff the tail — with an identical result to a
    // fresh full recompute.
    const incremental = buildDiffPreviewPanes({
      originalCode: ['a', 'b', 'c', 'old', 'd'].join('\n'),
      updatedCode: ['a', 'b', 'c', 'new', 'd'].join('\n'),
      matchCache: cache,
    })
    const full = buildDiffPreviewPanes({
      originalCode: ['a', 'b', 'c', 'old', 'd'].join('\n'),
      updatedCode: ['a', 'b', 'c', 'new', 'd'].join('\n'),
    })

    expect(incremental).toEqual(full)
    expect(cache.original).toEqual(['a', 'b', 'c', 'old', 'd'])
  })

  it('falls back to a full recompute when appended lines could match old unmatched lines', () => {
    const cache = createDiffMatchCache()
    buildDiffPreviewPanes({
      originalCode: ['a', 'x'].join('\n'),
      updatedCode: ['a', 'b'].join('\n'),
      matchCache: cache,
    })

    // Appending 'x' to the updated side would let the tail match the
    // previously-unmatched original 'x'. The incremental shortcut must be
    // bypassed so the new match is picked up exactly like a full recompute.
    const incremental = buildDiffPreviewPanes({
      originalCode: ['a', 'x'].join('\n'),
      updatedCode: ['a', 'b', 'x'].join('\n'),
      matchCache: cache,
    })
    const full = buildDiffPreviewPanes({
      originalCode: ['a', 'x'].join('\n'),
      updatedCode: ['a', 'b', 'x'].join('\n'),
    })

    expect(incremental).toEqual(full)
    // The full LCS matches both 'a' (original line 1) and the appended 'x'
    // (original line 2, now context instead of removed) — the tail-only
    // shortcut would have kept 'x' unmatched.
    expect(full[0].lines.filter(line => line.kind === 'context').map(line => line.number)).toEqual([1, 2])
    expect(full[0].lines.filter(line => line.kind === 'context').map(line => line.code)).toEqual(['a', 'x'])
  })

  it('falls back to a full recompute when the source is not append-only', () => {
    const cache = createDiffMatchCache()
    buildDiffPreviewPanes({
      originalCode: ['a', 'b'].join('\n'),
      updatedCode: ['a', 'c'].join('\n'),
      matchCache: cache,
    })

    const incremental = buildDiffPreviewPanes({
      originalCode: ['a', 'z'].join('\n'),
      updatedCode: ['a', 'c'].join('\n'),
      matchCache: cache,
    })
    const full = buildDiffPreviewPanes({
      originalCode: ['a', 'z'].join('\n'),
      updatedCode: ['a', 'c'].join('\n'),
    })

    expect(incremental).toEqual(full)
  })
})
