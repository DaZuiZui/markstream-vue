declare module 'stream-diffs/markstream' {
  export function preloadStreamDiffs(): Promise<unknown>
  export function useMonaco(options?: Record<string, unknown>): any
}
