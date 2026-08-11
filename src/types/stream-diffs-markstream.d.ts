declare module 'stream-diffs/markstream' {
  export function detectLanguage(code: string): string
  export function preloadStreamDiffs(): Promise<unknown>
  export function useMonaco(options?: Record<string, unknown>): unknown
}
