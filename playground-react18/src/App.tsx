import type { StreamPresetId } from './shared/streamPresets'
import type { StreamSliceMode, StreamTransportMode } from './shared/useStreamSimulator'
import { Icon } from '@iconify/react'
import { NodeRenderer, setCustomComponents, setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker&inline'
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThinkingNode } from './components/ThinkingNode'
import { streamContent } from './markdown'
import { LineNumberHandoffCheck } from './shared/LineNumberHandoffCheck'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from './shared/markstreamPlayground'
import { MigrationDemoPage } from './shared/MigrationDemoPage'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from './shared/streamPresets'
import { TestLab } from './shared/TestLab'
import { useChatAutoScroll } from './shared/useChatAutoScroll'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from './shared/useStreamSimulator'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
setCustomComponents(PLAYGROUND_CUSTOM_ID, {
  thinking: ThinkingNode,
})

const MemoizedNodeRenderer = memo(NodeRenderer)

const THEMES = [
  'andromeeda',
  'aurora-x',
  'ayu-dark',
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dark-plus',
  'dracula',
  'dracula-soft',
  'everforest-dark',
  'everforest-light',
  'github-dark',
  'github-dark-default',
  'github-dark-dimmed',
  'github-dark-high-contrast',
  'github-light',
  'github-light-default',
  'github-light-high-contrast',
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'gruvbox-light-hard',
  'gruvbox-light-medium',
  'gruvbox-light-soft',
  'houston',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'kanagawa-wave',
  'laserwave',
  'light-plus',
  'material-theme',
  'material-theme-darker',
  'material-theme-lighter',
  'material-theme-ocean',
  'material-theme-palenight',
  'min-dark',
  'min-light',
  'monokai',
  'night-owl',
  'nord',
  'one-dark-pro',
  'one-light',
  'plastic',
  'poimandres',
  'red',
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'slack-dark',
  'slack-ochin',
  'snazzy-light',
  'solarized-dark',
  'solarized-light',
  'synthwave-84',
  'tokyo-night',
  'vesper',
  'vitesse-black',
  'vitesse-dark',
  'vitesse-light',
] as const

const STREAM_DELAY_MIN_KEY = 'vmr-settings-stream-delay-min'
const STREAM_DELAY_MAX_KEY = 'vmr-settings-stream-delay-max'
const STREAM_CHUNK_MIN_KEY = 'vmr-settings-stream-chunk-size-min'
const STREAM_CHUNK_MAX_KEY = 'vmr-settings-stream-chunk-size-max'
const STREAM_BURSTINESS_KEY = 'vmr-settings-stream-burstiness'
const STREAM_TRANSPORT_MODE_KEY = 'vmr-settings-stream-transport-mode'
const STREAM_SLICE_MODE_KEY = 'vmr-settings-stream-slice-mode'
const THEME_KEYS = ['vmr-settings-selected-theme', 'vmv-settings-selected-theme'] as const
const DARK_MODE_KEY = 'vueuse-color-scheme'

