import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { computed, onMounted, ref, watch } from 'vue'
import { useSmoothMarkdownStream } from '../../../composables/useSmoothMarkdownStream'
import { isTypewriterEnabled } from '../../../utils/typewriter'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>

const DEFAULT_RENDERER_SMOOTH_STREAMING_OPTIONS = {
  maxCharsPerSecond: 3000,
  maxCommitFps: 20,
  maxCharsPerCommit: 160,
  catchUpLatencyMs: 220,
  catchUpThreshold: 400,
}

const CONTINUOUS_STREAM_CHUNK_MAX_LENGTH = 8

export interface SmoothStreamingBridgeOptions {
  isClient: boolean
  inheritedSmoothStreaming?: { value?: boolean }
}

export interface SmoothStreamingBridge {
  smoothStream: ReturnType<typeof useSmoothMarkdownStream>
  smoothStreamingEligible: ComputedRef<boolean>
  smoothStreamingEnabled: ComputedRef<boolean>
  renderContent: ComputedRef<string>
  requestedFinal: ComputedRef<boolean | undefined>
  effectiveFinal: ComputedRef<boolean | undefined>
}

export function useSmoothStreamingBridge(
  props: Readonly<NodeRendererProps>,
  options: SmoothStreamingBridgeOptions,
): SmoothStreamingBridge {
  const smoothStream = useSmoothMarkdownStream({
    ...DEFAULT_RENDERER_SMOOTH_STREAMING_OPTIONS,
    ...props.smoothStreamingOptions,
    // One-shot large content reveals fence-safely in one commit instead of
    // pacing per character; typewriter mode keeps the paced reveal.
    burstInitialContent: !isTypewriterEnabled(props.typewriter),
  })

  const smoothStreamingEligible = computed(() => {
    if (props.smoothStreaming === false)
      return false

    if (props.nodes?.length)
      return false

    // Nested renderers should not double-pace content unless explicitly opted in.
    if (props.smoothStreaming !== true && options.inheritedSmoothStreaming?.value)
      return false

    if (props.smoothStreaming === true)
      return true

    // auto mode: enable only for typewriter or incremental mode.
    return isTypewriterEnabled(props.typewriter)
      || (props.maxLiveNodes ?? 0) <= 0
  })

  // Prevent pacing initial static content on first client render.
  // This avoids SSR hydration mismatch and blank flash.
  const hasMountedForSmoothStreaming = ref(
    !options.isClient || props.smoothStreaming === true,
  )

  onMounted(() => {
    hasMountedForSmoothStreaming.value = true
  })

  const smoothStreamingEnabled = computed(() => {
    return hasMountedForSmoothStreaming.value && smoothStreamingEligible.value
  })

  const renderContent = computed(() => {
    return smoothStreamingEnabled.value
      ? smoothStream.visible.value
      : (props.content ?? '')
  })

  const requestedFinal = computed<boolean | undefined>(() => {
    const base = (props.parseOptions ?? {}) as RendererParseOptions
    return props.final ?? base.final
  })

  const effectiveFinal = computed<boolean | undefined>(() => {
    const finalRequested = requestedFinal.value

    if (smoothStreamingEnabled.value && finalRequested != null)
      return finalRequested ? smoothStream.caughtUp.value : false

    return finalRequested
  })

  let consecutiveSmallAppends = 0
  let continuousSmallStream = false

  function resetContinuousStreamDetection() {
    consecutiveSmallAppends = 0
    continuousSmallStream = false
  }

  watch(
    [() => props.content, () => props.nodes, smoothStreamingEnabled, requestedFinal],
    ([content, nodes, enabled, finalRequested]) => {
      if (nodes?.length) {
        resetContinuousStreamDetection()
        smoothStream.reset('')
        return
      }

      const nextContent = content ?? ''

      if (!enabled) {
        resetContinuousStreamDetection()
        smoothStream.reset(nextContent)

        if (finalRequested)
          smoothStream.finish({ flush: true })

        return
      }

      const source = smoothStream.source.value

      if (!nextContent) {
        resetContinuousStreamDetection()
        smoothStream.reset('')
      }
      else if (nextContent === source) {
        // no-op
      }
      else if (nextContent.startsWith(source)) {
        const appended = nextContent.slice(source.length)
        const pendingBeforeAppend = smoothStream.pendingChars.value
        if (appended.length <= CONTINUOUS_STREAM_CHUNK_MAX_LENGTH) {
          consecutiveSmallAppends++
          if (continuousSmallStream || (
            consecutiveSmallAppends >= 2
            && pendingBeforeAppend <= CONTINUOUS_STREAM_CHUNK_MAX_LENGTH
          )) {
            continuousSmallStream = true
            // The startsWith check above already proved nextContent extends
            // source, so tell the controller to skip its internal re-check
            // (another O(accumulated source) comparison per chunk).
            smoothStream.reset(nextContent, { prefixKnown: true })
          }
          else {
            smoothStream.enqueue(appended)
          }
        }
        else {
          resetContinuousStreamDetection()
          smoothStream.enqueue(appended)
        }
      }
      else {
        resetContinuousStreamDetection()
        smoothStream.reset(nextContent)
      }

      if (finalRequested)
        smoothStream.finish()
    },
    { immediate: true },
  )

  return {
    smoothStream,
    smoothStreamingEligible,
    smoothStreamingEnabled,
    renderContent,
    requestedFinal,
    effectiveFinal,
  }
}
