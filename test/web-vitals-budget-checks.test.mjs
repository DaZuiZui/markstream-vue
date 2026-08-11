import { describe, expect, it } from 'vitest'
import { collectWebVitalsInteractionWarnings } from '../scripts/web-vitals-budget-checks.mjs'

describe('web vitals budget checks', () => {
  it('passes interaction timing budgets when a scripted interaction stays below the Event Timing threshold', () => {
    const warnings = collectWebVitalsInteractionWarnings(
      'codeblockStreamDiffs',
      {
        label: 'codeblock-copy',
        eventObserverSupported: true,
        interactionGroupCount: 0,
        scriptedInteractionCount: 1,
        belowEventTimingThreshold: true,
        eventTimingInpCandidateMs: 0,
        eventTimingMaxInputDelayMs: 0,
        eventTimingMaxProcessingMs: 0,
        phaseCls: 0,
      },
      {
        eventTimingInpCandidateMs: 1000,
        eventTimingMaxInputDelayMs: 300,
        eventTimingMaxProcessingMs: 900,
        phaseCls: 0.05,
      },
    )

    expect(warnings).toEqual([])
  })

  it('fails interaction timing budgets when no interaction happened and no interaction groups are captured', () => {
    const warnings = collectWebVitalsInteractionWarnings(
      'codeblockStreamDiffs',
      {
        label: 'codeblock-copy',
        eventObserverSupported: true,
        interactionGroupCount: 0,
        eventTimingInpCandidateMs: 0,
        eventTimingMaxInputDelayMs: 0,
        eventTimingMaxProcessingMs: 0,
        phaseCls: 0,
      },
      {
        eventTimingInpCandidateMs: 1000,
        eventTimingMaxInputDelayMs: 300,
        eventTimingMaxProcessingMs: 900,
        phaseCls: 0.05,
      },
    )

    expect(warnings).toContain('[codeblockStreamDiffs:codeblock-copy] Event Timing measurement unavailable: no interaction groups captured.')
  })

  it('fails interaction timing budgets when the event observer is unavailable', () => {
    const warnings = collectWebVitalsInteractionWarnings(
      'codeblockStreamDiffs',
      {
        label: 'codeblock-copy',
        eventObserverSupported: false,
        interactionGroupCount: 1,
        eventTimingInpCandidateMs: 0,
        phaseCls: 0,
      },
      {
        eventTimingInpCandidateMs: 1000,
        phaseCls: 0.05,
      },
    )

    expect(warnings).toContain('[codeblockStreamDiffs:codeblock-copy] Event Timing measurement unavailable: observer unsupported.')
  })

  it('passes interaction timing budgets when a real interaction group is captured under budget', () => {
    const warnings = collectWebVitalsInteractionWarnings(
      'codeblockStreamDiffs',
      {
        label: 'codeblock-copy',
        eventObserverSupported: true,
        interactionGroupCount: 1,
        eventTimingInpCandidateMs: 20,
        eventTimingMaxInputDelayMs: 3,
        eventTimingMaxProcessingMs: 10,
        phaseCls: 0,
      },
      {
        eventTimingInpCandidateMs: 1000,
        eventTimingMaxInputDelayMs: 300,
        eventTimingMaxProcessingMs: 900,
        phaseCls: 0.05,
      },
    )

    expect(warnings).toEqual([])
  })
})
