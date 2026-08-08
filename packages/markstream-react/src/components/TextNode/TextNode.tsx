import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import { useStreamStateRef } from '../../context/streamState'

interface StreamSegment {
  id: number
  content: string
  fading: boolean
}

// Settling merges the delta into the previous (settled) segment — the merge
// keeps the previous segment's id so its span element is reused — but the
// merged content must reach the DOM through SettledSegmentContent, which
// appends new text nodes instead of mutating the existing one. Browsers
// collapse a Selection anchored inside a text node as soon as that node is
// mutated or replaced (verified in Chromium).
function settleAndMergeSegments(segments: StreamSegment[], segmentId?: number) {
  return segments.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segmentId == null || segment.id === segmentId
      ? { ...segment, fading: false }
      : segment
    const previousSegment = result[result.length - 1]
    if (previousSegment && !previousSegment.fading && !nextSegment.fading) {
      result[result.length - 1] = {
        ...previousSegment,
        content: previousSegment.content + nextSegment.content,
      }
    }
    else {
      result.push(nextSegment)
    }
    return result
  }, [])
}

/**
 * Renders a settled segment's content without ever mutating an existing text
 * node: the initial content is rendered by JSX (SSR-safe), and every growth
 * is appended as a NEW sibling text node. A non-prefix replacement rebuilds
 * the node (the old content is gone anyway).
 */
function SettledSegmentContent({ content }: { content: string }) {
  const initialRef = useRef(content)
  const renderedRef = useRef(initialRef.current)
  const spanRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el)
      return
    if (content.startsWith(renderedRef.current)) {
      const increment = content.slice(renderedRef.current.length)
      if (increment)
        el.appendChild(document.createTextNode(increment))
      renderedRef.current = content
    }
    else {
      el.textContent = content
      renderedRef.current = content
    }
  }, [content])

  return <span ref={spanRef}>{initialRef.current}</span>
}

export function TextNode(props: NodeComponentProps<{ type: 'text', content: string, center?: boolean }>) {
  const { node, children, ctx, indexKey, fade } = props
  const content = String(node.content ?? '')
  const fadeEnabled = fade ?? ctx?.fade ?? true
  const streamStateKey = indexKey == null || indexKey === ''
    ? ''
    : String(indexKey)
  const [segments, setSegments] = useState<StreamSegment[]>(content
    ? [{ id: 0, content, fading: false }]
    : [])
  const streamStateRef = useStreamStateRef()
  const renderedContentRef = useRef(content)
  const nextSegmentIdRef = useRef(1)
  const lastStreamRenderVersionRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const streamRenderVersion = streamStateRef?.getStreamRenderVersion() ?? ctx?.streamRenderVersion
    const streamRenderVersionChanged = streamRenderVersion !== lastStreamRenderVersionRef.current

    if (children != null) {
      renderedContentRef.current = ''
      setSegments([])
      lastStreamRenderVersionRef.current = streamRenderVersion
      return
    }

    const textStreamState = streamStateRef?.textStreamState ?? ctx?.textStreamState
    const persistedContent = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    let previousContent = renderedContentRef.current

    const resumeFromPersistedContent = Boolean(
      previousContent === content
      && persistedContent
      && content.startsWith(persistedContent)
      && content.length > persistedContent.length,
    )
    if (resumeFromPersistedContent) {
      previousContent = persistedContent
    }

    if (!fadeEnabled) {
      // Append-only growth: every content change creates a NEW immutable
      // segment. Replacing or mutating the existing segment's span would
      // collapse a user Selection anchored inside its text node.
      setSegments((current) => {
        if (!content)
          return []
        const rendered = current.reduce((acc, segment) => acc + segment.content, '')
        if (content === rendered)
          return current
        if (content.startsWith(rendered)) {
          return [
            ...current,
            { id: nextSegmentIdRef.current++, content: content.slice(rendered.length), fading: false },
          ]
        }
        // Non-prefix replacement: the old content is gone anyway.
        return [{ id: nextSegmentIdRef.current++, content, fading: false }]
      })
    }
    else if (content !== previousContent) {
      if (previousContent && content.startsWith(previousContent)) {
        const appendedContent = content.slice(previousContent.length)
        setSegments((current) => {
          if (resumeFromPersistedContent) {
            return [
              { id: nextSegmentIdRef.current++, content: previousContent, fading: false },
              { id: nextSegmentIdRef.current++, content: appendedContent, fading: true },
            ]
          }
          const lastSegment = current[current.length - 1]
          if (lastSegment?.fading) {
            return [
              ...current.slice(0, -1),
              { ...lastSegment, content: lastSegment.content + appendedContent },
            ]
          }
          return [
            ...current,
            { id: nextSegmentIdRef.current++, content: appendedContent, fading: true },
          ]
        })
      }
      else {
        setSegments(content
          ? [{ id: nextSegmentIdRef.current++, content, fading: false }]
          : [])
      }
    }
    else if (streamRenderVersionChanged) {
      setSegments(current => current.some(segment => segment.fading)
        ? settleAndMergeSegments(current)
        : current)
    }

    renderedContentRef.current = content
    lastStreamRenderVersionRef.current = streamRenderVersion
    if (streamStateKey)
      textStreamState?.set(streamStateKey, content)
  }, [children, content, streamStateRef, ctx?.textStreamState, ctx?.streamRenderVersion, streamStateKey, fadeEnabled])

  const settleSegment = (segmentId: number) => {
    setSegments(current => current.some(segment => segment.id === segmentId && segment.fading)
      ? settleAndMergeSegments(current, segmentId)
      : current)
  }

  if (children != null) {
    return (
      <span
        className={clsx(
          'text-node whitespace-pre-wrap break-words',
          node.center && 'text-node-center',
        )}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'text-node whitespace-pre-wrap break-words',
        node.center && 'text-node-center',
      )}
    >
      {segments.map(segment => (
        <span
          key={segment.id}
          className={segment.fading
            ? clsx(
                'text-node-stream-delta',
                segment.id % 2 === 0
                  ? 'text-node-stream-delta--a'
                  : 'text-node-stream-delta--b',
              )
            : undefined}
          onAnimationEnd={segment.fading ? () => settleSegment(segment.id) : undefined}
        >
          {segment.fading
            ? segment.content
            : <SettledSegmentContent content={segment.content} />}
        </span>
      ))}
    </span>
  )
}

export default TextNode