function formatThemeName(theme: string) {
  return theme
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function readNumber(key: string, fallback: number) {
  if (typeof window === 'undefined')
    return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw)
    return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readThemeFromStorage(fallback: string) {
  if (typeof window === 'undefined')
    return fallback
  for (const key of THEME_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (raw && raw.trim())
      return raw
  }
  return fallback
}

function readString(key: string, fallback: string) {
  if (typeof window === 'undefined')
    return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw || !raw.trim())
    return fallback
  return raw
}

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined')
      return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined')
      return

    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }

    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [query])

  return matches
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window === 'undefined')
      return '/'
    return normalizePath(window.location.pathname)
  })
  const [showSettings, setShowSettings] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(() => readThemeFromStorage('vitesse-dark'))
  const [streamChunkDelayMin, setStreamChunkDelayMin] = useState(() => readNumber(STREAM_DELAY_MIN_KEY, 14))
  const [streamChunkDelayMax, setStreamChunkDelayMax] = useState(() => readNumber(STREAM_DELAY_MAX_KEY, 34))
  const [streamChunkSizeMin, setStreamChunkSizeMin] = useState(() => readNumber(STREAM_CHUNK_MIN_KEY, 2))
  const [streamChunkSizeMax, setStreamChunkSizeMax] = useState(() => readNumber(STREAM_CHUNK_MAX_KEY, 7))
  const [streamBurstiness, setStreamBurstiness] = useState(() => readNumber(STREAM_BURSTINESS_KEY, 35))
  const [streamTransportMode, setStreamTransportMode] = useState<StreamTransportMode>(() => readString(STREAM_TRANSPORT_MODE_KEY, 'readable-stream') as StreamTransportMode)
  const [streamSliceMode, setStreamSliceMode] = useState<StreamSliceMode>(() => readString(STREAM_SLICE_MODE_KEY, 'pure-random') as StreamSliceMode)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined')
      return false
    const stored = window.localStorage.getItem(DARK_MODE_KEY)
    if (stored)
      return stored === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  const normalizedChunkDelayRange = useMemo(() => normalizeStreamRange(
    streamChunkDelayMin,
    streamChunkDelayMax,
    8,
    240,
    14,
    34,
  ), [streamChunkDelayMax, streamChunkDelayMin])
  const normalizedChunkSizeRange = useMemo(() => normalizeStreamRange(
    streamChunkSizeMin,
    streamChunkSizeMax,
    1,
    24,
    2,
    7,
  ), [streamChunkSizeMax, streamChunkSizeMin])
  const normalizedBurstiness = useMemo(
    () => Math.round(clampStreamControl(streamBurstiness, 0, 100, 35)),
    [streamBurstiness],
  )
  const activeStreamPreset = useMemo(() => findMatchingStreamPreset({
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    burstiness: normalizedBurstiness,
  }), [normalizedBurstiness, normalizedChunkDelayRange.max, normalizedChunkDelayRange.min, normalizedChunkSizeRange.max, normalizedChunkSizeRange.min])
  const streamPresetDescription = activeStreamPreset?.description ?? 'Custom min/max window with your own burst profile.'
  const selectedStreamPresetId = activeStreamPreset?.id ?? CUSTOM_STREAM_PRESET_ID
  const streamChunkRangeLabel = `${normalizedChunkSizeRange.min}-${normalizedChunkSizeRange.max}`
  const streamDelayRangeLabel = `${normalizedChunkDelayRange.min}-${normalizedChunkDelayRange.max}ms`
  const {
    content,
    start: startStreamSimulation,
    stop: stopStreamSimulation,
  } = useStreamSimulator({
    source: streamContent,
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    burstiness: normalizedBurstiness / 100,
    sliceMode: streamSliceMode,
    transportMode: streamTransportMode,
  })
  const themeOptions = useMemo(() => [selectedTheme, selectedTheme] as const, [selectedTheme])
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const settingsRootRef = useRef<HTMLDivElement | null>(null)
  const isCompactSettings = useMediaQuery('(max-width: 1023px)')
  const shouldShowSettingsPanel = !isCompactSettings || showSettings
  const isTestPage = currentPath === '/test'
  const isMigrationDemoPage = currentPath === '/migration-demo'
  const isLineNumberHandoffCheck = currentPath === '/line-number-handoff-check'

  useChatAutoScroll(messagesRef, content)

  const navigate = useCallback((pathname: string) => {
    if (typeof window === 'undefined')
      return
    const nextPath = normalizePath(pathname)
    if (nextPath !== normalizePath(window.location.pathname))
      window.history.pushState({}, '', nextPath)
    startTransition(() => {
      setCurrentPath(nextPath)
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const handlePopState = () => {
      startTransition(() => {
        setCurrentPath(normalizePath(window.location.pathname))
      })
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined')
      return
    document.documentElement.classList.toggle('dark', isDark)
    if (typeof window !== 'undefined')
      window.localStorage.setItem(DARK_MODE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    if (streamChunkDelayMin !== normalizedChunkDelayRange.min) {
      setStreamChunkDelayMin(normalizedChunkDelayRange.min)
      return
    }
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STREAM_DELAY_MIN_KEY, String(normalizedChunkDelayRange.min))
  }, [normalizedChunkDelayRange.min, streamChunkDelayMin])

  useEffect(() => {
    if (streamChunkDelayMax !== normalizedChunkDelayRange.max) {
      setStreamChunkDelayMax(normalizedChunkDelayRange.max)
      return
    }
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STREAM_DELAY_MAX_KEY, String(normalizedChunkDelayRange.max))
  }, [normalizedChunkDelayRange.max, streamChunkDelayMax])

  useEffect(() => {
    if (streamChunkSizeMin !== normalizedChunkSizeRange.min) {
      setStreamChunkSizeMin(normalizedChunkSizeRange.min)
      return
    }
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STREAM_CHUNK_MIN_KEY, String(normalizedChunkSizeRange.min))
  }, [normalizedChunkSizeRange.min, streamChunkSizeMin])

  useEffect(() => {
    if (streamChunkSizeMax !== normalizedChunkSizeRange.max) {
      setStreamChunkSizeMax(normalizedChunkSizeRange.max)
      return
    }
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STREAM_CHUNK_MAX_KEY, String(normalizedChunkSizeRange.max))
  }, [normalizedChunkSizeRange.max, streamChunkSizeMax])

  useEffect(() => {
    if (streamBurstiness !== normalizedBurstiness) {
      setStreamBurstiness(normalizedBurstiness)
      return
    }
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STREAM_BURSTINESS_KEY, String(normalizedBurstiness))
  }, [normalizedBurstiness, streamBurstiness])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    window.localStorage.setItem(STREAM_TRANSPORT_MODE_KEY, streamTransportMode)
  }, [streamTransportMode])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    window.localStorage.setItem(STREAM_SLICE_MODE_KEY, streamSliceMode)
  }, [streamSliceMode])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    for (const key of THEME_KEYS)
      window.localStorage.setItem(key, selectedTheme)
  }, [selectedTheme])

  useEffect(() => {
    if (!showSettings || !isCompactSettings)
      return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const root = settingsRootRef.current
      if (!root)
        return
      if (root.contains(event.target as Node))
        return
      setShowSettings(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [isCompactSettings, showSettings])

  useEffect(() => {
    if (!isCompactSettings)
      setShowSettings(false)
  }, [isCompactSettings])

  useEffect(() => {
    if (isTestPage || isMigrationDemoPage || isLineNumberHandoffCheck)
      return
    startStreamSimulation()
    return () => {
      stopStreamSimulation()
    }
  }, [isLineNumberHandoffCheck, isMigrationDemoPage, isTestPage, startStreamSimulation, stopStreamSimulation])

  const goToTest = () => {
    navigate('/test')
  }

  const goToMigrationDemo = () => {
    navigate('/migration-demo')
  }

  const handleStreamPresetChange = (presetId: StreamPresetId) => {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    setStreamChunkDelayMin(preset.chunkDelayMin)
    setStreamChunkDelayMax(preset.chunkDelayMax)
    setStreamChunkSizeMin(preset.chunkSizeMin)
    setStreamChunkSizeMax(preset.chunkSizeMax)
    setStreamBurstiness(preset.burstiness)
  }

  if (isTestPage)
    return <TestLab frameworkLabel="React 18" onGoHome={() => navigate('/')} />

  if (isLineNumberHandoffCheck)
    return <LineNumberHandoffCheck />

  if (isMigrationDemoPage) {
    return (
      <MigrationDemoPage
        isDark={isDark}
        onGoHome={() => navigate('/')}
        onGoTest={() => navigate('/test')}
      />
    )
  }

  return (
    <div className="markstream-vue h-full">
      <div className="flex items-center justify-center p-4 lg:pr-[304px] app-container h-full bg-gray-50 dark:bg-gray-900">
        <div ref={settingsRootRef} className="fixed top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-2">
          {isCompactSettings && (
            <button
              type="button"
              className={`pointer-events-auto settings-toggle w-10 h-10 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-lg dark:shadow-gray-900/20 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${showSettings ? 'ring-2 ring-blue-500/50' : ''}`}
              onClick={() => setShowSettings(value => !value)}
            >
              <Icon
                icon="carbon:settings"
                className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${showSettings ? 'rotate-90' : ''}`}
              />
            </button>
          )}

          {shouldShowSettingsPanel && (
            <div
              className={`pointer-events-auto settings-panel bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl dark:shadow-gray-900/30 p-4 space-y-4 min-w-[220px] w-[280px] overflow-y-auto ${isCompactSettings ? 'absolute top-12 right-0 mt-2 max-h-[calc(100vh-5rem)] origin-top-right transition-all duration-200 ease-out' : 'max-h-[calc(100vh-2rem)]'}`}
            >
              {!isCompactSettings && (
                <div className="flex items-center gap-2 border-b border-gray-200/70 pb-2 dark:border-gray-700/70">
                  <Icon icon="carbon:settings" className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
                    Settings
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Code Theme
                </label>
                <div className="relative theme-selector">
                  <select
                    value={selectedTheme}
                    onChange={event => setSelectedTheme(event.target.value)}
                    className="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                  >
                    {THEMES.map(theme => (
                      <option key={theme} value={theme}>
                        {formatThemeName(theme)}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <Icon icon="carbon:chevron-down" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Stream Profile
                </label>
                <div className="relative">
                  <select
                    value={selectedStreamPresetId}
                    onChange={event => handleStreamPresetChange(event.target.value as StreamPresetId)}
                    className="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                  >
                    {STREAM_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value={CUSTOM_STREAM_PRESET_ID}>Custom</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <Icon icon="carbon:chevron-down" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
                <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                  {streamPresetDescription}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Transport
                </label>
                <div className="relative">
                  <select
                    value={streamTransportMode}
                    onChange={event => setStreamTransportMode(event.target.value as StreamTransportMode)}
                    className="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                  >
                    <option value="readable-stream">ReadableStream</option>
                    <option value="scheduler">Scheduler</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <Icon icon="carbon:chevron-down" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Slice Mode
                </label>
                <div className="relative">
                  <select
                    value={streamSliceMode}
                    onChange={event => setStreamSliceMode(event.target.value as StreamSliceMode)}
                    className="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                  >
                    <option value="pure-random">Pure Random</option>
                    <option value="boundary-aware">Boundary Aware</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <Icon icon="carbon:chevron-down" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  chunkDelayMin
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={8}
                    max={240}
                    step={4}
                    value={streamChunkDelayMin}
                    onChange={event => setStreamChunkDelayMin(Number(event.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkDelayRange.min}
                    ms
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  chunkDelayMax
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={8}
                    max={240}
                    step={4}
                    value={streamChunkDelayMax}
                    onChange={event => setStreamChunkDelayMax(Number(event.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkDelayRange.max}
                    ms
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  chunkSizeMin
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={streamChunkSizeMin}
                    onChange={event => setStreamChunkSizeMin(Number(event.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkSizeRange.min}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  chunkSizeMax
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={streamChunkSizeMax}
                    onChange={event => setStreamChunkSizeMax(Number(event.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkSizeRange.max}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Burstiness
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={streamBurstiness}
                    onChange={event => setStreamBurstiness(Number(event.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                    {normalizedBurstiness}
                    %
                  </span>
                </div>
              </div>

              <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                Active window:
                {' '}
                {streamChunkRangeLabel}
                {' '}
                chars and
                {' '}
                {streamDelayRangeLabel}
                . When min=max, the cadence becomes fixed.
              </p>

              <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                <code>Pure Random</code>
                {' '}
                uses raw random
                <code>slice</code>
                ;
                <code>Boundary Aware</code>
                {' '}
                snaps toward word and punctuation boundaries.
                <code>ReadableStream</code>
                {' '}
                is closest to the real reader path.
              </p>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Dark Mode
                </label>
                <button
                  type="button"
                  className="relative w-12 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:shadow-lg active:scale-95 transition-all duration-200 ease-out"
                  style={{
                    backgroundColor: isDark ? '#3b82f6' : '#e5e7eb',
                    transition: 'background-color 0.35s ease-out, box-shadow 0.2s ease, transform 0.1s ease',
                  }}
                  onClick={() => setIsDark(value => !value)}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md"
                    style={{
                      left: isDark ? '26px' : '2px',
                      transform: `scale(${isDark ? 1.02 : 1})`,
                      transition: 'left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.2s ease-out, box-shadow 0.2s ease',
                    }}
                  >
                    {isDark
                      ? <Icon icon="carbon:moon" className="w-3 h-3 text-blue-600 drop-shadow-sm" />
                      : <Icon icon="carbon:sun" className="w-3 h-3 text-yellow-500 drop-shadow-sm" />}
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="chatbot-container max-w-5xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="chatbot-header px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Icon icon="carbon:chat" className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    markstream-react18
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Streaming markdown demo
                  </p>
                </div>
              </div>

              <div className="flex">
                <a
                  href="https://github.com/Simon-He95/markstream-vue"
                  target="_blank"
                  rel="noreferrer"
                  className="github-star-btn flex items-center gap-2 px-3 py-1.5 bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <Icon icon="carbon:star" className="w-4 h-4" />
                  <span>Star</span>
                </a>
                <button
                  type="button"
                  className="ml-2 test-page-btn flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  title="Go to Test page"
                  onClick={goToTest}
                >
                  <Icon icon="carbon:rocket" className="w-4 h-4" />
                  <span>Test</span>
                </button>
                <button
                  type="button"
                  className="ml-2 migration-demo-btn flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-lg transition-all duration-200 shadow-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  title="Open the react-markdown migration demo"
                  onClick={goToMigrationDemo}
                >
                  <Icon icon="carbon:data-structured" className="w-4 h-4" />
                  <span>Migration</span>
                </button>
              </div>
            </div>
          </div>

          <main ref={messagesRef} className="chatbot-messages flex-1 overflow-y-auto mr-[1px] mb-4 flex flex-col">
            <div className="chatbot-renderer-shell">
              <MemoizedNodeRenderer
                content={content}
                codeBlockDarkTheme={selectedTheme}
                codeBlockLightTheme={selectedTheme}
                themes={themeOptions}
                isDark={isDark}
                customId={PLAYGROUND_CUSTOM_ID}
                customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                deferNodesUntilVisible={false}
                maxLiveNodes={2000}
                liveNodeBuffer={200}
                viewportPriority={false}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
